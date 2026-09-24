import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source = readFileSync(new URL('../web/isolation.js', import.meta.url), 'utf8');
function browser({isolated = false, controlled = false, supported = true} = {}) {
  let reloads = 0, activate;
  const events = new Map();
  const serviceWorker = supported ? {
    controller: controlled ? {} : null,
    ready: new Promise(resolve => { activate = resolve; }),
    addEventListener: (name, listener) => events.set(name, listener),
  } : undefined;
  const window = {crossOriginIsolated: isolated, location: {reload() { reloads++; }}};
  runInNewContext(source, {window, navigator: {serviceWorker}});
  return {window, serviceWorker, events, activate, get reloads() {return reloads;}};
}
test('first-install claim reloads after control even when updatefound was missed', async () => {
  const page = browser();
  assert.equal(page.reloads, 0);
  page.activate(); await Promise.resolve();
  assert.equal(page.reloads, 0);
  page.serviceWorker.controller = {};
  page.events.get('controllerchange')();
  assert.equal(page.reloads, 1);
  page.window.coi.doReload(); await Promise.resolve();
  page.events.get('controllerchange')();
  assert.equal(page.reloads, 1, 'racing notifications reload only once');
});
test('updatefound does not reload before activation and client control', async () => {
  const page = browser();
  page.window.coi.doReload();
  assert.equal(page.reloads, 0);
  page.activate(); await Promise.resolve();
  assert.equal(page.reloads, 0);
  page.serviceWorker.controller = {};
  page.events.get('controllerchange')();
  assert.equal(page.reloads, 1);
});
test('already controlled non-isolated navigation can finish setup', async () => {
  const page = browser({controlled: true});
  page.activate(); page.window.coi.doReload(); await Promise.resolve();
  assert.equal(page.reloads, 1);
});
test('isolated or unsupported browsers do not enter a reload loop', async () => {
  const page = browser({isolated: true, controlled: true});
  page.activate(); page.window.coi.doReload(); page.events.get('controllerchange')();
  await Promise.resolve(); assert.equal(page.reloads, 0);
  const unsupported = browser({supported: false});
  unsupported.window.coi.doReload(); assert.equal(unsupported.reloads, 0);
});
