import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseFetch } from '../src/database-fetch.js';
test('bounded database fetch aborts a hung dependency',async()=>{const bounded=databaseFetch((_,init)=>new Promise((resolve,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason));}),10);const keepAlive=setTimeout(()=>{},200);try{await assert.rejects(bounded('https://test/rest/v1/wa_auth'),/timeout/i);}finally{clearTimeout(keepAlive);}});
test('preserves authorization and caller cancellation',async()=>{const ac=new AbortController();let received;const bounded=databaseFetch(async(_,init)=>{received=init;return new Response('{}');});await bounded('https://test/rest/v1/test',{headers:{Authorization:'test'},signal:ac.signal});assert.equal(received.headers.Authorization,'test');ac.abort();assert.equal(received.signal.aborted,true);});
