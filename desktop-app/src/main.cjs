const {app,BrowserWindow,Menu,dialog,shell,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');
let win;let workspaceUrl;
function validUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.origin:null;}catch{return null;}}
function configure(forceSetup=false){
 const previous=win;
 const file=path.join(app.getPath('userData'),'workspace.json');
 let value='';try{value=JSON.parse(fs.readFileSync(file,'utf8')).url;}catch{}
 try{value=value||require('./config.json').url;}catch{}
 workspaceUrl=forceSetup?null:validUrl(value);
 if(workspaceUrl){openWorkspace();if(previous&&!previous.isDestroyed())previous.close();return;}
 win=new BrowserWindow({width:520,height:340,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 // URL setup is handled by a navigation event, not by exposing native APIs.
 if(previous&&!previous.isDestroyed())previous.close();
 win.webContents.on('will-navigate',(event,url)=>{
  event.preventDefault();
  if(!url.startsWith('https://workspace-setup.invalid/'))return;
  const chosen=validUrl(new URL(url).searchParams.get('url'));
  if(!chosen){dialog.showMessageBox(win,{message:'Informe um endereço HTTPS válido.'});return;}
  fs.writeFileSync(file,JSON.stringify({url:chosen}));workspaceUrl=chosen;const setup=win;openWorkspace();setup.close();
 });
 win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html lang="pt-BR"><body style="font:16px Arial;background:#0b0f16;color:white;padding:30px"><h2>Bem-vindo ao Workspace</h2><p>Informe o endereço do site da sua empresa. Você só precisa fazer isso uma vez.</p><form action="https://workspace-setup.invalid/"><input name="url" type="url" required placeholder="https://seu-workspace…" style="padding:12px;width:90%"><button style="padding:12px;margin-top:15px">Abrir Workspace</button></form></body></html>'));
}
function openWorkspace(){
 win=new BrowserWindow({width:1400,height:900,minWidth:420,minHeight:600,title:'Workspace',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
 const trusted=url=>{try{return new URL(url).origin===workspaceUrl;}catch{return false;}};
 session.defaultSession.setPermissionCheckHandler((contents,permission,origin)=>trusted(origin)&&['media','notifications','clipboard-sanitized-write'].includes(permission));
 session.defaultSession.setPermissionRequestHandler(async(contents,permission,callback)=>{
  if(!trusted(contents.getURL())||!['media','notifications'].includes(permission)){callback(false);return;}
  const {response}=await dialog.showMessageBox(win,{type:'question',buttons:['Permitir','Cancelar'],defaultId:1,message:permission==='media'?'Permitir acesso ao microfone/câmera para enviar áudio?':'Permitir notificações de mensagens?'});callback(response===0);
 });
 win.webContents.on('will-navigate',(e,url)=>{if(!trusted(url)){e.preventDefault();if(/^https?:/.test(url))void shell.openExternal(url);}});
 win.webContents.setWindowOpenHandler(({url})=>{
  // The report uses an isolated about:blank window, populated with escaped HTML.
  if(url==='about:blank'||trusted(url))return{action:'allow',overrideBrowserWindowOptions:{webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}}};
  if(/^https?:/.test(url))void shell.openExternal(url);return{action:'deny'};
 });
 win.webContents.on('did-fail-load',(_e,code,description)=>{if(code!==-3)void dialog.showMessageBox(win,{message:'Não consegui acessar o Workspace. Verifique a conexão e tente Recarregar.',detail:description});});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Workspace',submenu:[{label:'Recarregar',accelerator:'CmdOrCtrl+R',click:()=>win.reload()},{label:'Abrir no navegador',click:()=>shell.openExternal(workspaceUrl)},{label:'Trocar endereço',click:()=>{fs.rmSync(path.join(app.getPath('userData'),'workspace.json'),{force:true});workspaceUrl=null;configure(true);}},{type:'separator'},{role:'quit'}]},{label:'Editar',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'Exibir',submenu:[{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'},{role:'togglefullscreen'}]}]));
 win.loadURL(workspaceUrl);
}
app.whenReady().then(configure);app.on('window-all-closed',()=>app.quit());
