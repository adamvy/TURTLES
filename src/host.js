// Keep the original interpreter off the UI thread so even an infinite program
// can be interrupted by terminating this worker on power-off or reboot.
let mode;
const output = text => postMessage({ type: 'uart', text });
const prompt = () => output(`${mode}> `);
console.log = (...values) => output(values.map(String).join(' ') + '\n');
onmessage = ({ data }) => {
  if (data?.type === 'boot' && !mode) {
    try {
      if (!['t0', 'js'].includes(data.mode)) throw new Error('Unknown guest mode');
      importScripts('./t0.js');
      if (data.mode === 'js') importScripts('./parsers.js', './jsparser.js');
      mode = data.mode;
      output(`TURTLES ${mode === 'js' ? 'JS-like' : 'T0'} · JavaScript host\n`);
      prompt();
    } catch (error) { postMessage({ type: 'error', message: String(error?.message ?? error) }); }
  } else if (data?.type === 'evaluate' && mode && typeof data.source === 'string') {
    output(data.source + '\n');
    try {
      const depth = stack.length;
      if (mode === 'js') {
        stack.push(data.source);
        scope.eval$('jsEval');
        // Match the ARM REPL: display the latest value without consuming it.
        if (stack.length > depth) console.log(stack[stack.length - 1]);
      } else scope.eval$(data.source);
    } catch (error) { output(`Error: ${error?.message ?? error}\n`); }
    prompt();
  }
};
