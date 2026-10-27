"use client";
import type { WhatsappReply } from "@/lib/types";
const labels = { image: "Foto", audio: "Áudio", video: "Vídeo", document: "Arquivo", sticker: "Figurinha" };
export default function ReplyPreview({ reply, onClick }: { reply: WhatsappReply; onClick?: () => void }) {
 const content=<><span className="block text-xs font-semibold text-emerald-300 truncate">{reply.author}</span><span className="text-xs text-slate-200 line-clamp-2 break-words [overflow-wrap:anywhere]">{reply.media_type ? `${labels[reply.media_type]} · ` : ""}{reply.text}</span></>;
 const style="block w-full min-w-0 rounded-md border-l-[3px] border-emerald-400 bg-black/20 px-3 py-2 text-left";
 return onClick ? <button type="button" aria-label="Ir para a mensagem original" onClick={onClick} className={`${style} hover:bg-black/30`}>{content}</button> : <div className={style}>{content}</div>;
}
