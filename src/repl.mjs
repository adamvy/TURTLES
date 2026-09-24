const $ = selector => document.querySelector(selector);
const runtime = () => $('#runtime').value;
const modes = [...document.querySelectorAll('.mode')];
const labels = {t0: 'T0', js: 'JS-like', som: 'SOM'};
const drafts = {};
const examples = {
  js: [
    ['Arithmetic', '1 + 2 * 3'],
    ['Functions', 'function square(x) { return x * x; }\nsquare(9)'],
    ['Closures', 'function counter(start) {\n  let n = start;\n  return function() { n = n + 1; return n; };\n}\nlet next = counter(40);\n[next(), next()]'],
    ['Recursion', 'function factorial(n) {\n  if (n <= 1) { return 1; }\n  return n * factorial(n - 1);\n}\nfactorial(6)'],
    ['Arrays', 'let values = [2, 3, 5];\nvalues[0] * values[1] + values[2]'],
  ],
  som: [
    ['Arithmetic', '1 + (2 * 3)'],
    ['Blocks', '[ :x | x * x ] value: 9'],
    ['Variables', 'answer := 40. answer + 2'],
    ['Counter class', 'Counter = (\n  | n |\n  init = ( n := 0 )\n  next = ( n := n + 1. ^ n )\n)\ncounter := Counter new init.\ncounter next. counter next'],
  ],
  t0: [
    ['Arithmetic', '1 2 3 * + print'],
    ['Closures', '{ n | { x | n x + } } ::adder\n10 adder :add10\n7 add10 () print'],
    ['Arrays', '[ 2 3 5 ] 1 @ print'],
    ['Build a word', '{ x | x x * } ::square\n9 square print'],
    ['Compiler', '{ | i[ 40 2 + emit ] } () print'],
  ],
};
let manifest, bootImage, selectedMode = 't0', runningMode, runningRuntime, frame, booting = false, ready = false;
let tail = '', inputPending = false, haltedNotice = false;
let terminalReading = false, terminalPaste = false, terminalSubmission = false, terminalLine = '', terminalQueue = '';
const maxOutput = 256 * 1024;

