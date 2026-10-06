import test from 'node:test';
import assert from 'node:assert/strict';
import { contactNamePatch } from '../src/contact-names.js';
test('profile updates do not replace a saved address-book name',()=>{assert.deepEqual(contactNamePatch({saved_name:'Vanessa CP',name:'Vanessa CP',name_source:'whatsapp'},null,'Vanessa 🌸'),{push_name:'Vanessa 🌸'});});
test('saved WhatsApp name supersedes an unknown profile label',()=>{assert.deepEqual(contactNamePatch({name:'Contato WhatsApp'},'Vanessa CP','Vanessa'),{push_name:'Vanessa',saved_name:'Vanessa CP',name:'Vanessa CP',name_source:'whatsapp'});});
test('manual names survive synchronization',()=>{assert.deepEqual(contactNamePatch({name:'Vanessa - financeiro',saved_name:'Vanessa - financeiro',name_source:'manual'},'Vanessa','V'),{push_name:'V'});});
test('missing fields never erase a name',()=>{assert.deepEqual(contactNamePatch({name:'Vanessa'},null,null),{});});
