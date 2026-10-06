import { matches, nextNode, renderText, validateFlow } from './automation-flow.js';
export function createAutomationWorker({ db, storageOrigin, send, connected, logger = console, now = () => Date.now() }) {
  let sweeping = false;
  async function incoming({ numberId, companyId, conversation, messageKey, text, name }) {
    const {data:resumed,error:resumeError}=await db.rpc('resume_message_automation',{conversation_id:conversation.id,message_key:messageKey,received_text:text ?? ''});
    if(resumeError){logger.error('Automation resume:',resumeError.message);return false;}
    if(resumed)return true;
    const { data: rules, error } = await db.from('message_automations').select('*').eq('company_id', companyId).eq('number_id',numberId).eq('enabled',true).eq('trigger_type','incoming').order('priority').order('created_at');
    if (error) { logger.error('Automation rules:',error.message); return false; }
    for (const rule of rules ?? []) {
      if (rule.pause_on_human && (conversation.assignee_id || conversation.bot_paused)) continue;
      if (!matches(rule.match_mode,rule.keywords,text)) continue;
      if (validateFlow(rule.flow,storageOrigin,companyId)) continue;
      const {error:e} = await db.rpc('reserve_message_automation',{rule_id:rule.id,conversation_id:conversation.id,message_key:messageKey,received_text:text ?? '',contact_name:name ?? ''});
      if(e) { logger.error('Automation reserve:',e.message); return false; }
      // A matching flow takes precedence over AI, including during its cooldown.
      return true;
    }
    return false;
  }
  async function process(run) {
    const token=run.lease_token;
    const save=async patch=>{const {error}=await db.from('message_automation_runs').update(patch).eq('id',run.id).eq('lease_token',token).eq('status','running');if(error)throw Error(error.message);};
    try {
      const {data:rule,error:rerr}=await db.from('message_automations').select('*').eq('id',run.automation_id).maybeSingle();
      const {data:c,error:cerr}=await db.from('conversations').select('*,contacts(saved_name,name,jid,phone)').eq('id',run.conversation_id).maybeSingle();
      if(rerr||cerr)throw Error(rerr?.message||cerr?.message);
      if(!rule?.enabled||!c||c.company_id!==run.company_id||c.number_id!==run.number_id||c.status==='fechado'||c.status==='cancelado'||(rule.pause_on_human&&(c.assignee_id||c.bot_paused))) {await save({status:'canceled',error:'Fluxo pausado, atendimento encerrado ou assumido por uma pessoa.',finished_at:new Date(now()).toISOString()});return;}
      if(!connected(run.number_id)){await save({status:'queued',due_at:new Date(now()+60000).toISOString(),lease_token:null});return;}
      const invalid=validateFlow(run.flow,storageOrigin,run.company_id);if(invalid)throw Error(invalid);
      const node=run.flow.nodes.find(n=>n.id===run.node_id);if(!node)throw Error('Etapa não encontrada.');
      let next=nextNode(run.flow,node.id),due=now();
      if(node.type==='condition')next=nextNode(run.flow,node.id,matches(node.data.mode,node.data.keywords,run.received_text)?'yes':'no');
      if(node.type==='delay')due+=node.data.minutes*60000;
      if(node.type==='reply'){await save({status:'waiting_reply',node_id:node.id,due_at:new Date(now()+node.data.minutes*60000).toISOString(),lease_token:null,steps_done:(run.steps_done||0)+1});return;}
      if(node.type==='text'||node.type==='audio') {
        await send({numberId:run.number_id,ruleId:rule.id,pauseOnHuman:rule.pause_on_human,conversation:c,text:node.type==='text'?renderText(node.data.text,run.contact_name):'',media:node.type==='audio'?{type:'audio',url:node.data.url,name:node.data.name||'audio',mime:node.data.mime||'audio/webm'}:null});
      }
      await save({status:next?'queued':'completed',node_id:next||node.id,due_at:new Date(due).toISOString(),lease_token:null,finished_at:next?null:new Date(now()).toISOString(),steps_done:(run.steps_done||0)+1,error:null});
      if(!next&&rule.trigger_type==='scheduled'&&run.incoming_key===`scheduled:${rule.id}:${rule.scheduled_at}`){const {error:e}=await db.from('message_automations').update({enabled:false}).eq('id',rule.id).eq('scheduled_at',rule.scheduled_at);if(e)logger.error('Automation schedule completion:',e.message);}

    } catch(e) {logger.error('Automation execution:',e.message);await save({status:e.code==='AUTOMATION_CANCELED'?'canceled':'failed',error:String(e.message).slice(0,500),finished_at:new Date(now()).toISOString()}).catch(err=>logger.error('Automation log:',err.message));}
  }
  async function sweep() {
    if(sweeping)return;sweeping=true;
    try {
      const {data:scheduled,error}=await db.from('message_automations').select('id,target_conversation_id,scheduled_at').eq('enabled',true).eq('trigger_type','scheduled').lte('scheduled_at',new Date(now()).toISOString()).limit(50);
      if(error)throw Error(error.message);
      for(const rule of scheduled??[]) {const {error:e}=await db.rpc('reserve_message_automation',{rule_id:rule.id,conversation_id:rule.target_conversation_id,message_key:`scheduled:${rule.id}:${rule.scheduled_at}`,received_text:'',contact_name:''});if(e)logger.error('Automation schedule:',e.message);}
      // Each claim is atomic. A crashed send is marked uncertain/failed, never blindly resent.
      for(let i=0;i<40;i++) {const {data:run,error:e}=await db.rpc('claim_message_automation_run');if(e)throw Error(e.message);if(!run)break;await process(run);}
    }catch(e){logger.error('Automation sweep:',e.message);}finally{sweeping=false;}
  }
  return {incoming,sweep,process};
}
