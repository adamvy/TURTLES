// Keep the original interpreter off the UI thread so even an infinite program
// can be interrupted by terminating this worker on power-off or reboot.
let mode;
const output = text => postMessage({ type: 'uart', text });
const prompt = () => output(`${mode}> `);
console.log = (...values) => output(values.map(String).join(' ') + '\n');
function language(next) {
  if (!['t0', 'js', 'som'].includes(next)) throw new Error('Unknown language');
  mode = next;
}
onmessage = ({ data }) => {
  if (data?.type === 'boot' && !mode) {
    try {
      importScripts('./t0.js', './parsers.js', './jsparser.js', './som.js');
      mode = 't0';
      output('TURTLES · JavaScript host\n:t0 / :js / :som switch readers; definitions stay until reboot.\n');
      prompt();
    } catch (error) { postMessage({ type: 'error', message: String(error?.message ?? error) }); }
  } else if (mode && (data?.type === 'language' || (data?.type === 'evaluate' && typeof data.source === 'string'))) {
    const source = data.type === 'language' ? `:${data.mode}` : data.source;
    output(source + '\n');
    try {
      const command = source.trim();
      if (data.type === 'language') language(data.mode);
      else if ([':t0', ':js', ':som'].includes(command)) language(command.slice(1));
      else if (command === ':help') output(':t0 / :js / :som switch readers without clearing state. Reboot starts over.\n');
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
};
