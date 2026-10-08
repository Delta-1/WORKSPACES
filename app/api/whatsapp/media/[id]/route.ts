import { NextResponse } from "next/server";
import { supabaseForRequest } from "@/lib/supabase-server";
import { safeMediaName, whatsappMediaUrl } from "@/lib/whatsapp-media";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const auth=supabaseForRequest(request);if(!auth)return NextResponse.json({error:"Faça login para baixar."},{status:401});
  const {data:{user}}=await auth.auth.getUser();if(!user)return NextResponse.json({error:"Sessão expirada."},{status:401});
  const {data:profile}=await auth.from("profiles").select("company_id").eq("id",user.id).single();
  if(!profile?.company_id)return NextResponse.json({error:"Selecione uma empresa."},{status:403});
  const {id}=await params;
  const {data:m}=await auth.from("whatsapp_messages").select("media_url,media_type,media_name,media_mime,conversations!inner(company_id,number_id)").eq("id",id).eq("conversations.company_id",profile.company_id).single();
  if(!m?.media_url)return NextResponse.json({error:"Arquivo indisponível ou sem permissão."},{status:404});
  const c=Array.isArray(m.conversations)?m.conversations[0]:m.conversations;
  const {data:allowed}=await auth.rpc("can_access_number",{nid:c?.number_id});
  if(!allowed)return NextResponse.json({error:"Sem acesso a este número."},{status:403});
  const url=whatsappMediaUrl(m.media_url,process.env.NEXT_PUBLIC_SUPABASE_URL!,profile.company_id);
  const response=await fetch(url,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.body)return NextResponse.json({error:"Arquivo não encontrado no armazenamento."},{status:404});
  const name=safeMediaName(m.media_name,m.media_type,m.media_mime);
  return new Response(response.body,{headers:{"Content-Type":response.headers.get("content-type")||"application/octet-stream","Content-Disposition":`attachment; filename="arquivo"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g,"%27")}`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
 }catch{return NextResponse.json({error:"Não consegui baixar o arquivo. Tente novamente."},{status:502});}
}