function notice(message = '') { $('#notice').textContent = message; }
function status(message, state = '') {
  $('#status').textContent = message;
  $('#status-dot').className = state;
}
function controls() {
  $('#boot').disabled = runtime() === 'arm' && (!manifest || !crossOriginIsolated || typeof SharedArrayBuffer === 'undefined');
  $('#boot').textContent = frame ? 'Reboot Turtles ↗' : 'Boot Turtles ↗';
  $('#power').disabled = !frame;
  $('#source').disabled = !ready || inputPending;
  $('#run').disabled = !ready || inputPending;
  $('#terminal-input').disabled = !frame || booting || haltedNotice;
  $('#uart').classList.toggle('reading', terminalReading);
  for (const button of modes) button.disabled = !!frame && (!ready || inputPending);
}
function selectMode(mode) {
  if ($('#source').value) drafts[selectedMode] = $('#source').value;
  selectedMode = mode;
  for (const button of modes) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  $('#input-label').textContent = `${labels[mode]} source`;
  $('#prompt').textContent = `${mode}>`;
  $('#source').value = drafts[mode] ?? examples[mode][mode === 'js' ? 1 : 0][1];
  $('#examples').replaceChildren(...examples[mode].map(([label, source]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => { $('#source').value = source; if (ready) $('#source').focus(); });
    return button;
  }));
  $('#language-note').textContent = mode === 'js'
    ? 'The JS-like compiler runs in T0: functions, lexical closures, recursion, expressions, arrays and control flow. This is an experimental dialect, not full ECMAScript. Locals are function-scoped; no const, objects or classes.'
    : mode === 'som' ? 'SOM compiles to T0: messages, blocks, variables and classes. This is an experimental subset without native primitives, the full SOM library or nonlocal returns from blocks. Switching languages keeps the session.'
    : 'T0 is Kevin Greer’s stack language. Definitions and compiler extensions stay in the session until reboot. Use print to display a value; Reboot starts a fresh environment.';
}
function stop() {
  // Removing the complete browsing context also terminates its Wasm workers.
  frame?.contentWindow?.postMessage({type: 'stop'}, location.origin);
  frame?.remove(); frame = undefined; booting = ready = inputPending = false;
  terminalReading = terminalPaste = terminalSubmission = false; terminalLine = terminalQueue = '';
  $('#terminal-input').value = '';
  $('#progress-wrap').hidden = true;
  controls();
}
function boot() {
  if (runtime() === 'arm' && !manifest) return;
  stop(); notice();
  if (runtime() === 'arm' && (!crossOriginIsolated || typeof SharedArrayBuffer === 'undefined')) {
    notice('This browser has not enabled shared WebAssembly memory. Allow this site’s service worker and reload in desktop Chrome.');
    status('Browser setup required', 'error'); return;
  }
  runningMode = 't0'; runningRuntime = runtime(); booting = true; tail = '';
  bootImage = manifest?.image; haltedNotice = false;
  if (manifest) showRelease(manifest);
  $('#uart').textContent = ''; $('#uart').hidden = false; $('#welcome').hidden = true;
  status(runningRuntime === 'arm' ? 'Downloading the emulator' : 'Loading the JavaScript host', 'loading');
  $('#progress-wrap').hidden = runningRuntime !== 'arm'; $('#progress').removeAttribute('value');
  $('#progress-label').textContent = 'Preparing a fresh machine…';
  frame = document.createElement('iframe');
  frame.title = runningRuntime === 'arm' ? 'Turtles ARM machine' : 'Turtles JavaScript host';
  frame.src = new URL('./guest.html', import.meta.url);
  $('#guest-container').append(frame);
  controls();
}
function appendUART(text) {
  const uart = $('#uart');
  let output = uart.textContent;
  for (const character of text) {
    if (character === '\b') output = output.replace(/[^\n]$/u, '');
    else if (character !== '\r') output += character;
  }
  uart.textContent = output.slice(-maxOutput);
  uart.scrollTop = uart.scrollHeight;
  tail = (tail + text).slice(-512);
  if (/(?:^|[\r\n])HALTED: (?:value heap exhausted|compiler\/frame arena exhausted|data stack exhausted|native call stack exhausted|initialization failed)[^\r\n]*\r?\n$/.test(tail)) {
    ready = false; inputPending = false; booting = false;
    terminalReading = false; terminalQueue = '';
    haltedNotice = true;
    status('Guest halted · reboot to start again', 'error');
    notice('The guest halted. Reboot starts a fresh machine and clears its memory.');
  } else {
    const prompt = !terminalReading && tail.match(/(?:^|[\r\n])(t0|js|som)> $/);
    if (prompt) {
      const firstPrompt = booting;
      runningMode = prompt[1];
      ready = true; booting = false; inputPending = false;
      terminalReading = true; terminalPaste = terminalSubmission = false; terminalLine = '';
      $('#progress-wrap').hidden = true;
      if (firstPrompt && selectedMode !== runningMode) { switchLanguage(selectedMode); return; }
      if (selectedMode !== runningMode) selectMode(runningMode);
      if (haltedNotice) { notice(); haltedNotice = false; }
      status(`${labels[runningMode]} running on ${runningRuntime === 'arm' ? 'ARM · QEMU' : 'the JavaScript host'}`, 'running');
      if (firstPrompt) { controls(); $('#terminal-input').focus({preventScroll: true}); }
      drainTerminal();
    } else if (!terminalReading && terminalSubmission && /(?:^|[\r\n])\.\.\. $/.test(tail)) {
      terminalReading = terminalPaste = true; terminalLine = '';
      ready = false; inputPending = true;
      status('Multiline input · :end to run, :cancel to discard', 'running');
      drainTerminal();
    }
  }
  controls();
}
function switchLanguage(mode) {
  if (!frame || !ready || inputPending) return;
  notice(); inputPending = true; ready = terminalReading = false; tail = '';
  status(`Switching to ${labels[mode]} · keeping this session`, 'loading');
  controls();
  frame.contentWindow.postMessage({type: 'language', mode}, location.origin);
}
addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
  const message = event.data;
  if (message?.type === 'ready') {
    frame.contentWindow.postMessage({type: 'boot', runtime: runningRuntime,
      imageURL: bootImage && new URL(bootImage.url, location.href).href, imageSha256: bootImage?.sha256}, location.origin);
  } else if (message?.type === 'uart' && typeof message.text === 'string') appendUART(message.text);
  else if (message?.type === 'status') {
    if (message.state === 'stopped') {
      stop(); status(message.message); notice('The emulator stopped. Boot starts a fresh machine.');
    } else if (!ready) status(message.message, 'loading');
  } else if (message?.type === 'progress') {
    if (message.total) { $('#progress').max = message.total; $('#progress').value = message.loaded; }
    $('#progress-label').textContent = `${(message.loaded / 1e6).toFixed(1)} MB${message.total ? ` / ${(message.total / 1e6).toFixed(1)} MB` : ''} · downloaded on demand`;
  } else if (message?.type === 'error') {
    const started = !booting;
    stop(); status(started ? 'The REPL stopped' : 'Could not start the REPL', 'error');
    notice(message.message + (runningRuntime === 'arm' ? ' Try rebooting in desktop Chrome with enough free memory.' : ' Reboot to start a fresh session.'));
  }
});
// The guest owns line editing and echo. Queue type-ahead until each serial
// prompt, so editor submissions and terminal input cannot interleave.
function drainTerminal() {
  if (!terminalReading || !terminalQueue) return;
  const end = terminalQueue.indexOf('\n');
  const text = end < 0 ? terminalQueue : terminalQueue.slice(0, end + 1);
  terminalQueue = terminalQueue.slice(text.length);
  for (const character of text) {
    if (character === '\x7f') terminalLine = terminalLine.replace(/.$/u, '');
    else if (character !== '\n') terminalLine += character;
  }
  if (end >= 0) {
    terminalLine = ''; ready = terminalReading = false; inputPending = terminalSubmission = true;
    status(terminalPaste ? 'Collecting multiline input…' : 'Evaluating…', 'loading');
  } else inputPending = terminalPaste || terminalLine.length > 0;
  controls();
  frame.contentWindow.postMessage({type: 'input', text}, location.origin);
}
function queueTerminal(text) {
  if (!frame || booting || haltedNotice || !text) return;
  if (text !== '\x7f' && text !== '\n' && new TextEncoder().encode(terminalLine + terminalQueue + text).length > 65535) {
    notice('Terminal input is limited to 65,535 UTF-8 bytes.'); return;
  }
  notice(); terminalQueue += text.replace(/\r\n?/g, '\n');
  drainTerminal();
}
const terminalInput = $('#terminal-input');
function readTerminalInput() {
  const text = terminalInput.value;
  terminalInput.value = '';
  if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text.replace(/\r\n?/g, '\n'))) {
    notice('Paste plain text without terminal control characters.'); return;
  }
  queueTerminal(text);
}
terminalInput.addEventListener('input', event => { if (!event.isComposing) readTerminalInput(); });
terminalInput.addEventListener('compositionend', readTerminalInput);
terminalInput.addEventListener('keydown', event => {
  if (event.isComposing || event.metaKey || event.altKey) return;
  if (event.key === 'Enter' || event.key === 'Backspace') {
    event.preventDefault(); queueTerminal(event.key === 'Enter' ? '\n' : '\x7f');
  }
});
$('#uart').addEventListener('click', () => {
  if (getSelection()?.isCollapsed) terminalInput.focus({preventScroll: true});
});
$('#program-form').addEventListener('submit', event => {
  event.preventDefault(); if (!frame || !ready || inputPending) return;
  const source = $('#source').value.replace(/\r\n?/g, '\n');
  if (!source.trim()) return;
  if (new TextEncoder().encode(source + '\n').length > 65535) return notice('This REPL accepts up to 65,535 UTF-8 bytes per submission.');
  if (/^:(?:end|cancel)\s*$/m.test(source) || /[\x00-\x08\x0b-\x1f\x7f]/.test(source)) return notice('Remove control characters or standalone :end / :cancel lines from the source.');
  const command = source.trim();
  if (/^:(t0|js|som)$/.test(command)) { switchLanguage(command.slice(1)); return; }
  notice(); inputPending = true; terminalReading = false; tail = ''; controls();
  status(runningRuntime === 'arm' ? 'Evaluating inside the guest…' : 'Evaluating in T0…', 'loading');
  frame.contentWindow.postMessage(runningRuntime === 'host' ? {type: 'evaluate', source} :
    {type: 'input', text: command === ':help' ? ':help\n' : `:paste\n${source}${source.endsWith('\n') ? '' : '\n'}:end\n`}, location.origin);
});
$('#source').addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); $('#program-form').requestSubmit(); }
});
for (const button of modes) button.addEventListener('click', () => {
  if (selectedMode === button.dataset.mode) return;
  selectMode(button.dataset.mode); if (frame) switchLanguage(selectedMode);
});
$('#boot').addEventListener('click', boot);
$('#runtime').addEventListener('change', () => {
  $('#download-note').textContent = runtime() === 'arm' ? 'First boot downloads ~58 MB. Runs locally.' : 'Original interpreter · shared parser and compiler';
  controls(); if (frame) boot();
});
$('#copy-command').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#qemu-command').textContent); notice('QEMU command copied.'); }
  catch { notice('Select and copy the QEMU command above.'); }
});
$('#power').addEventListener('click', () => { stop(); status('Powered off'); notice('Machine stopped. Boot starts a fresh session.'); });

