import test from 'node:test';
import assert from 'node:assert/strict';
import { createMessageLane, persistIncoming } from '../src/message-ingestion.js';
import { resolveIncomingIdentity } from '../src/chat-identity.js';
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('a stalled bot cannot delay saving the next customer reply in the same batch',async()=>{
 const intake=createMessageLane(),bots=createMessageLane(),blocked=defer(),events=[];
 let firstReply,secondReply;
 await intake.run('number:chat',async()=>{events.push('saved:first');firstReply=bots.run('chat',async()=>{events.push('bot:first');await blocked.promise;});});
 await intake.run('number:chat',async()=>{events.push('saved:second');secondReply=bots.run('chat',()=>events.push('bot:second'));});
 assert.deepEqual(events,['saved:first','bot:first','saved:second']);
 blocked.resolve();await Promise.all([firstReply,secondReply]);
 assert.deepEqual(events,['saved:first','bot:first','saved:second','bot:second']);assert.equal(intake.size,0);assert.equal(bots.size,0);
});
test('one chat and a failed media task do not block other chats or later messages',async()=>{
 const work=createMessageLane(),blocked=defer();
 const slow=work.run('a',()=>blocked.promise);
 assert.equal(await work.run('b',()=>42),42);
 blocked.resolve();await slow;
 await assert.rejects(work.run('a',()=>{throw Error('download failed');}));
 assert.equal(await work.run('a',()=>99),99);assert.equal(work.size,0);
});
test('temporary database errors are retried; permanent failure never reports persistence',async()=>{
 let calls=0;const waits=[];
 assert.equal(await persistIncoming(()=>{if(++calls<3)throw Error('temporary');return 'saved-id';},async ms=>waits.push(ms)),'saved-id');
 assert.equal(calls,3);assert.deepEqual(waits,[150,300]);
 await assert.rejects(persistIncoming(()=>null,async()=>{}),/not saved/);
});
test('LID-only customer replies resolve to the phone contact used by earlier bot replies',async()=>{
 const sock={signalRepository:{lidMapping:{getPNForLID:async lid=>{assert.equal(lid,'123@lid');return '5511999999999@s.whatsapp.net';}}}};
 const result=await resolveIncomingIdentity({remoteJid:'123:2@lid'},sock);
 assert.equal(result.phone,'5511999999999');assert.ok(result.aliases.includes('123@lid'));
 const dual=await resolveIncomingIdentity({remoteJid:'123@lid',remoteJidAlt:'5511999999999@s.whatsapp.net'},null);
 assert.equal(dual.phone,result.phone);
 const unavailable=await resolveIncomingIdentity({remoteJid:'123@lid'},null);assert.equal(unavailable.phone,'123');
});
