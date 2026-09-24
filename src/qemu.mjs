// QEMU runs entirely in this browser context. The host supplies static bytes only.
// Author-hosted artifacts: exact asset selection is reproducible. The author did
// not publish a corresponding source-commit identifier for these compiled files.
export const engineLock = Object.freeze({
  project: 'https://github.com/ktock/qemu-wasm',
  artifacts: 'https://github.com/ktock/qemu-wasm-demo-images',
  commit: 'b7c549b5e6f4c376f76483a03e983214421434ad',
  baseURL: 'https://raw.githubusercontent.com/ktock/qemu-wasm-demo-images/b7c549b5e6f4c376f76483a03e983214421434ad/raspi3ap/',
  qemuVersion: '8.2.0',
  files: {
    'out.js': { bytes: 222823, sha256: '88997f526b8ddd53a8c5da9b3ecab052851175e532f89ecb5425aa00e494d7a6' },
    'qemu-system-aarch64.worker.js': { bytes: 6001, sha256: '0fe5449bd103bcac7ba9a5adc6a8eb5357d2d260522529dbe90ba95bdca910c2' },
    'qemu-system-aarch64.wasm': { bytes: 57471585, sha256: 'b37148882e0b7e6d3ca93072439f5680069c303cbb0ee5b6901b9beb395cde42' },
  },
});

function eventSource() {
  const listeners = new Set();
  return {
    listen(callback) { listeners.add(callback); return { dispose() { listeners.delete(callback); } }; },
    emit(value) { for (const callback of [...listeners]) callback(value); },
  };
}

// Implements the xterm-pty slave interface embedded in the pinned Emscripten build.
// UART input is already edited by the guest, so the transport keeps the bytes raw.
export function bytePty(onData) {
  const readable = eventSource(), signal = eventSource();
  let queue = [], offset = 0;
  let termios = { iflag: 0, oflag: 0, cflag: 0, lflag: 0, cc: Array(32).fill(0) };
  const decoder = new TextDecoder();
  return {
    get readable() { return offset < queue.length; },
    get writable() { return true; },
    read(length) {
      const bytes = queue.slice(offset, offset + length);
      offset += bytes.length;
      if (offset === queue.length) { queue = []; offset = 0; }
      return bytes;
    },
    write(bytes) { onData(decoder.decode(new Uint8Array(bytes), { stream: true })); },
    input(text) {
      // Do not spread user input into arguments: a long paste can exceed the
      // JavaScript engine's argument limit before it reaches the guest.
      for (const byte of new TextEncoder().encode(text)) queue.push(byte);
      readable.emit();
    },
    onReadable: readable.listen,
    onSignal: signal.listen,
    ioctl(operation, data) {
      if (operation === 'TCGETS') return termios;
      if (operation === 'TCSETS') { termios = data; return 0; }
      if (operation === 'TIOCGWINSZ') return [100, 32];
      throw new Error(`Unsupported PTY operation: ${operation}`);
    },
  };
}

async function fetchBytes(url, onProgress, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Cannot load ${url}: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const chunks = []; let loaded = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value); loaded += value.length; onProgress?.(loaded, total);
  }
  const bytes = new Uint8Array(loaded); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function boot({ imageURL, imageSha256, signal, onData = () => {}, onStatus = () => {}, onError = () => {}, onProgress }) {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') {
    throw new Error('Browser QEMU needs cross-origin isolation (COOP/COEP headers) and shared WebAssembly memory.');
  }
  const guestURL = new URL(imageURL, location.href);
  if (guestURL.origin !== location.origin) throw new Error('Guest images must come from this site.');
  const controller = new AbortController();
  let configuration, scriptURL, workerURL, workerModuleURL, stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    controller.abort();
    configuration?.PThread?.terminateAllThreads();
    if (scriptURL) URL.revokeObjectURL(scriptURL);
    if (workerURL) URL.revokeObjectURL(workerURL);
    if (workerModuleURL) URL.revokeObjectURL(workerModuleURL);
  };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  try {
    const pty = bytePty(onData);
    onStatus('loading', 'Loading the ARM image and browser emulator');
    const engineRoot = new URL(engineLock.baseURL);
    const names = Object.keys(engineLock.files);
    const [image, ...assets] = await Promise.all([fetchBytes(guestURL, undefined, controller.signal), ...names.map(async name => {
      const bytes = await fetchBytes(new URL(name, engineRoot), name.endsWith('.wasm') ? onProgress : undefined, controller.signal);
      const expected = engineLock.files[name];
      if (bytes.length !== expected.bytes || await sha256(bytes) !== expected.sha256) throw new Error(`Browser emulator checksum mismatch: ${name}`);
      return bytes;
    })]);
    const files = Object.fromEntries(names.map((name, i) => [name, assets[i]]));
    if (imageSha256 && await sha256(image) !== imageSha256) throw new Error('ARM image checksum mismatch');
    // The author's raw GitHub files have binary MIME types. CORS fetch + verified
    // same-origin module/worker Blob URLs preserves their bytes without hosting
    // a redistributed engine copy or changing browser security settings.
    scriptURL = URL.createObjectURL(new Blob([files['out.js']], { type: 'text/javascript' }));
    workerURL = URL.createObjectURL(new Blob([files['qemu-system-aarch64.worker.js']], { type: 'text/javascript' }));
    // Emscripten does not forward locateFile to pthreads. Its module evaluates a
    // relative Wasm URL even though workers receive the compiled module directly;
    // a blob: URL cannot be the base of that relative URL. This small application
    // wrapper supplies the worker's missing option without altering vendor bytes.
    workerModuleURL = URL.createObjectURL(new Blob([
      `import createQemu from ${JSON.stringify(scriptURL)};\n` +
      `export default function(module) { module.locateFile = path => new URL(path, ${JSON.stringify(engineRoot.href)}).href; return createQemu(module); }\n`,
    ], { type: 'text/javascript' }));
    const { default: createQemu } = await import(scriptURL);
    controller.signal.throwIfAborted();
    onStatus('starting', 'Starting AArch64 emulation inside the browser');
    configuration = {
      arguments: ['-machine', 'virt-8.2', '-cpu', 'cortex-a53', '-accel', 'tcg,tb-size=32',
        '-m', '512M', '-smp', '1', '-nic', 'none', '-display', 'none', '-monitor', 'none',
        '-serial', 'stdio', '-device', 'loader,file=/guest.elf,cpu-num=0'],
      pty,
      wasmBinary: files['qemu-system-aarch64.wasm'],
      mainScriptUrlOrBlob: workerModuleURL,
      locateFile: path => path.endsWith('.worker.js') ? workerURL : new URL(path, engineRoot).href,
      preRun: [module => module.FS_createDataFile('/', 'guest.elf', image, true, false, true)],
      print: text => onData(`${text}\n`),
      printErr: text => onData(`${text}\n`),
      onAbort: reason => onError(new Error(String(reason))),
      onExit: code => onStatus('stopped', `Emulator exited (${code})`),
    };
    const instance = await createQemu(configuration);
    controller.signal.throwIfAborted();
    // QEMU polls its UART alongside timers; an empty PTY must not block that loop.
    const oldPoll = instance.TTY.stream_ops.poll;
    instance.TTY.stream_ops.poll = function(stream, timeout) {
      if (!pty.readable) return pty.writable ? 4 : 0;
      return oldPoll.call(this, stream, timeout);
    };
    return {
      write(text) { if (!stopped) pty.input(text); },
      stop,
    };
  } catch (error) { stop(); throw error; }
}
