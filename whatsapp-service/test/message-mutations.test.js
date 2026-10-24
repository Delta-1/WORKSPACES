import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWAMessageContent, proto } from 'baileys';
import { mutateWhatsappMessage, syncWhatsappMutation } from '../src/message-mutations.js';
import { savedMessageKey, validateMessageMutation } from '../src/message-policy.js';

const NOW = Date.parse('2026-10-21T12:00:00Z');
const original = () => ({id:'message',conversation_id:'conversation',direction:'out',sender_id:'alice',company_id:'company',wa_id:'ORIGINAL',wa_key:{id:'ORIGINAL',remoteJid:'123@lid',fromMe:true},at:new Date(NOW-60000).toISOString(),text:'Original',media_type:null,media_url:null,edited_at:null,deleted_at:null,conversations:{company_id:'company',number_id:'number',contacts:{jid:'123@lid'}}});
function fixture(overrides={}) {
 const row={...original(),...overrides};const rows=[row];const preview={last_message:row.text};const calls=[];let fail=0;
 const db={failWrites(n){fail=n;},from(table){
  let patch=null,filters=[],limit=null;
  const q={select(){return q;},eq(k,v){filters.push(r=>k.startsWith('conversations.')?r.conversations?.[k.split('.')[1]]===v:r[k]===v);return q;},is(k,v){filters.push(r=>(r[k]??null)===v);return q;},limit(n){limit=n;return q;},order(){return q;},update(p){patch=p;return q;},then(ok,no){return run().then(ok,no);},maybeSingle(){return run().then(r=>({...r,data:Array.isArray(r.data)?r.data[0]??null:r.data}));}};
  async function run(){
   if(table==='profiles')return {data:{id:'alice',company_id:'company'},error:null};
   if(table==='conversations'){if(patch)Object.assign(preview,patch);return {data:preview,error:null};}
   let result=rows.filter(r=>filters.every(f=>f(r)));if(limit)result=result.slice(0,limit);
   if(patch){if(fail-->0)return {data:null,error:{message:'temporary database error'}};for(const r of result)Object.assign(r,patch);}
   return {data:result.map(r=>structuredClone(r)),error:null};
  }return q;
 }};
 const sock={async sendMessage(jid,content){calls.push({jid,content,oldText:row.text,wasDeleted:row.deleted_at});return {key:{id:'OPERATION'}};}};
 return {row,rows,db,sock,calls,preview,args:{db,sock,messageId:'message',numberId:'number',companyId:'company',actorId:'alice',now:NOW}};
}

