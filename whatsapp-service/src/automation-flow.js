/** Pure, bounded flow interpreter shared by the editor and the worker. */
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function matches(mode, keywords, text) {
  if (mode === 'any') return true;
  const value = normalize(text);
  const words = String(keywords ?? '').split('\n').map(normalize).filter(Boolean);
  return words.some(word => mode === 'exact' ? value === word : value.includes(word));
}
export function renderText(text, name) { return String(text ?? '').replaceAll('{{nome}}', () => String(name || 'cliente')); }
export function nextNode(flow, id, handle = 'out') { return flow.edges.find(edge => edge.from === id && edge.handle === handle)?.to ?? null; }
export function validateFlow(flow, storageOrigin, companyId) {
  if (!flow || !Array.isArray(flow.nodes) || !Array.isArray(flow.edges) || flow.nodes.length < 2 || flow.nodes.length > 30 || flow.edges.length > 50) return 'O fluxo precisa ter entre 2 e 30 etapas.';
  const nodes = new Map(flow.nodes.map(node => [node.id, node]));
  if (nodes.size !== flow.nodes.length || flow.nodes.some(n => typeof n.id !== 'string' || !n.id || !['start','text','audio','condition','delay','reply','end'].includes(n.type))) return 'Etapas inválidas ou repetidas.';
  const starts = flow.nodes.filter(n => n.type === 'start');
  if (starts.length !== 1) return 'Use exatamente um bloco de início.';
  for (const node of flow.nodes) {
    const d = node.data ?? {};
    if (node.type === 'text' && (typeof d.text !== 'string' || !d.text.trim() || d.text.length > 4000)) return 'Preencha as mensagens (até 4.000 caracteres).';
    if (node.type === 'audio') {
      try { const url = new URL(d.url); if (url.protocol !== 'https:' || (companyId && !url.pathname.startsWith(`/storage/v1/object/public/wa-media/automations/${companyId}/`)) || (storageOrigin && url.origin !== storageOrigin) || !url.pathname.startsWith('/storage/v1/object/public/wa-media/automations/')) return 'Adicione um áudio salvo no Workspace.'; } catch { return 'Adicione um áudio ao bloco.'; }
    }
    if (['delay','reply'].includes(node.type) && (!Number.isFinite(d.minutes) || d.minutes < 1 || d.minutes > 10080)) return 'A espera deve ser de 1 minuto a 7 dias.';
    if (node.type === 'condition' && (!['contains','exact'].includes(d.mode) || typeof d.keywords !== 'string' || !d.keywords.trim() || d.keywords.length > 1000)) return 'Preencha as palavras da condição.';
    const handles = node.type === 'end' ? [] : node.type === 'condition' ? ['yes','no'] : node.type === 'reply' ? ['reply','timeout'] : ['out'];
    const outgoing = flow.edges.filter(e => e.from === node.id);
    if (outgoing.length !== handles.length || handles.some(h => outgoing.filter(e => e.handle === h).length !== 1)) return 'Conecte todas as saídas dos blocos (incluindo Sim e Não).';
  }
  if (flow.edges.some(e => !nodes.has(e.from) || !nodes.has(e.to) || e.to === starts[0].id)) return 'Uma conexão aponta para uma etapa inválida.';
  const visited = new Set(), visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) throw Error('O fluxo não pode voltar para uma etapa anterior.');
    if (visited.has(id)) return;
    visiting.add(id); for (const edge of flow.edges.filter(e => e.from === id)) visit(edge.to); visiting.delete(id); visited.add(id);
  }
  try { visit(starts[0].id); } catch(e) { return e.message; }
  if (visited.size !== nodes.size) return 'Existem blocos soltos. Conecte ou remova esses blocos.';
  if (!flow.nodes.some(n => n.type === 'text' || n.type === 'audio')) return 'Adicione pelo menos uma mensagem ou áudio.';
  return null;
}
