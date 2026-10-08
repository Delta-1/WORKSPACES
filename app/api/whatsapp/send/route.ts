import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { callWhatsappService, whatsappServiceConfigured } from "@/lib/whatsapp-proxy";
import { whatsappMediaUrl } from "@/lib/whatsapp-media";
import type { WhatsappMediaType } from "@/lib/types";
type Media = { type: WhatsappMediaType; url: string; name?: string | null; mime?: string | null };
export async function POST(request: Request) {
 try {
  const auth=supabaseForRequest(request);
  if(!auth)return NextResponse.json({error:"Faça login para enviar."},{status:401});
  const {data:{user}}=await auth.auth.getUser();
  if(!user)return NextResponse.json({error:"Sessão expirada."},{status:401});
  const {data:profile}=await auth.from("profiles").select("id,company_id,sector_id,role").eq("id",user.id).single();
  if(!profile?.company_id)return NextResponse.json({error:"Selecione uma empresa."},{status:403});
  const body=await request.json() as {to?:string;text?:string;numberId?:string;media?:Media;messageId?:string;conversationId?:string;forwardMessageId?:string};
  const {to}=body;
  let {text,media}=body;
  if(body.forwardMessageId){
   const {data:source}=await auth.from("whatsapp_messages").select("text,media_type,media_url,media_name,media_mime,conversations!inner(company_id,number_id)").eq("id",body.forwardMessageId).eq("conversations.company_id",profile.company_id).single();
   if(!source)return NextResponse.json({error:"Mensagem indisponível ou sem permissão para encaminhar."},{status:403});
   const sourceConv=Array.isArray(source.conversations)?source.conversations[0]:source.conversations;
   const {data:allowed}=await auth.rpc("can_access_number",{nid:sourceConv?.number_id});
   if(!allowed)return NextResponse.json({error:"Sem acesso ao número da mensagem original."},{status:403});
   text=source.text||undefined;
   media=source.media_url&&source.media_type?{type:source.media_type as WhatsappMediaType,url:source.media_url,name:source.media_name,mime:source.media_mime}:undefined;
   // Forwarding creates a new message; never overwrite the original record.
   body.messageId=undefined;
  }
  if(!to||(!text?.trim()&&!media?.url))return NextResponse.json({error:"Informe destinatário e mensagem."},{status:400});
  if(!whatsappServiceConfigured)return NextResponse.json({error:"Configure o serviço de WhatsApp para atendimento em equipe."},{status:503});
  if(media){
   if(!["image","audio","video","document","sticker"].includes(media.type))return NextResponse.json({error:"Mídia inválida."},{status:400});
   whatsappMediaUrl(media.url,process.env.NEXT_PUBLIC_SUPABASE_URL!,profile.company_id);
  }
  // Number, recipient and sender are resolved under the user's RLS, never trusted from the browser.
  let c;
  if(body.conversationId){
   const {data}=await auth.from("conversations").select("*,contacts(phone,jid)").eq("company_id",profile.company_id).eq("id",body.conversationId).single();c=data;
   if(!c)return NextResponse.json({error:"Atendimento indisponível."},{status:403});
   if(to!==c.contacts?.jid&&to!==c.contacts?.phone)return NextResponse.json({error:"Destinatário não corresponde ao atendimento."},{status:400});
  } else {
   let num=auth.from("whatsapp_numbers").select("id,sector_id").eq("company_id",profile.company_id).eq("status","connected");
   if(body.numberId)num=num.eq("id",body.numberId);
   const {data:number}=await num.order("created_at").limit(1).maybeSingle();
   if(!number)return NextResponse.json({error:"Nenhum número autorizado conectado."},{status:400});
   const {data:allowed}=await auth.rpc("can_access_number",{nid:number.id});
   if(!allowed)return NextResponse.json({error:"Sem acesso a este número."},{status:403});
   const key=to.includes("@")?"jid":"phone";
   let {data:contact}=await auth.from("contacts").select("id").eq("company_id",profile.company_id).eq(key,to).limit(1).maybeSingle();
   if(!contact){const {data,error}=await auth.from("contacts").insert({company_id:profile.company_id,phone:to.split("@")[0],jid:to.includes("@")?to:null}).select("id").single();if(error)throw error;contact=data;}
   const {data:existing}=await auth.from("conversations").select("*").eq("company_id",profile.company_id).eq("contact_id",contact!.id).eq("number_id",number.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
   c=existing;
   if(!c){const {data,error}=await auth.from("conversations").insert({company_id:profile.company_id,contact_id:contact!.id,number_id:number.id,sector_id:number.sector_id??profile.sector_id,status:"espera"}).select("*").single();if(error)throw error;c=data;}
  }
  if(!c?.number_id)return NextResponse.json({error:"Escolha um número para esta conversa."},{status:400});
  if(body.numberId&&c.number_id!==body.numberId)return NextResponse.json({error:"Número diferente do atendimento."},{status:400});
  const {data:targetAllowed}=await auth.rpc("can_access_number",{nid:c.number_id});
  if(!targetAllowed)return NextResponse.json({error:"Sem acesso ao número de destino."},{status:403});
  const {error:claimError}=await auth.rpc("attendance_action",{cid:c.id,action:"claim"});
  if(claimError)return NextResponse.json({error:claimError.message},{status:409});
  let messageId:string|undefined;
  if(body.messageId){const {data:m}=await auth.from("whatsapp_messages").select("id").eq("id",body.messageId).eq("conversation_id",c.id).eq("sender_id",user.id).eq("direction","out").maybeSingle();if(!m)return NextResponse.json({error:"Mensagem inválida."},{status:403});messageId=m.id;}
  const {status,data}=await callWhatsappService("/send",{method:"POST",body:JSON.stringify({to,text,senderId:user.id,numberId:c.number_id,conversationId:c.id,media,messageId})});
  return NextResponse.json(data,{status});
 }catch(err){return NextResponse.json({success:false,error:err instanceof Error?err.message:"Erro ao enviar."},{status:400});}
}
