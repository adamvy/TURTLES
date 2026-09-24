import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createReference, runReference, runJSReference } from './reference.mjs';
import { jsCases, invalidJSCases } from './js-cases.mjs';

for (const example of jsCases) {
  test(`JS-like reference: ${example.name}`, () => {
    const result = runJSReference(example.sources, { timeoutMs: 3000 });
    assert(result.steps.every(step => step.accepted));
    assert.deepEqual(result.stack, example.expected);
    assert.deepEqual(result.output, [], 'Loading or running the clean library must not print demos');
    assert.deepEqual(result.diagnostics.filter(item => item.level === 'error'), []);
  });
}

for (const source of invalidJSCases) {
  test(`JS-like parser rejects: ${JSON.stringify(source)}`, () => {
    const result = runJSReference(['answer=42', source, 'answer'], { timeoutMs: 3000 });
    assert.equal(result.steps[1].compiled, false);
    assert.equal(result.steps[1].accepted, false);
    assert.deepEqual(result.stack, [42, 42], 'Invalid input must not evaluate a valid prefix or corrupt existing variables');
  });
}

test('parser construction leaves primitive if and while usable', () => {
  const result = runReference('FormulaCompiler drop true { | 42 } if print { | false } { | 99 } while', { loadJS: true });
  assert.deepEqual(result.output, ['42']);
  assert.deepEqual(result.stack, []);
});

test('EOF cannot match character parsers', () => {
  const result = runReference('" " 0 nil false PStream :ps ps \'0 \'9 range () print ps \'x notChars () print ps \'null anyChar () print', { loadParsers: true });
  assert.deepEqual(result.output, ['false', 'false', 'false']);
});

test('jsCompile leaves only its compiled result and jsEval reports syntax error', () => {
  const oracle = createReference({ loadJS: true });
  assert.equal(oracle.compileJS('1+2').trim(), '1 2 +');
  assert.deepEqual(oracle.snapshot().stack, []);
  assert.deepEqual(oracle.evaluate('" 1 trailing" jsEval').output, ['Error: invalid JS-like source']);
  assert.deepEqual(oracle.evaluate('" 6*7" jsEval').stack, [42]);
});

test('complete original frontend sources are retained', () => {
  const parser = readFileSync(new URL('../vendor/upstream/parsers.js', import.meta.url), 'utf8');
  const compiler = readFileSync(new URL('../vendor/upstream/jsparser.js', import.meta.url), 'utf8');
  assert.match(parser, /\} \/\* tok \*\/ \} ::litMap/);
  assert.match(compiler, /'startCommentTest print/);
  assert.match(compiler, /scope\['js\{'\]/);
  assert.match(compiler, /'expr12 '\+\- anyChar 'expr11 binary/);
});


test('FormulaCompiler parse$ retains its compiled-text API', () => {
  const oracle = createReference({ loadJS: true, timeoutMs: 3000 });
  const result = oracle.evaluate('" 1+2" FormulaCompiler .parse$');
  assert.equal(result.stack.length, 1);
  assert.equal(result.stack[0].trim(), '1 2 +');
  assert.deepEqual(oracle.evaluate('eval print').output, ['3']);
});
