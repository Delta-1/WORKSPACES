// A local Baileys key is not an acknowledgement from WhatsApp's servers.
// Listen before relay (ACK can beat sendMessage's return), never auto-resend an
// uncertain submission: the customer might already have received it.
export function installConfirmedDelivery(sock, { makeId, timeoutMs = 20000, health = {} }) {
  const send = sock.sendMessage.bind(sock);
  const pending = new Map();
  const ack = node => {
    const item = pending.get(node.attrs?.id);
    if (!item) return;
    if (node.attrs.error) item.settle(Error(`O WhatsApp recusou o envio (código ${node.attrs.error}). A mensagem não foi confirmada.`));
    else item.settle();
  };
  sock.ws.on('CB:ack,class:message', ack);
  sock.ev.on('connection.update', ({ connection }) => {
    if (connection === 'close') for (const item of pending.values()) item.settle(Error('A conexão caiu durante o envio. Confira a conversa antes de reenviar.'));
  });
  sock.sendMessage = async (jid, content, options = {}) => {
    const id = options.messageId || makeId();
    let timer;
    let settle;
    const confirmed = new Promise(resolve => {
      settle = error => { clearTimeout(timer); pending.delete(id); resolve(error || null); };
    });
    pending.set(id, { settle });
    // Deliberately keep the ACK timer after relay: media preparation has its own
    // time limits and does not mean a message was sent to WhatsApp yet.
    try {
      const sent = await send(jid, content, { ...options, messageId: id });
      if (pending.has(id)) timer = setTimeout(() => settle(Error('O WhatsApp ainda não confirmou o envio. Confira a conversa antes de reenviar.')), timeoutMs);
      const error = await confirmed;
      if (error) { health.failed = (health.failed || 0) + 1; throw error; }
      health.confirmed = (health.confirmed || 0) + 1;
      return sent;
    } finally { clearTimeout(timer); pending.delete(id); }
  };
}