async function latest() {
  const response = await fetch('./latest.json', {cache: 'no-store'});
  if (!response.ok) throw Error(`Could not load the release manifest (${response.status}).`);
  const data = await response.json();
  if (data.schema !== 2 || data.machine !== 'virt-8.2' || !data.image) throw Error('Unsupported release manifest. Reload to update the site.');
  if (!/^[a-f0-9]{64}$/.test(data.image.sha256) || new URL(data.image.url, location.href).origin !== location.origin) throw Error('Invalid image manifest.');
  return data;
}
function showRelease(data) {
  $('#build-label').textContent = `${data.releaseTag} · ${data.revision.slice(0, 7)}`;
  $('#download-image').href = data.image.downloadURL;
  $('#release').href = data.releaseURL;
}
$('#check-update').addEventListener('click', async () => {
  try {
    const data = await latest();
    const changed = data.image.sha256 !== manifest?.image.sha256;
    manifest = data;
    if (!frame) showRelease(data);
    notice(changed ? `New image ${data.releaseTag} is ready. Reboot to load it; the current machine stays as it is.` : `You have the latest published image (${data.releaseTag}).`);
    controls();
  } catch (error) { notice(error.message); }
});
$('#source').value = '';
selectMode('t0');
try {
  manifest = await latest(); showRelease(manifest);
  if (!frame && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
    status('Ready to boot');
  } else if (!frame) {
    status('Preparing browser memory support', 'loading');
    $('#reload').hidden = false;
    notice('Setting up the browser for its first boot. This page will reload automatically. If setup does not finish, use Reload.');
  }
  $('#download-note').textContent = runtime() === 'arm' ? 'First boot downloads ~58 MB. Runs locally.' : 'Original interpreter · shared parser and compiler';
  controls();
} catch (error) {
  if (!frame) { status('ARM images unavailable', 'error'); notice(`${error.message} You can still select the JavaScript host.`); }
  controls();
}
$('#reload').addEventListener('click', () => location.reload());
