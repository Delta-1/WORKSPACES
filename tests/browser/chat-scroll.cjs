// Run after building with NEXT_PUBLIC_SUPABASE_URL=https://mock.supabase.test
// and NEXT_PUBLIC_SUPABASE_ANON_KEY=fixture-anon. All account/data calls are mocked.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const now = new Date().toISOString();
const profile = { id:'user-a', email:'fixture@example.test', full_name:'Teste', role:process.env.TEST_STAFF?'funcionario':'gestor', company_id:'company-a', language:'pt-BR', tutorials_done:{bemvindo:true,inicio:true,mensagens:true}, created_at:now };
const conversations = ['a','b'].map(suffix => ({id:`conv-${suffix}`,company_id:'company-a',contact_id:`contact-${suffix}`,number_id:'number-a',status:'atendendo',assignee_id:profile.id,created_at:now,last_message_at:now,contacts:{id:`contact-${suffix}`,name:`Cliente ${suffix.toUpperCase()}`,saved_name:`Cliente ${suffix.toUpperCase()}`,phone:'551199999999'+suffix}}));
const rows = conversations.flatMap(c => Array.from({length:150}, (_, i) => ({id:`${c.id}-${i}`,conversation_id:c.id,company_id:'company-a',direction:i%2?'out':'in',wa_id:`wa-${c.id}-${i}`,text:`${c.id} mensagem ${i} ${'Histórico longo. '.repeat(15)}`,at:new Date(Date.now()-300000+i*1000).toISOString(),...(i===148?{media_type:'image',media_url:`https://fixture.test/${c.id}.svg`}:{})})));
const internals = Array.from({length:100},(_,i)=>({id:`internal-${i}`,sender_id:i%2?profile.id:'colleague',recipient_id:i%2?'colleague':profile.id,text:`Equipe mensagem ${i} ${'Histórico interno. '.repeat(12)}`,at:now}));
let server, browser;
(async()=>{try {
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3105','--hostname','127.0.0.1'],{stdio:['ignore','pipe','pipe']});
 let logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(logs)),20000);server.stdout.on('data',d=>{if(String(d).includes('Ready')){clearTimeout(timer);resolve();}});server.on('exit',()=>reject(Error(logs)));});
 const launchOptions={...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--no-zygote','--single-process','--use-angle=swiftshader','--disable-dev-shm-usage']};
 for (const layout of (process.env.TEST_STAFF?['classic']:['classic','kanban','crm'])) {
  browser=await chromium.launch(launchOptions);
  const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const alerts=[];page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept();});
  let failClaim=false, slowInbox=false, acceptSend=false, sendRequests=0,lastSend=null;
  await page.route('**/api/whatsapp/send',async route=>{sendRequests++;await new Promise(r=>setTimeout(r,350));const body=route.request().postDataJSON();lastSend=body;const quoted=rows.find(r=>r.id===body.replyToMessageId);if(acceptSend)rows.push({...(quoted?{reply_to:{id:quoted.id,wa_id:quoted.wa_id,author:"Cliente A",text:quoted.text,media_type:quoted.media_type||null}}:{}),id:`sent-${layout}-${sendRequests}`,conversation_id:body.conversationId,direction:'out',text:body.text,wa_id:'confirmed-fixture',at:new Date().toISOString()});await route.fulfill({status:acceptSend?200:400,contentType:'application/json',body:JSON.stringify(acceptSend?{success:true}:{success:false,message:'O WhatsApp recusou o envio (código 479).'})});});
  await page.route('https://fixture.test/**',async route=>{await new Promise(r=>setTimeout(r,400));await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="1000"><rect width="400" height="1000" fill="green"/></svg>'});});
  await page.route('https://mock.supabase.test/**',async route=>{
   const req=route.request(),url=new URL(req.url()),p=url.pathname;let data=[];
   if(p.endsWith('/rpc/attendance_action')&&failClaim){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'fixture unavailable'})});return;}
   if(p.endsWith('/conversations')&&slowInbox)await new Promise(r=>setTimeout(r,2500));
   if(p.includes('/auth/'))data={user:{...profile,user_metadata:{}}};else if(p.endsWith('/rpc/ensure_profile'))data=profile;else if(p.endsWith('/rpc/my_environments'))data=[];else if(p.includes('/rpc/'))data=true;
   else if(p.endsWith('/companies'))data={id:'company-a',name:'Teste',owner_id:profile.id,subscription_status:'active',plan:'enterprise'};
   else if(p.endsWith('/company_settings'))data=[{messages_layout:layout,enabled_features:null}];
   else if(p.endsWith('/profiles'))data=url.searchParams.get('id')?.includes('neq')?[{...profile,id:'colleague',full_name:'Colega Teste'}]:[profile];
   else if(p.endsWith('/whatsapp_numbers'))data=[{id:'number-a',company_id:'company-a',status:'connected',label:'WhatsApp'}];
   else if(p.endsWith('/conversations')){if(url.searchParams.has('id')){const c=conversations.find(c=>'eq.'+c.id===url.searchParams.get('id'));data=c?{contact_id:c.contact_id,number_id:c.number_id}:null;}else if(url.searchParams.get('select')==='id')data=conversations.filter(c=>'eq.'+c.contact_id===url.searchParams.get('contact_id')).map(c=>({id:c.id}));else data=conversations;}
   else if(p.endsWith('/whatsapp_messages')){const selection=url.searchParams.get('conversation_id')||'';data=rows.filter(row=>selection.includes(row.conversation_id));if(url.searchParams.get('limit')==='100')data=data.slice(-100).reverse();else{await new Promise(r=>setTimeout(r,150));data=data.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+500);}}
   else if(p.endsWith('/internal_messages')){await new Promise(r=>setTimeout(r,100));data=internals;}
   if(req.headers()['accept']?.includes('vnd.pgrst.object')&&Array.isArray(data))data=data[0]||null;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.addInitScript(({profile,layout})=>{const enc=v=>btoa(JSON.stringify(v));localStorage.setItem('sb-mock-auth-token',JSON.stringify({access_token:enc({alg:'none'})+'.'+enc({sub:profile.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.fixture',refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{...profile,user_metadata:{}}}));localStorage.setItem('msg:layout',layout);localStorage.setItem('msg:onboarded','1');},{profile,layout});
  await page.goto('http://127.0.0.1:3105');await page.getByRole('button',{name:'Abrir Mensagens',exact:true}).click();await page.getByText('Cliente A',{exact:true}).filter({visible:true}).first().click();
  const history=page.getByLabel('Histórico de mensagens');
  const gap=()=>history.evaluate(e=>e.scrollHeight-e.clientHeight-e.scrollTop);
  await page.getByText(rows.find(r=>r.id==='conv-a-149').text,{exact:true}).waitFor();await page.waitForTimeout(650);assert.ok(await gap()<3,`${layout}: opens at last message including delayed media`);
  // Staff can recover from a claim error and a server refusal. A slow inbox
  // refresh is deliberately in flight while the outgoing request proceeds.
  const composer=page.locator('textarea').filter({visible:true}).last();
  const sendButton=page.getByRole('button',{name:'Enviar mensagem',exact:true});
  await composer.fill(`Envio de teste ${layout}`);failClaim=true;await sendButton.click();
await page.waitForTimeout(150);assert.ok(alerts.some(a=>a.includes('assumir')));assert.equal(await sendButton.isEnabled(),true);assert.equal(sendRequests,0);
  failClaim=false;slowInbox=true;await sendButton.click();await page.getByText('Enviando…',{exact:true}).waitFor();
  await page.waitForTimeout(700);assert.equal(sendRequests,1,'inbox refresh does not block send');assert.ok(alerts.some(a=>a.includes('479')));assert.equal(await composer.inputValue(),`Envio de teste ${layout}`);assert.equal(await sendButton.isEnabled(),true);
  slowInbox=false;acceptSend=true;await sendButton.click();await page.waitForTimeout(600);assert.equal(sendRequests,2);assert.equal(await composer.inputValue(),'');
  await page.getByText('Enviando…',{exact:true}).waitFor({state:'hidden',timeout:5000});
  const source=page.locator('#message-conv-a-146');
  await history.dispatchEvent('wheel',{deltaY:-600});await source.getByRole('button',{name:'Responder mensagem',exact:true}).click();
  const replying=page.getByRole('region',{name:'Respondendo à mensagem',exact:true});await replying.waitFor();assert.ok(await replying.textContent().then(t=>t.includes('Cliente A')));assert.ok(await composer.evaluate(e=>e===document.activeElement));if(layout==='classic')await page.screenshot({path:'/tmp/workspaces-reply-desktop.png'});
  await page.getByRole('button',{name:'Cancelar resposta',exact:true}).click();await replying.waitFor({state:'hidden'});
  await source.getByRole('button',{name:'Responder mensagem',exact:true}).click();await composer.fill(`Resposta específica ${layout}`);acceptSend=false;await sendButton.click();await page.waitForTimeout(650);assert.equal(lastSend.replyToMessageId,'conv-a-146');await replying.waitFor();assert.equal(await composer.inputValue(),`Resposta específica ${layout}`);
  acceptSend=true;await sendButton.click();await replying.waitFor({state:'hidden'});await page.getByText('Enviando…',{exact:true}).waitFor({state:'hidden',timeout:5000});
  const savedQuote=page.locator(`#message-sent-${layout}-4`).getByRole('button',{name:'Ir para a mensagem original',exact:true});await savedQuote.click();assert.equal(await page.evaluate(()=>document.activeElement?.id),'message-conv-a-146');
  await page.getByText('Cliente B',{exact:true}).filter({visible:true}).first().click();await page.getByText('Cliente A',{exact:true}).filter({visible:true}).first().click();await savedQuote.waitFor();await page.waitForTimeout(100);assert.ok(await gap()<3);
  // Browser restoration/layout events are not a request to read older messages.
  await history.evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll',{bubbles:true}));});await page.waitForTimeout(50);assert.ok(await gap()<3,`${layout}: unexpected layout scroll must not cancel initial following`);
  await history.hover();await page.mouse.wheel(0,-700);await page.waitForTimeout(150);const readingTop=await history.evaluate(e=>e.scrollTop);assert.ok(await gap()>100);
  rows.push({id:`poll-${layout}`,conversation_id:'conv-a',company_id:'company-a',direction:'in',text:`Mensagem nova ${layout}`,at:new Date().toISOString()});await page.getByText(`Mensagem nova ${layout}`,{exact:true}).waitFor({state:'attached',timeout:4000});assert.ok(Math.abs(await history.evaluate(e=>e.scrollTop)-readingTop)<5,`${layout}: preserve deliberate reading position`);
  await page.getByText('Cliente B',{exact:true}).filter({visible:true}).first().click();await page.getByText(rows.find(r=>r.id==='conv-b-149').text,{exact:true}).waitFor();assert.ok(await gap()<3,`${layout}: switching resets to bottom`);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await gap()<3,`${layout}: resize stays at bottom`);
  await page.getByRole('button',{name:'Voltar para as conversas',exact:true}).click();if(layout==='kanban'&&await page.getByRole('tab',{name:/Em atendimento/}).count())await page.getByRole('tab',{name:/Em atendimento/}).click();await page.getByText('Cliente A',{exact:true}).filter({visible:true}).first().click();await page.getByText(`Mensagem nova ${layout}`,{exact:true}).waitFor();assert.ok(await gap()<3,`${layout}: mobile reopening resets to latest message`);
  await history.dispatchEvent('wheel',{deltaY:-600});await page.locator('#message-conv-a-148').getByRole('button',{name:'Responder mensagem',exact:true}).click();await replying.waitFor();assert.ok((await replying.textContent()).includes('Foto'));assert.ok((await replying.boundingBox()).height<110,'mobile quote preview stays compact');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no horizontal overflow');if(layout==='classic')await page.screenshot({path:'/tmp/workspaces-reply-mobile.png'});await page.getByRole('button',{name:'Cancelar resposta',exact:true}).click();
  await page.setViewportSize({width:1365,height:900});await page.getByTitle('Equipe (interno)',{exact:true}).click();await page.getByRole('button',{name:'Colega Teste',exact:true}).click();await page.getByText(internals[99].text,{exact:true}).waitFor();assert.ok(await gap()<3,`${layout}: internal chat also opens at bottom`);
  assert.deepEqual(errors,[]);await page.close();await browser.close();console.log(`PASS ${layout}: desktop, mobile, delayed media, programmatic scroll, deliberate reading, switching, reopening, internal chat, native reply preview, cancel, failure recovery, persistence, jump to original, mobile media reply`);
 }
} catch(error){console.error(error);process.exitCode=1;}finally{await browser?.close();server?.kill();}})();
