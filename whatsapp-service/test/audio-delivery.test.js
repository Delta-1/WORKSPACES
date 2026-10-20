import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAudioDelivery, createAudioRetryStore } from '../src/audio-delivery.js';

async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'delivery-test-'));
  const bytes = Buffer.from('encrypted-audio-payload-with-authentication-tag');
  const file = join(dir, 'encrypted'); await writeFile(file, bytes);
  try { await run({file, bytes, hash:createHash('sha256').update(bytes).digest('base64')}); }
  finally { await rm(dir,{recursive:true,force:true}); }
}
const target='5511999991111@s.whatsapp.net';
function socket(file,hash){
  const metrics={uploads:0,refreshes:0,relays:0,saves:0};
  const sock={waUploadToServer:async()=>{metrics.uploads++;return{mediaUrl:'https://mmg.whatsapp.net/test',directPath:'/test'};},refreshMediaConn:async()=>{metrics.refreshes++;},sendMessage:async(jid,content,options)=>{
    if(content.audio)await options.upload(file,{fileEncSha256B64:hash,mediaType:'audio'});
    metrics.relays++;return{key:{id:'message-1',remoteJid:jid},message:{audioMessage:{mimetype:'audio/mpeg'}}};
  }};
  return{sock,metrics,retry:{save:async()=>{metrics.saves++;}}};
}
test('checks real encrypted upload bytes before relaying the audio pointer',()=>fixture(async({file,bytes,hash})=>{
  const {sock,metrics,retry}=socket(file,hash),health={};
  installAudioDelivery(sock,retry,{health,fetcher:async()=>new Response(bytes)});
  const sent=await sock.sendMessage(target,{audio:Buffer.from('mp3'),ptt:false});
  assert.equal(sent.key.id,'message-1');assert.equal(metrics.relays,1);assert.equal(health.verifiedUploads,1);assert.equal(metrics.saves,1);
}));
test('expired CDN URL refreshes upload once before a single relay',()=>fixture(async({file,bytes,hash})=>{
  const {sock,metrics,retry}=socket(file,hash);let downloads=0;
  installAudioDelivery(sock,retry,{fetcher:async()=>++downloads===1?new Response('',{status:404}):new Response(bytes)});
  await sock.sendMessage(target,{audio:Buffer.from('mp3')});
  assert.equal(metrics.uploads,2);assert.equal(metrics.refreshes,1);assert.equal(metrics.relays,1);
}));
for(const kind of ['empty','corrupt','truncated','unavailable'])test(`does not relay a ${kind} WhatsApp media object`,()=>fixture(async({file,bytes,hash})=>{
  const {sock,metrics,retry}=socket(file,hash);
  installAudioDelivery(sock,retry,{fetcher:async()=>kind==='unavailable'?new Response('',{status:403}):new Response(kind==='empty'?Buffer.alloc(0):kind==='truncated'?bytes.subarray(0,-1):Buffer.alloc(bytes.length,1))});
  await assert.rejects(sock.sendMessage(target,{audio:Buffer.from('mp3')}),/interrompido/);
  assert.equal(metrics.relays,0);assert.equal(metrics.saves,0);assert.equal(metrics.uploads,2);
}));
test('post-send persistence failure is not reported as a failed send',()=>fixture(async({file,bytes,hash})=>{
  const {sock,metrics}=socket(file,hash);installAudioDelivery(sock,{save:async()=>{throw Error('db unavailable');}},{fetcher:async()=>new Response(bytes)});
  await sock.sendMessage(target,{audio:Buffer.from('mp3')});assert.equal(metrics.relays,1);
}));
test('text messages keep their original path',async()=>{
  let uploads=0;const sock={sendMessage:async()=>({ok:true}),waUploadToServer:async()=>{uploads++;}};
  installAudioDelivery(sock,{save:async()=>assert.fail('text should not enter audio store')});
  assert.deepEqual(await sock.sendMessage(target,{text:'hi'}),{ok:true});assert.equal(uploads,0);
});
function database(){
 const rows=new Map();return{from(table){assert.equal(table,'wa_auth');return{
  async upsert(row){rows.set(row.number_id+'/'+row.key,structuredClone(row));return{};},
  select(){const filters={};const q={eq(k,v){filters[k]=v;return q;},async maybeSingle(){return{data:rows.get(filters.number_id+'/'+filters.key)||null};}};return q;},
  delete(){const q={eq(){return q;},like(){return q;},async lt(){return{};}};return q;}
 };}};
}
test('retry lookup survives restart, but isolates numbers/chats and expires',async()=>{
 const db=database();let clock=Date.now();const args={db,numberId:'number-a',encode:m=>JSON.stringify(m),decode:v=>JSON.parse(v),now:()=>clock};
 const msg={audioMessage:{mimetype:'audio/mpeg',mediaKey:'private-key'}};
 await createAudioRetryStore(args).save({key:{id:'sent',remoteJid:target},message:msg});
 const restarted=createAudioRetryStore(args);
 assert.deepEqual(await restarted.get({id:'sent',remoteJid:target}),msg);
 assert.equal(await restarted.get({id:'sent',remoteJid:'other@s.whatsapp.net'}),undefined);
 assert.equal(await createAudioRetryStore({...args,numberId:'number-b'}).get({id:'sent',remoteJid:target}),undefined);
 clock+=8*24*60*60*1000;
 assert.equal(await restarted.get({id:'sent',remoteJid:target}),undefined);
});

test('follows CDN redirects but rejects a redirect outside WhatsApp/Meta',()=>fixture(async({file,bytes,hash})=>{
  const good=socket(file,hash);let calls=0;
  installAudioDelivery(good.sock,good.retry,{fetcher:async()=>++calls===1?new Response(null,{status:302,headers:{location:'https://cdn.fbsbx.com/audio'}}):new Response(bytes)});
  await good.sock.sendMessage(target,{audio:Buffer.from('mp3')});assert.equal(good.metrics.relays,1);
  const bad=socket(file,hash);let unsafeFetches=0;
  installAudioDelivery(bad.sock,bad.retry,{fetcher:async url=>{if(String(url).includes('attacker.test'))unsafeFetches++;return new Response(null,{status:302,headers:{location:'https://attacker.test/audio'}});}});
  await assert.rejects(bad.sock.sendMessage(target,{audio:Buffer.from('mp3')}),/interrompido/);
  assert.equal(unsafeFetches,0);assert.equal(bad.metrics.relays,0);
}));

test('Baileys protobuf media keys survive persistent retry serialization',async()=>{
  const {proto}=await import('baileys');
  const db=database();const args={db,numberId:'number-a',encode:m=>Buffer.from(proto.Message.encode(m).finish()).toString('base64'),decode:v=>proto.Message.decode(Buffer.from(v,'base64'))};
  const message=proto.Message.fromObject({audioMessage:{mimetype:'audio/mpeg',mediaKey:Buffer.alloc(32,7),fileSha256:Buffer.alloc(32,9),fileLength:123,seconds:2,ptt:false}});
  await createAudioRetryStore(args).save({key:{id:'proto-sent',remoteJid:target},message});
  const recovered=await createAudioRetryStore(args).get({id:'proto-sent',remoteJid:target});
  assert.deepEqual(Buffer.from(recovered.audioMessage.mediaKey),Buffer.alloc(32,7));
  assert.equal(Number(recovered.audioMessage.fileLength),123);assert.equal(recovered.audioMessage.ptt,false);
});
