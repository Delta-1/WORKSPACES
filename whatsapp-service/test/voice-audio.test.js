import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createHmac, createDecipheriv } from 'node:crypto';
import { prepareVoiceAudio, prepareCompatibleAudio, checkVoiceAudio, VOICE_MIME, COMPAT_AUDIO_MIME } from '../src/voice-audio.js';
import { inspectOpusOgg } from '../src/ogg.js';
import { prepareWAMessageMedia, getMediaKeys } from 'baileys';

const binary = process.env.FFMPEG_PATH || 'ffmpeg';
const available = spawnSync(binary, ['-version']).status === 0;
if (process.env.CI) assert.ok(available, 'FFmpeg must be installed in CI');
const logger = { debug() {}, info() {}, warn() {}, error() {}, trace() {} };

for (const [format, codec] of [['webm', 'libopus'], ['mp4', 'aac'], ['mp3', 'libmp3lame'], ['ogg', 'libopus']]) {
  test(`${format} recording becomes a decodable, encrypted WhatsApp voice note`, { skip: !available }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'voice-test-'));
    try {
      const source = join(dir, `recording.${format}`);
      const generated = spawnSync(binary, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.35', '-c:a', codec, source]);
      assert.equal(generated.status, 0, generated.stderr?.toString());
      const original = await readFile(source);
      const compatible = await prepareCompatibleAudio(original, binary);
      assert.equal(compatible.mimetype, COMPAT_AUDIO_MIME);
      assert.equal(compatible.ptt, false);
      const mp3Path = join(dir, 'compatible.mp3');
      await writeFile(mp3Path, compatible.audio);
      const mp3Played = spawnSync(binary, ['-v', 'error', '-i', mp3Path, '-f', 'null', '-']);
      assert.equal(mp3Played.status, 0, mp3Played.stderr?.toString());
      let uploadedMp3;
      const mp3Message = await prepareWAMessageMedia(compatible, { logger, upload: async file => {
        uploadedMp3 = await readFile(file);
        return { mediaUrl: 'https://media.test/mp3', directPath: '/mp3' };
      } });
      assert.equal(mp3Message.audioMessage.mimetype, 'audio/mpeg');
      assert.equal(mp3Message.audioMessage.ptt, false);
      const mp3Keys = await getMediaKeys(mp3Message.audioMessage.mediaKey, 'audio');
      const mp3Decrypt = createDecipheriv('aes-256-cbc', mp3Keys.cipherKey, mp3Keys.iv);
      assert.deepEqual(Buffer.concat([mp3Decrypt.update(uploadedMp3.subarray(0,-10)),mp3Decrypt.final()]), compatible.audio);
      const voice = await prepareVoiceAudio(original, binary);
      assert.equal(voice.mimetype, VOICE_MIME);
      assert.equal(voice.ptt, true);
      assert.equal(voice.seconds, 1);
      assert.equal(voice.waveform.length, 64);
      assert.ok(voice.waveform.some(v => v > 0));
      assert.equal(voice.audio.subarray(0, 4).toString(), 'OggS');
      assert.equal(voice.fileName, 'audio.ogg');
      const inspected = inspectOpusOgg(voice.audio);
      assert.equal(inspected.channels, 1);assert.ok(inspected.duration > 0.2 && inspected.duration < 0.6);
      const corrupt = Buffer.from(voice.audio);corrupt[corrupt.length - 1] ^= 1;
      assert.throws(() => inspectOpusOgg(corrupt), /checksum/);
      assert.throws(() => inspectOpusOgg(voice.audio.subarray(0, -1)), /Truncated/);
      const normalized = join(dir, 'normalized.ogg');
      await writeFile(normalized, voice.audio);
      const played = spawnSync(binary, ['-v', 'error', '-i', normalized, '-f', 'null', '-']);
      assert.equal(played.status, 0, played.stderr?.toString());
      // Prove the payload Baileys uploads decrypts back to the exact normalized file.
      let encrypted;
      const prepared = await prepareWAMessageMedia(voice, { logger, upload: async file => {
        encrypted = await readFile(file);
        return { mediaUrl: 'https://media.test/voice', directPath: '/voice' };
      } });
      const message = prepared.audioMessage;
      assert.equal(message.mimetype, VOICE_MIME);
      assert.equal(message.ptt, true);
      assert.equal(message.seconds, 1);
      assert.equal(Number(message.fileLength), voice.audio.length);
      assert.equal(message.waveform.length, 64);
      const { cipherKey, iv, macKey } = await getMediaKeys(message.mediaKey, 'audio');
      const body = encrypted.subarray(0, -10);
      const mac = createHmac('sha256', macKey).update(iv).update(body).digest().subarray(0, 10);
      assert.deepEqual(encrypted.subarray(-10), mac);
      const decrypt = createDecipheriv('aes-256-cbc', cipherKey, iv);
      const decoded = Buffer.concat([decrypt.update(body), decrypt.final()]);
      assert.deepEqual(decoded, voice.audio);
      assert.deepEqual(createHash('sha256').update(decoded).digest(), message.fileSha256);
      assert.deepEqual(createHash('sha256').update(encrypted).digest(), message.fileEncSha256);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}

test('unavailable converter, corrupt and empty recordings fail without a raw audio fallback', async () => {
  await assert.rejects(prepareVoiceAudio(Buffer.from('data'), null), /indisponível/);
  await assert.rejects(prepareVoiceAudio(Buffer.alloc(0), binary), /vazio/);
  await assert.rejects(prepareVoiceAudio(Buffer.alloc(16 * 1024 * 1024 + 1), binary), /16 MB/);
  if (available) await assert.rejects(prepareVoiceAudio(Buffer.from('not an audio file'), binary), /não foi enviada/);
});
test('startup codec self-test runs offline', { skip: !available }, async () => {
  assert.equal(await checkVoiceAudio(binary), true);
});

test('browser timestamps are reset before encoding a native voice note', {skip:!available}, async()=>{
 const dir=await mkdtemp(join(tmpdir(),'voice-timestamp-'));
 try {
  const source=join(dir,'offset.webm');
  const generated=spawnSync(binary,['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=0.4','-af','asetpts=PTS+300/TB','-c:a','libopus',source]);
  assert.equal(generated.status,0,generated.stderr?.toString());
  const voice=await prepareVoiceAudio(await readFile(source),binary);
  assert.equal(voice.seconds,1);assert.ok(inspectOpusOgg(voice.audio).duration<1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
