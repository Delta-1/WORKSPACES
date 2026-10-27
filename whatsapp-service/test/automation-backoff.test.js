import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutomationWorker } from '../src/automation-worker.js';
test('scheduled work backs off during an outage and recovers without duplicate sends',async()=>{
 let clock=0,failed=true,queries=0,sends=0;
 const db={from(){const q={select(){return q;},eq(){return q;},lte(){return q;},order(){return q;},async limit(){queries++;return failed?{error:{message:'unavailable'}}:{data:[]};},then(resolve){return Promise.resolve({data:[]}).then(resolve);}};return q;},async rpc(name){if(name==='resume_message_automation')return{data:false};return{data:null};}};
 const worker=createAutomationWorker({db,now:()=>clock,send:async()=>{sends++;},connected:()=>true,logger:{error(){}}});
 await worker.sweep();assert.equal(queries,1);await worker.sweep();assert.equal(queries,1);
 clock=10000;await worker.sweep();assert.equal(queries,2);clock=15000;await worker.sweep();assert.equal(queries,2);
 // A successful incoming request proves recovery and reopens the worker early.
 failed=false;await worker.incoming({numberId:'number',companyId:'company',conversation:{id:'conversation'},messageKey:'key',text:'hello'});await worker.sweep();assert.equal(queries,3);assert.equal(sends,0);
});
