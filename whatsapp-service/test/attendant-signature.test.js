import test from 'node:test';
import assert from 'node:assert/strict';
import { attendancePosition, attendantName, cleanAttendantName, signedText, withoutSignature, resolveAttendantSignature } from '../src/attendant-signature.js';
import { generateWAMessageContent } from 'baileys';

test('the WhatsApp footer uses the configured name, then account name, never an email', async () => {
  assert.equal(attendantName({attendance_name:'Vanessa • Suporte',full_name:'Vanessa Silva'}),'Vanessa • Suporte');
  assert.equal(attendantName({attendance_name:'  ',full_name:'Victor Souza'}),'Victor Souza');
  assert.equal(attendantName({email:'private@example.com'}),'Atendente');
  const text=signedText('Olá! Como posso ajudar?','Vanessa • Suporte');
  assert.equal(text,'Olá! Como posso ajudar?\n\n*Vanessa • Suporte*');
  assert.equal((await generateWAMessageContent({text},{})).extendedTextMessage.text,text);
});
test('signature names cannot inject new lines, WhatsApp styles or invisible controls',()=>{
  assert.equal(cleanAttendantName('*Vanessa*\n_Equipe_\u202e'), 'Vanessa Equipe');
  assert.equal(cleanAttendantName('x'.repeat(100)).length,80);
  assert.equal(signedText('', 'Vanessa'),'*Vanessa*');
});
test('automation and bot messages are left unsigned',async()=>{
  assert.equal(signedText('Resposta automática',null),'Resposta automática');
  assert.equal(await resolveAttendantSignature(null,null,'company'),null);
});
test('the sender is looked up under the connected number company and lookup errors stop the send',async()=>{
  let filters=[];
  const query={select(){return this;},eq(k,v){filters.push([k,v]);return this;},async maybeSingle(){return {data:{full_name:'Victor',attendance_name:'Victor • Técnico'}};}};
  const db={from(table){assert.equal(table,'profiles');return query;}};
  assert.deepEqual(await resolveAttendantSignature(db,'user-a','company-a'),{name:'Victor • Técnico',position:'top'});
  assert.deepEqual(filters,[['id','user-a'],['company_id','company-a']]);
  query.maybeSingle=async()=>({data:null,error:{message:'missing profile'}});
  await assert.rejects(resolveAttendantSignature(db,'user-a','other'),/confirmar o perfil/);
});
test('only the stored footer is removed from a linked-device edit',()=>{
  assert.equal(withoutSignature('Texto novo\n\n*Vanessa*','Vanessa'),'Texto novo');
  assert.equal(withoutSignature('Texto novo\n\n*Outra pessoa*','Vanessa'),'Texto novo\n\n*Outra pessoa*');
  assert.equal(withoutSignature(null,'Vanessa'),null);
});

test('new replies default to a bold heading and can use the footer instead',()=>{
 assert.equal(attendancePosition(undefined),'top');
 assert.equal(attendancePosition('bottom'),'bottom');
 assert.equal(attendancePosition('untrusted'),'top');
 assert.equal(signedText('Olá','Vanessa','top'),'*Vanessa*\n\nOlá');
 assert.equal(signedText('Olá','Vanessa','bottom'),'Olá\n\n*Vanessa*');
 assert.equal(withoutSignature('*Vanessa*\n\nOlá','Vanessa','top'),'Olá');
 assert.equal(withoutSignature('Olá\n\n*Vanessa*','Vanessa','bottom'),'Olá');
 assert.equal(withoutSignature('Olá\n\n*Vanessa*','Vanessa','top'),'Olá\n\n*Vanessa*');
});
