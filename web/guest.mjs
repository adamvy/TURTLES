import { boot } from './engine.mjs';
let guest, starting = false;
const pendingInput = [];
const lifetime = new AbortController();
const send = message => parent.postMessage(message, location.origin);
addEventListener('error', event => send({ type: 'error', message: event.message }));
addEventListener('unhandledrejection', event => send({ type: 'error', message: String(event.reason?.message ?? event.reason) }));
const stop = () => { lifetime.abort(); guest?.stop(); pendingInput.length = 0; };
addEventListener('pagehide', stop);
addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  const message = event.data;
  if (message?.type === 'stop') { stop(); return; }
  if (message?.type === 'input' && typeof message.text === 'string') {
    if (guest) guest.write(message.text);
    else if (starting && pendingInput.length < 16) pendingInput.push(message.text);
  }
  if (message?.type !== 'boot' || starting) return;
  starting = true;
  try {
    guest = await boot({
      mode: message.mode, imageURL: message.imageURL, imageSha256: message.imageSha256,
      signal: lifetime.signal,
      onData: text => send({ type: 'uart', text }),
      onStatus: (state, message) => send({ type: 'status', state, message }),
      onError: error => send({ type: 'error', message: error.message }),
      onProgress: (loaded, total) => send({ type: 'progress', loaded, total }),
    });
    for (const text of pendingInput.splice(0)) guest.write(text);
  } catch (error) { if (!lifetime.signal.aborted) send({ type: 'error', message: error.message }); }
});
send({ type: 'ready' });
