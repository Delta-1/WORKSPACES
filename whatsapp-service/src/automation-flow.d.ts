export type AutomationNode = { id:string; type:'start'|'text'|'audio'|'condition'|'delay'|'reply'|'end'; x:number; y:number; data:{text?:string;url?:string;mime?:string;name?:string;minutes?:number;mode?:'contains'|'exact';keywords?:string} };
export type AutomationFlow = { nodes:AutomationNode[]; edges:{id:string;from:string;to:string;handle:string}[] };
export function normalize(value:unknown):string;
export function matches(mode:string,keywords:string,text:string):boolean;
export function renderText(text:string,name:string):string;
export function nextNode(flow:AutomationFlow,id:string,handle?:string):string|null;
export function validateFlow(flow:AutomationFlow,storageOrigin?:string,companyId?:string):string|null;