test('edit submits original WhatsApp key before changing history and serializes as MESSAGE_EDIT',async()=>{
 const f=fixture();const result=await mutateWhatsappMessage({...f.args,action:'edit',text:'  Corrected  '});
 assert.equal(f.calls[0].oldText,'Original');assert.equal(f.calls[0].jid,'123@lid');assert.deepEqual(f.calls[0].content,{text:'Corrected',edit:f.row.wa_key});
 const payload=await generateWAMessageContent(f.calls[0].content,{});assert.equal(payload.protocolMessage.type,proto.Message.ProtocolMessage.Type.MESSAGE_EDIT);assert.equal(payload.protocolMessage.key.id,'ORIGINAL');
 assert.equal(f.row.text,'Corrected');assert.equal(f.row.edited_at,new Date(NOW).toISOString());assert.equal(f.preview.last_message,'Corrected');assert.equal(result.message.id,'message');
});
test('delete sends native REVOKE and scrubs media only after WhatsApp confirms',async()=>{
 const f=fixture({media_type:'audio',media_url:'https://example.invalid/voice.mp3',media_name:'voice.mp3',media_mime:'audio/mpeg'});
 await mutateWhatsappMessage({...f.args,action:'delete'});
 const payload=await generateWAMessageContent(f.calls[0].content,{});assert.equal(payload.protocolMessage.type,proto.Message.ProtocolMessage.Type.REVOKE);assert.equal(payload.protocolMessage.key.id,'ORIGINAL');
 assert.equal(f.calls[0].wasDeleted,null);assert.equal(f.row.media_url,null);assert.equal(f.row.text,null);assert.equal(f.row.deleted_at,new Date(NOW).toISOString());assert.equal(f.preview.last_message,'Mensagem apagada');
});
test('refusal or missing WhatsApp confirmation leaves original message intact',async()=>{
 for(const outcome of ['throw','no-key']){const f=fixture();f.sock.sendMessage=async()=>{if(outcome==='throw')throw Error('WhatsApp refused');return {};};await assert.rejects(mutateWhatsappMessage({...f.args,action:'delete'}));assert.equal(f.row.deleted_at,null);assert.equal(f.row.text,'Original');}
});
test('ownership, company, channel, deleted state, text/media and deadline are enforced before submit',async()=>{
 const options={action:'edit',actorId:'alice',companyId:'company',numberId:'number',text:'New',now:NOW};
 for(const patch of [{sender_id:'bob'},{direction:'in'},{wa_id:null},{deleted_at:new Date(NOW).toISOString()},{media_type:'image'},{at:new Date(NOW-15*60000).toISOString()},{conversations:{company_id:'other',number_id:'number'}},{conversations:{company_id:'company',number_id:'other'}}])assert.throws(()=>validateMessageMutation({...original(),...patch},options));
 assert.throws(()=>validateMessageMutation(original(),{...options,text:' '}));
 assert.throws(()=>validateMessageMutation({...original(),at:new Date(NOW-48*3600000).toISOString()},{...options,action:'delete'}));
 const f=fixture({sender_id:'bob'});await assert.rejects(mutateWhatsappMessage({...f.args,action:'delete'}));assert.equal(f.calls.length,0);
});
test('database retry never retransmits the WhatsApp operation',async()=>{const f=fixture();f.db.failWrites(1);await mutateWhatsappMessage({...f.args,action:'edit',text:'New'});assert.equal(f.calls.length,1);assert.equal(f.row.text,'New');});
test('group participant key preserved; old 1:1 records can use stored canonical JID',async()=>{
 const f=fixture({wa_key:{id:'ORIGINAL',remoteJid:'group@g.us',participant:'me@s.whatsapp.net',fromMe:true}});await mutateWhatsappMessage({...f.args,action:'delete'});assert.equal(f.calls[0].content.delete.participant,'me@s.whatsapp.net');
 const legacy=fixture({wa_key:null});await mutateWhatsappMessage({...legacy.args,action:'edit',text:'New'});assert.equal(legacy.calls[0].content.edit.remoteJid,'123@lid');
 assert.deepEqual(savedMessageKey({id:'id',remoteJid:'chat',fromMe:true,mediaKey:'secret'}),{id:'id',remoteJid:'chat',fromMe:true});
});
test('linked-device edit and revoke update the same row; deleted messages cannot be resurrected',async()=>{
 const f=fixture();const base={db:f.db,numberId:'number',key:{id:'ORIGINAL',remoteJid:'123@lid'},revokedStubType:1,now:NOW};
 await syncWhatsappMutation({...base,update:{message:{editedMessage:{message:{conversation:'Edited on phone'}}},messageTimestamp:NOW/1000}});assert.equal(f.row.text,'Edited on phone');
 await syncWhatsappMutation({...base,update:{message:null,messageStubType:1}});assert.ok(f.row.deleted_at);
 await syncWhatsappMutation({...base,update:{message:{editedMessage:{message:{conversation:'Late edit'}}}}});assert.equal(f.row.text,null);
});
test('events from another chat or channel and ordinary receipts do not alter history',async()=>{
 const f=fixture();for(const [numberId,remoteJid] of [['other','123@lid'],['number','other@lid']])await syncWhatsappMutation({db:f.db,numberId,key:{id:'ORIGINAL',remoteJid},update:{message:null,messageStubType:1},revokedStubType:1,now:NOW});
 await syncWhatsappMutation({db:f.db,numberId:'number',key:{id:'ORIGINAL',remoteJid:'123@lid'},update:{status:3},revokedStubType:1});assert.equal(f.row.text,'Original');assert.equal(f.row.deleted_at,null);
});
test('editing older content does not replace a newer conversation preview',async()=>{const f=fixture();f.rows.unshift({...original(),id:'newer',text:'Newer'});f.preview.last_message='Newer';await mutateWhatsappMessage({...f.args,action:'edit',text:'Old corrected'});assert.equal(f.preview.last_message,'Newer');});

test('editing a signed message retains its original operator name, with an unsigned editor body',async()=>{
 const f=fixture({signature_name:'Vanessa • Suporte'});
 await mutateWhatsappMessage({...f.args,action:'edit',text:'Corrigido'});
 assert.equal(f.calls[0].content.text,'Corrigido\n\n*Vanessa • Suporte*');
 assert.equal(f.row.text,'Corrigido');assert.equal(f.row.signature_name,'Vanessa • Suporte');
 await syncWhatsappMutation({db:f.db,numberId:'number',key:{id:'ORIGINAL',remoteJid:'123@lid'},revokedStubType:1,now:NOW,update:{message:{editedMessage:{message:{conversation:'Editado no celular\n\n*Vanessa • Suporte*'}}}}});
 assert.equal(f.row.text,'Editado no celular');assert.equal(f.row.signature_name,'Vanessa • Suporte');
});
