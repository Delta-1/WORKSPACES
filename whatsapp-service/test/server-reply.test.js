import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { prepareReply } from '../src/message-reply.js';
import { normalizeJid } from '../src/chat-identity.js';
import { signedText } from '../src/attendant-signature.js';
const source=await readFile(new URL('../src/server.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('async function sendMessage('),source.indexOf('// No boot, retoma automaticamente'));
function fixture({foreign=false,assignee='staff'}={}){
 const original={id:'original',company_id:'company',wa_id:'native-original',direction:'in',text:'Pergunta do cliente',conversations:{company_id:'company',number_id:'number',contact_id:foreign?'another-contact':'contact'}};
 const conversation={id:'conversation',company_id:'company',number_id:'number',contact_id:'contact',assignee_id:assignee,status:'atendendo'};
 const sends=[],history=[];const session={state:{status:'connected'},sock:{sendMessage:async(jid,content,options)=>{sends.push({jid,content,options});return {key:{id:'native-new',remoteJid:jid,fromMe:true}};}}};
 const db={from(table){const q={select(){return q;},eq(){return q;},update(){return q;},async maybeSingle(){return {data:table==='whatsapp_numbers'?{company_id:'company'}:table==='conversations'?conversation:original};},then(resolve){return Promise.resolve({}).then(resolve);}};return q;}};
 const context={getSession:()=>session,normalizeJid,supabase:db,prepareReply,resolveAttendantSignature:async()=>({name:'Vanessa',position:'top'}),signedText,logMessage:async(...args)=>{history.push(args);return 'saved';},webSentWaIds:new Set(),savedMessageKey:key=>key,mediaLabel:(_,text)=>text,setTimeout:()=>{},console,Error};
 const send=vm.runInNewContext(handler+';sendMessage',context);
 return {send,sends,history};
}
test('service sends native quoted options and persists the exact source snapshot',async()=>{const f=fixture();await f.send('number','123:4@lid','Resposta','staff',null,null,'conversation','original');assert.equal(f.sends.length,1);assert.equal(f.sends[0].jid,'123@lid');assert.equal(f.sends[0].options.quoted.key.id,'native-original');assert.match(f.sends[0].content.text,/Vanessa/);assert.equal(f.history[0].at(-1).id,'original');});
test('normal sending keeps working without quoted context',async()=>{const f=fixture();await f.send('number','123@lid','Mensagem normal','staff',null,null,'conversation');assert.equal(f.sends.length,1);assert.equal(f.sends[0].options.quoted,undefined);assert.equal(f.history[0].at(-1),undefined);});
test('foreign source and transferred attendance are rejected before any relay',async()=>{for(const options of [{foreign:true},{assignee:'another-staff'}]){const f=fixture(options);await assert.rejects(f.send('number','123@lid','Resposta','staff',null,null,'conversation','original'));assert.equal(f.sends.length,0);assert.equal(f.history.length,0);}});
