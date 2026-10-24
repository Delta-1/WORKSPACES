/** Independent ordering lanes: persistence must never wait for an AI/media job. */
export function createMessageLane() {
  const tails = new Map();
  return {
    get size() { return tails.size; },
    run(key, task) {
      const work = (tails.get(key) || Promise.resolve()).catch(() => {}).then(task);
      tails.set(key, work);
      const release = () => { if (tails.get(key) === work) tails.delete(key); };
      void work.then(release, release);
      return work;
    },
  };
}
export async function retryIncoming(task, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await task(); } catch (error) { failure = error; }
    if (attempt < 2) await pause(150 * (attempt + 1));
  }
  throw failure;
}
export async function persistIncoming(save, pause) {
  return retryIncoming(async () => {
    const id = await save();
    if (!id) throw Error('Incoming message was not saved');
    return id;
  }, pause);
}
