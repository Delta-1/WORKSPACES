import test from 'node:test';
import assert from 'node:assert/strict';
import { startMessagePolling } from '../lib/message-polling.ts';
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(run,hidden=()=>false){const tasks=[];let cancelled;const stop=startMessagePolling(run,hidden,{schedule:(fn,ms)=>{const task={fn,ms};tasks.push(task);return task;},cancel:t=>{cancelled=t;}});return{tasks,stop,cancelled:()=>cancelled,async tick(){const task=tasks.shift();task.fn();await flush();return task;}};}
test('polling never overlaps a request and stops after unmount',async()=>{let release;const f=fixture(()=>new Promise(r=>{release=r;}));assert.equal(f.tasks[0].ms,1500);await f.tick();assert.equal(f.tasks.length,0);f.stop();release();await flush();assert.equal(f.tasks.length,0);});
test('dependency errors back off and recovery restores fast reconciliation',async()=>{let fail=true;const f=fixture(async()=>{if(fail)throw Error('database unavailable');});await f.tick();assert.equal(f.tasks[0].ms,3000);await f.tick();assert.equal(f.tasks[0].ms,6000);for(let i=0;i<8;i++)await f.tick();assert.equal(f.tasks[0].ms,60000);fail=false;await f.tick();assert.equal(f.tasks[0].ms,1500);f.stop();});
test('hidden tabs avoid querying and release scheduled callbacks on cleanup',async()=>{let calls=0;const f=fixture(async()=>{calls++;},()=>true);await f.tick();assert.equal(calls,0);assert.equal(f.tasks[0].ms,15000);const scheduled=f.tasks[0];f.stop();assert.equal(f.cancelled(),scheduled);});
