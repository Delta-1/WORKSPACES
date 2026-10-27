import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthStore } from '../src/auth-store.js';
function fixture() {
 const rows = new Map(); let fail = false; let calls = 0;
 const db = {from(){ const q = {select(){return q;},eq(){return q;},async in(_, keys){calls++; if(fail)return {error:{status:503}};return {data:keys.filter(k=>rows.has(k)).map(key=>({key,value:rows.get(key)}))};},async upsert(data){calls++;if(fail)return {error:{status:503}};for(const row of data)rows.set(row.key,structuredClone(row.value));return {};},delete(){const del={eq(){return del;},async in(_,keys){if(fail)return {error:{status:503}};for(const key of keys)rows.delete(key);return {};}};return del;}};return q;}};
 const args={db,numberId:'test',serialize:structuredClone,revive:structuredClone,appStateKey:v=>({...v,decoded:true}),pause:async()=>{}};
 return {rows,args,store:createAuthStore(args),setFail:v=>{fail=v;},calls:()=>calls};
}
test('failed credentials read never becomes an empty identity',async()=>{const f=fixture();f.setFail(true);await assert.rejects(f.store.readCreds(),/sessão/);assert.equal(f.calls(),3);});
test('batches device keys and keeps number scoped durable state',async()=>{const f=fixture();for(let i=0;i<250;i++)f.rows.set(`session-${i}`,{counter:i});const data=await f.store.keys.get('session',Array.from({length:250},(_,i)=>String(i)));assert.equal(data[249].counter,249);assert.equal(f.calls(),3);await f.store.keys.get('session',['0','249']);assert.equal(f.calls(),3);});
test('write failure cannot poison cache, and queue recovers',async()=>{const f=fixture();await f.store.keys.set({session:{a:{counter:1}}});f.setFail(true);await assert.rejects(f.store.keys.set({session:{a:{counter:2}}}));f.setFail(false);assert.equal((await f.store.keys.get('session',['a'])).a.counter,1);await f.store.keys.set({session:{a:{counter:3}}});assert.equal((await createAuthStore(f.args).keys.get('session',['a'])).a.counter,3);});
test('deletes persist and queued credentials capture the event snapshot',async()=>{const f=fixture();const creds={counter:1};const saved=f.store.saveCreds(creds);creds.counter=99;await saved;assert.equal(f.rows.get('creds').counter,1);await f.store.keys.set({session:{a:{counter:1}}});await f.store.keys.set({session:{a:null}});assert.equal((await f.store.keys.get('session',['a'])).a,null);assert.equal(f.rows.has('session-a'),false);});
test('app-state protobuf conversion remains supported',async()=>{const f=fixture();f.rows.set('app-state-sync-key-a',{keyData:'test'});assert.equal((await f.store.keys.get('app-state-sync-key',['a'])).a.decoded,true);});

test('caller mutations do not change cached Signal keys before commit',async()=>{const f=fixture();await f.store.keys.set({session:{a:{counter:1}}});const loaded=await f.store.keys.get('session',['a']);loaded.a.counter=2;f.setFail(true);await assert.rejects(f.store.keys.set({session:loaded}));f.setFail(false);assert.equal((await f.store.keys.get('session',['a'])).a.counter,1);});
