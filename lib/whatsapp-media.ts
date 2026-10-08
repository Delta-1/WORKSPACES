/** Restrict media fetches to WhatsApp storage and company-owned billing attachments. */
export function whatsappMediaUrl(value: string, storageOrigin: string, companyId?: string) {
 const url=new URL(value);const storage=new URL(storageOrigin);
 const path=decodeURIComponent(url.pathname);
 const whatsapp=/^\/storage\/v1\/object\/(public|sign|authenticated)\/wa-media\//.test(path);
 const billing=companyId && ["public","sign","authenticated"].some(access=>path.startsWith(`/storage/v1/object/${access}/company-files/billing/${companyId}-`));
 if(url.protocol!=="https:"||url.origin!==storage.origin||path.split("/").some(segment=>segment===".."||segment===".")||(!whatsapp&&!billing))throw new Error("Arquivo fora do armazenamento do Workspace.");
 return url;
}
export function safeMediaName(name: string | null | undefined, type: string | null | undefined, mime: string | null | undefined) {
 const ext:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","audio/ogg":"ogg","audio/webm":"webm","audio/mp4":"m4a","audio/mpeg":"mp3","video/mp4":"mp4","application/pdf":"pdf"};
 const cleaned=(name??"").replace(/[\x00-\x1f\x7f/\\]/g,"_").trim().slice(0,180);
 return cleaned&&cleaned!=="."&&cleaned!==".."?cleaned:`${type||"arquivo"}.${ext[(mime||"").split(";")[0]]||"bin"}`;
}
