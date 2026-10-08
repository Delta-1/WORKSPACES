import test from 'node:test';
import assert from 'node:assert/strict';
import {safeMediaName,whatsappMediaUrl} from '../lib/whatsapp-media.ts';
const origin='https://workspace.supabase.co';
test('download names preserve accents and extensions and strip paths/control characters',()=>{
 assert.equal(safeMediaName('Proposta São Paulo.pdf','document','application/pdf'),'Proposta São Paulo.pdf');
 assert.equal(safeMediaName('../foto\u0000.png','image','image/png'),'.._foto_.png');
 assert.equal(safeMediaName(null,'audio','audio/ogg; codecs=opus'),'audio.ogg');
 assert.equal(safeMediaName('..','image','image/jpeg'),'image.jpg');
});
test('media fetches accept only our WhatsApp storage bucket and HTTPS origin',()=>{
 assert.equal(whatsappMediaUrl(`${origin}/storage/v1/object/public/wa-media/out/voice.ogg`,origin).origin,origin);
 for(const value of [`http://workspace.supabase.co/storage/v1/object/public/wa-media/x`,`https://evil.test/storage/v1/object/public/wa-media/x`,`${origin}/storage/v1/object/public/company-files/x`,`${origin}/storage/v1/object/public/wa-media/../../company-files/x`,`${origin}/rest/v1/profiles`,`${origin}/storage/v1/object/public/wa-media/%2f..%2fcompany-files/x`])assert.throws(()=>whatsappMediaUrl(value,origin));
});

test('billing attachments stay compatible and are restricted to their company prefix',()=>{
 assert.doesNotThrow(()=>whatsappMediaUrl(`${origin}/storage/v1/object/public/company-files/billing/company-a-123.png`,origin,'company-a'));
 assert.throws(()=>whatsappMediaUrl(`${origin}/storage/v1/object/public/company-files/billing/company-b-123.png`,origin,'company-a'));
});
