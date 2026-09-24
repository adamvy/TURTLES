import { boot } from './qemu.mjs';

let guest, hostWorker, starting = false;
const pendingInput = [];
const lifetime = new AbortController();
const send = message => parent.postMessage(message, location.origin);
const output = text => send({ type: 'uart', text });
const stop = () => { lifetime.abort(); guest?.stop(); hostWorker?.terminate(); pendingInput.length = 0; };
addEventListener('pagehide', stop);
addEventListener('error', event => send({ type: 'error', message: event.message }));
addEventListener('unhandledrejection', event => send({ type: 'error', message: String(event.reason?.message ?? event.reason) }));

addEventListener('message', async event => {
  if (event.source !== parent || event.origin !== location.origin) return;
  const message = event.data;
  if (message?.type === 'stop') { stop(); return; }
  if (lifetime.signal.aborted) return;
  if (message?.type === 'evaluate' && hostWorker && typeof message.source === 'string') {
    hostWorker.postMessage(message);
    return;
  }
  if (message?.type === 'language' && ['t0', 'js', 'som'].includes(message.mode)) {
    if (hostWorker) hostWorker.postMessage(message);
    else if (guest) guest.write(`:${message.mode}\n`);
    else if (starting && pendingInput.length < 16) pendingInput.push(`:${message.mode}\n`);
    return;
  }
  if (message?.type === 'input' && typeof message.text === 'string') {
    if (hostWorker) hostWorker.postMessage(message);
    else if (guest) guest.write(message.text);
    else if (starting && !hostWorker && pendingInput.length < 16) pendingInput.push(message.text);
  }
  if (message?.type !== 'boot' || starting) return;
  starting = true;
  try {
    if (message.runtime === 'host') {
      hostWorker = new Worker(new URL('./host.js', import.meta.url));
      hostWorker.onmessage = event => { if (!lifetime.signal.aborted) send(event.data); };
      hostWorker.onerror = event => send({ type: 'error', message: event.message });
      hostWorker.postMessage({ type: 'boot' });
      return;
    }
    if (message.runtime !== undefined && message.runtime !== 'arm') throw new Error('Unknown runtime');
    guest = await boot({
      imageURL: message.imageURL, imageSha256: message.imageSha256,
      signal: lifetime.signal,
      onData: output,
      onStatus: (state, message) => send({ type: 'status', state, message }),
      onError: error => send({ type: 'error', message: error.message }),
      onProgress: (loaded, total) => send({ type: 'progress', loaded, total }),
    });
    for (const text of pendingInput.splice(0)) guest.write(text);
  } catch (error) {
    if (!lifetime.signal.aborted) send({ type: 'error', message: error.message });
  }
});
send({ type: 'ready' });
