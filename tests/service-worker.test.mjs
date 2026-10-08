import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('offline cache never intercepts API downloads or authenticated requests',()=>{
 const listeners={};
 runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self:{location:{origin:'https://workspace.test'},addEventListener:(name,fn)=>{listeners[name]=fn;}},URL});
 for(const [url,headers] of [['https://workspace.test/api/whatsapp/media/file',{}],['https://workspace.test/private.pdf',{authorization:'Bearer test'}]]){
  let intercepted=false;
  listeners.fetch({request:new Request(url,{headers}),respondWith:()=>{intercepted=true;}});
  assert.equal(intercepted,false);
 }
});
