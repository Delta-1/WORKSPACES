// Saved address-book names take precedence over WhatsApp profile names.
export function contactNamePatch(existing, savedName, pushName) {
 const saved=String(savedName||"").trim(),push=String(pushName||"").trim();
 const patch={};
 if(push)patch.push_name=push;
 if(saved && existing?.name_source!=="manual") {
  patch.saved_name=saved;patch.name=saved;patch.name_source="whatsapp";
 } else if(!existing?.saved_name && existing?.name_source!=="manual" && push && (!existing?.name || existing.name==="Contato WhatsApp")) {
  patch.name=push;patch.name_source="profile";
 }
 return patch;
}
