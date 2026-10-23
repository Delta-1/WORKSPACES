import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeThreadMessages } from '../lib/message-thread.ts';
const row=(id,other={})=>({id,at:'2026-10-23T10:00:00Z',conversation_id:'a',direction:'out',text:'Olá',...other});
test('a slow history snapshot does not erase received messages or newer edits',()=>{
  const edited=row('out',{text:'Corrigido',edited_at:'2026-10-23T10:01:00Z'});
  const incoming=row('in',{direction:'in',text:'Resposta do cliente',at:'2026-10-23T10:02:00Z'});
  assert.deepEqual(mergeThreadMessages([edited,incoming],[row('out')]),[edited,incoming]);
});
test('deleted messages remain deleted while server snapshots catch up',()=>{
  const deleted=row('a',{text:null,deleted_at:'2026-10-23T10:01:00Z'});
  assert.deepEqual(mergeThreadMessages([deleted],[row('a')]),[deleted]);
});
test('server confirmation replaces only a matching optimistic message and sorts history',()=>{
  const temp=row('temp-a'); const audio=row('temp-b',{media_type:'audio'});
  const before=row('old',{at:'2026-10-22T10:00:00Z'});
  const merged=mergeThreadMessages([temp,audio],[row('confirmed'),before]);
  assert.deepEqual(merged.map(m=>m.id),['old','confirmed','temp-b']);
});
