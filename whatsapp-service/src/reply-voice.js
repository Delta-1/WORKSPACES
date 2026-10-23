/** Mirror incoming audio. Text stays text except a sparse, repeatable short voice reply. */
export function replyWantsVoice({ wasAudio, requested, enabled = true, messageId = '', text = '' }) {
  if (!enabled || requested === 'text') return false;
  if (requested === 'audio' || wasAudio) return true;
  if (!messageId || !text || text.length > 160 || /https?:|\d{5,}|\n/.test(text)) return false;
  return [...messageId].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 8 === 0;
}
export function requestedReplyMode(text = '') {
  if (/(responde|manda|escreve|prefiro|pode ser).{0,20}(por )?texto|n[aã]o posso (ouvir|escutar)|sem [aá]udio|por escrito/i.test(text)) return 'text';
  if (/(responde|manda|prefiro|pode ser|volta).{0,20}(por )?([aá]udio|voz)|fala comigo|me manda [aá]udio/i.test(text)) return 'audio';
  return null;
}
export function pcmWave(pcm, rate = 24000) {
  if (!pcm.length || pcm.length % 2 || pcm.length > 32 * 1024 * 1024 || rate < 8000 || rate > 48000) throw Error('Invalid generated speech');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}
export async function geminiSpeech(text, key, fetcher = fetch) {
  if (!key || !text?.trim()) return null;
  const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(45000),
    body: JSON.stringify({ contents: [{ parts: [{ text: `Leia naturalmente o texto a seguir, no idioma em que ele está escrito. Não acrescente frases.\n\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } } }),
  });
  if (!response.ok) throw Error(`Gemini speech HTTP ${response.status}`);
  const result = await response.json();
  const part = result.candidates?.flatMap(c => c.content?.parts || []).find(p => p.inlineData?.data);
  const mime = part?.inlineData?.mimeType || '';
  if (!/^audio\/(L16|pcm)(;|$)/i.test(mime)) throw Error('Gemini did not return PCM speech');
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] || 24000);
  return pcmWave(Buffer.from(part.inlineData.data, 'base64'), rate);
}
