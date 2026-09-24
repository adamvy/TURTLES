// Keep the original interpreter off the UI thread so even an infinite program
// can be interrupted by terminating this worker on power-off or reboot.
let mode;
let line = [], lineBytes = 0, overflow = false, paste, pasteBytes = 0, pasteOverflow = false, skipLF = false;
const output = text => postMessage({ type: 'uart', text });
const prompt = () => output(`${mode}> `);
const byteLength = character => {
  const code = character.codePointAt(0);
  return code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
};
console.log = (...values) => output(values.map(String).join(' ') + '\n');
function language(next) {
  if (!['t0', 'js', 'som'].includes(next)) throw new Error('Unknown language');
  mode = next;
}
function evaluate(source, command = source.trim()) {
  try {
    if ([':t0', ':js', ':som'].includes(command)) language(command.slice(1));
    else if (command === ':help') output('Readers: :t0 :js :som (preserve definitions and values).\nMultiline: :paste, source lines, :end; :cancel discards.\n');
    else if (mode === 't0') scope.eval$(source);
    else {
      const depth = stack.length;
      stack.push(source);
      scope.eval$(mode === 'js' ? 'jsEval' : 'somEval');
      // Match the ARM REPL: display the latest value without consuming it.
      if (stack.length > depth) console.log(stack[stack.length - 1]);
    }
  } catch (error) { output(`Error: ${error?.message ?? error}\n`); }
  prompt();
}
function submitLine() {
  const source = line.join(''), bytes = lineBytes, full = overflow;
  line = []; lineBytes = 0; overflow = false;
  if (paste) {
    if (!full && (source === ':end' || source === ':cancel')) {
      const text = paste.join(''), failed = pasteOverflow;
      paste = undefined; pasteBytes = 0; pasteOverflow = false;
      if (source === ':cancel') prompt();
      else if (failed) { output('Error: input exceeds 65535 UTF8 bytes\n'); prompt(); }
      else evaluate(text, null); // Pasted :commands are source, just like on ARM.
      return;
    }
    pasteOverflow ||= full || pasteBytes + bytes + 1 > 65535;
    if (!pasteOverflow) { paste.push(source + '\n'); pasteBytes += bytes + 1; }
    output('... ');
  } else if (full) { output('Error: input exceeds 65535 UTF8 bytes\n'); prompt(); }
  else if (source === ':paste') { paste = []; output('... '); }
  else evaluate(source, source); // Serial commands match complete, exact lines.
}
function input(text) {
  let echo = '';
  for (const character of text) {
    if (skipLF) { skipLF = false; if (character === '\n') continue; }
    if (character === '\r' || character === '\n') {
      skipLF = character === '\r';
      output(echo + '\n'); echo = ''; submitLine();
    } else if (overflow) echo += character;
    else if (character === '\x7f' || character === '\b') {
      if (line.length) { lineBytes -= byteLength(line.pop()); echo += '\b \b'; }
    } else if (character >= ' ' || character === '\t') {
      const bytes = byteLength(character);
      if (lineBytes + bytes > 65535) overflow = true;
      else { line.push(character); lineBytes += bytes; }
      echo += character;
    }
  }
  if (echo) output(echo);
}
onmessage = ({ data }) => {
  if (data?.type === 'boot' && !mode) {
    try {
      importScripts('./t0.js', './parsers.js', './jsparser.js', './som.js');
      mode = 't0';
      output('TURTLES · JavaScript host\n:t0 / :js / :som switch readers; definitions stay until reboot.\n');
      prompt();
    } catch (error) { postMessage({ type: 'error', message: String(error?.message ?? error) }); }
  } else if (mode && data?.type === 'input' && typeof data.text === 'string') input(data.text);
  else if (mode && data?.type === 'language') {
    output(`:${data.mode}\n`);
    try { language(data.mode); } catch (error) { output(`Error: ${error?.message ?? error}\n`); }
    prompt();
  } else if (mode && data?.type === 'evaluate' && typeof data.source === 'string') {
    output(data.source + '\n');
    evaluate(data.source);
  }
};
