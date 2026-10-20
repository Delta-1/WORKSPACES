import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const VOICE_MIME = 'audio/ogg; codecs=opus';
export const VOICE_PIPELINE_VERSION = 3;
export const COMPAT_AUDIO_MIME = 'audio/mpeg';
const MAX_BYTES = 16 * 1024 * 1024;

function transcode(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { timeout: 60000, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'pipe'] });
    let diagnostic = '';
    child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Conversão de áudio falhou (${code}): ${diagnostic}`)));
  });
}

/** Never label browser WebM/AAC/MP3 bytes as a WhatsApp voice note. */
export async function prepareVoiceAudio(input, binary, format = 'voice') {
  if (!binary) throw new Error('Conversor de áudio indisponível. A gravação não foi enviada.');
  if (!Buffer.isBuffer(input) || !input.length || input.length > MAX_BYTES) {
    throw new Error('Áudio vazio ou maior que 16 MB. Grave novamente ou escolha um arquivo menor.');
  }
  const dir = await mkdtemp(join(tmpdir(), 'workspace-voice-'));
  try {
    const source = join(dir, 'source');
    const compatible = format === 'mp3';
    const ogg = join(dir, compatible ? 'audio.mp3' : 'voice.ogg');
    const pcm = join(dir, 'voice.pcm');
    await writeFile(source, input);
    // Decode once; explicit container, mono Opus and speech framing for native clients.
    // PCM also provides duration/waveform without Baileys' optional audio decoders.
    await transcode(binary, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source,
      '-t', '3601', '-map', '0:a:0', '-vn', '-map_metadata', '-1',
      ...(compatible ? ['-c:a', 'libmp3lame', '-b:a', '96k', '-ar', '44100', '-ac', '1', '-f', 'mp3']
        : ['-c:a', 'libopus', '-application', 'voip', '-frame_duration', '20', '-b:a', '32k', '-ar', '48000', '-ac', '1', '-f', 'ogg']), ogg,
      '-t', '3601', '-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le', '-ar', '8000', '-ac', '1', '-f', 's16le', pcm]);
    const [audio, samples] = await Promise.all([readFile(ogg), readFile(pcm)]);
    const head = audio.indexOf(Buffer.from('OpusHead'));
    if ((!compatible && (audio.subarray(0, 4).toString() !== 'OggS' || head < 0 || audio[head + 9] !== 1)) || audio.length < 32 || audio.length > MAX_BYTES || samples.length < 2 || samples.length > 3600 * 16000) {
      throw new Error('O arquivo convertido não contém uma nota de voz válida.');
    }
    const sampleCount = Math.floor(samples.length / 2);
    const peaks = Array.from({ length: 64 }, (_, bucket) => {
      let peak = 0;
      const start = Math.floor(bucket * sampleCount / 64);
      const end = Math.floor((bucket + 1) * sampleCount / 64);
      for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(samples.readInt16LE(i * 2)));
      return peak;
    });
    const max = Math.max(...peaks);
    const waveform = Uint8Array.from(peaks, p => max ? Math.round(p / max * 100) : 0);
    return compatible
      ? { audio, mimetype: COMPAT_AUDIO_MIME, ptt: false, seconds: Math.max(1, Math.ceil(sampleCount / 8000)) }
      : { audio, mimetype: VOICE_MIME, ptt: true, seconds: Math.max(1, Math.ceil(sampleCount / 8000)), waveform };
  } catch (error) {
    // Preserve diagnostics in server logs; return a useful error without temp paths.
    console.error('prepareVoiceAudio failed:', error?.message || error);
    throw new Error('Não foi possível preparar um áudio compatível com o WhatsApp. A gravação não foi enviada; tente novamente.');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const prepareCompatibleAudio = (input, binary) => prepareVoiceAudio(input, binary, 'mp3');

/** Offline startup check: no account, upload or message sent. */
export function audioProbeWav() {
  const rate = 8000, count = 1600, wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 12000), 44 + i * 2);
  return wav;
}

export async function checkVoiceAudio(binary) {
  const wav = audioProbeWav();
  const content = await prepareVoiceAudio(wav, binary);
  const compatible = await prepareCompatibleAudio(wav, binary);
  return content.audio.length > 0 && content.waveform.some(v => v > 0) && compatible.audio.length > 0 && compatible.mimetype === COMPAT_AUDIO_MIME && compatible.ptt === false;
}
