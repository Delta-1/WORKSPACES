import test from 'node:test';
import assert from 'node:assert/strict';
import { replyWantsVoice, requestedReplyMode, pcmWave, geminiSpeech } from '../src/reply-voice.js';
import { normalizeMessageContent } from 'baileys';

test('audio replies mirror the customer and respect explicit text and disabled voice', () => {
  assert.equal(replyWantsVoice({wasAudio:true}), true);
  assert.equal(replyWantsVoice({wasAudio:true, requested:'text'}), false);
  assert.equal(replyWantsVoice({wasAudio:true, enabled:false}), false);
  assert.equal(replyWantsVoice({wasAudio:false, requested:'audio'}), true);
  assert.equal(requestedReplyMode('Não posso ouvir agora, responde por texto'), 'text');
  assert.equal(requestedReplyMode('me manda áudio por favor'), 'audio');
});
test('short text occasionally gets voice, but links and codes stay readable', () => {
  const choices=Array.from({length:80},(_,i)=>replyWantsVoice({messageId:`test-${i}`,text:'Olá, tudo bem?'}));
  assert.ok(choices.some(Boolean)); assert.ok(choices.some(value=>!value));
  for(const text of ['https://exemplo.com','Seu código 123456','linha um\nlinha dois']) assert.equal(replyWantsVoice({messageId:'H',text}),false);
});
test('Gemini speech uses the existing key and produces PCM WAV for Opus conversion', async () => {
  const pcm=Buffer.alloc(4800,12);
  const speech=await geminiSpeech('Teste de voz','fixture-key',async(url,options)=>{
    assert.match(url,/gemini-2.5-flash-preview-tts/);
    assert.equal(options.headers['x-goog-api-key'],'fixture-key');
    assert.deepEqual(JSON.parse(options.body).generationConfig.responseModalities,['AUDIO']);
    return {ok:true,json:async()=>({candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:pcm.toString('base64')}}]}}]})};
  });
  assert.equal(speech.toString('ascii',0,4),'RIFF');
  assert.equal(speech.readUInt32LE(24),24000);
  assert.deepEqual(speech.subarray(44),pcm);
});
test('provider failures cannot be mistaken for generated audio or expose keys', async () => {
  assert.equal(await geminiSpeech('Hello',null),null);
  await assert.rejects(geminiSpeech('Hello','private-key',async()=>({ok:false,status:403})),/^Error: Gemini speech HTTP 403$/);
  await assert.rejects(geminiSpeech('Hello','key',async()=>({ok:true,json:async()=>({candidates:[]})})),/did not return PCM/);
  assert.throws(()=>pcmWave(Buffer.alloc(1)),/Invalid generated speech/);
});
test('incoming ephemeral and view-once audio are unwrapped for history and transcription', () => {
  const audio={audioMessage:{mimetype:'audio/ogg; codecs=opus',ptt:true}};
  assert.deepEqual(normalizeMessageContent({ephemeralMessage:{message:audio}}),audio);
  assert.deepEqual(normalizeMessageContent({viewOnceMessageV2:{message:audio}}),audio);
  assert.deepEqual(normalizeMessageContent({documentWithCaptionMessage:{message:{documentMessage:{caption:'Arquivo'}}}}),{documentMessage:{caption:'Arquivo'}});
});
