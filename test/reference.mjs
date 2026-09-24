import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { cases, allCases } from './cases.mjs';

const referenceSource = readFileSync(new URL('../vendor/upstream/t0.js', import.meta.url), 'utf8');
const parserSource = readFileSync(new URL('../language/parsers.t0', import.meta.url), 'utf8');
const jsParserSource = readFileSync(new URL('../language/jsparser.t0', import.meta.url), 'utf8');
const jsReplSource = readFileSync(new URL('../language/js-repl.t0', import.meta.url), 'utf8');

function normalizeValue(value, ancestors = new Set()) {
  if (value === undefined) return { type: 'undefined' };
  if (typeof value === 'function') return { type: 'closure' };
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { type: 'number', value: String(value) };
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return { type: 'cycle' };
    const next = new Set(ancestors).add(value);
    return Array.from(value, item => normalizeValue(item, next));
  }
  return value;
}

/**
 * Run source in a fresh, unmodified upstream T0 interpreter.
 *
 * Returns { output: string[], stack: normalizedValue[], diagnostics:
 * { level: string, text: string }[] }. The output array contains T0 print
 * messages. Upstream compiler warnings have multiple console arguments and
 * are recorded separately. Exceptions and timeouts are allowed to propagate.
 * This vm context is for trusted repository test programs, not a security
 * sandbox for arbitrary JavaScript.
 */
export function createReference({ timeoutMs = 1000, loadParsers = false, loadJS = false } = {}) {
  const output = [];
  const diagnostics = [];
  const context = vm.createContext({
    console: {
      log: (...args) => {
        if (args.length === 1) output.push(String(args[0]));
        else diagnostics.push({ level: 'warning', text: args.map(String).join(' ') });
      },
      error: (...args) => diagnostics.push({ level: 'error', text: args.map(String).join(' ') }),
    },
  });
  vm.runInContext(referenceSource, context, {
    filename: 'vendor/upstream/t0.js',
    timeout: timeoutMs,
  });
  for (const [name, library] of [
    ...(loadParsers || loadJS ? [['language/parsers.t0', parserSource]] : []),
    ...(loadJS ? [['language/jsparser.t0', jsParserSource]] : []),
    ...(loadJS ? [['language/js-repl.t0', jsReplSource]] : []),
  ]) {
    context.librarySource = library;
    vm.runInContext('scope.eval$(librarySource)', context, { filename: name, timeout: timeoutMs });
  }
  const snapshot = (outputStart = 0, diagnosticStart = 0) => ({
    output: output.slice(outputStart),
    stack: Array.from(context.stack, value => normalizeValue(value)),
    diagnostics: diagnostics.slice(diagnosticStart),
  });
  const evaluate = source => {
    if (typeof source !== 'string') throw new TypeError('T0 source must be a string');
    const outputStart = output.length;
    const diagnosticStart = diagnostics.length;
    context.testSource = source;
    vm.runInContext('scope.eval$(testSource)', context, {
      filename: 'reference-test.t0',
      timeout: timeoutMs,
    });
    return snapshot(outputStart, diagnosticStart);
  };
  const compileJS = source => {
    if (!loadJS) throw new Error('compileJS requires createReference({ loadJS: true })');
    if (typeof source !== 'string') throw new TypeError('JS-like source must be a string');
    context.testSource = source;
    vm.runInContext('stack.push(testSource); scope.eval$("jsCompile"); compiledSource = stack.pop();', context, {
      filename: 'reference-js-compile.t0',
      timeout: timeoutMs,
    });
    return context.compiledSource;
  };
  const evaluateJS = source => {
    const outputStart = output.length;
    const diagnosticStart = diagnostics.length;
    const compiled = compileJS(source);
    const accepted = typeof compiled === 'string';
    if (accepted) evaluate(compiled);
    return { source, compiled, accepted, ...snapshot(outputStart, diagnosticStart) };
  };
  return { evaluate, compileJS, evaluateJS, snapshot };
}

export function runReference(source, options = {}) {
  const reference = createReference(options);
  reference.evaluate(source);
  return reference.snapshot();
}

/** Evaluate one or more JS-like REPL lines in a shared reference environment. */
export function runJSReference(sources, options = {}) {
  const reference = createReference({ ...options, loadJS: true });
  const steps = (Array.isArray(sources) ? sources : [sources]).map(source => reference.evaluateJS(source));
  return {
    steps,
    ...reference.snapshot(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter(arg => !['--extended', '--json'].includes(arg));
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(' ')}`);
  const selected = args.includes('--extended') ? allCases : cases;
  const results = selected.map(test => {
    try {
      const result = runReference(test.source);
      assert.deepEqual(result.output, test.expected);
      assert.equal(result.diagnostics.filter(item => item.level === 'error').length, 0);
      return { name: test.name, passed: true, ...result };
    } catch (error) {
      return { name: test.name, passed: false, error: String(error) };
    }
  });
  if (args.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const result of results) {
      console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.name}`);
      if (!result.passed) console.error(result.error);
    }
    console.log(`${results.filter(result => result.passed).length}/${results.length} reference cases passed`);
  }
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
