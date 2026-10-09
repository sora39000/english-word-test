import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as core from '../core.js';
import { loadSimilar } from '../similar-core.js';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const baseCSV = readFileSync(new URL('../words.csv', import.meta.url), 'utf8');
const similarCSV = readFileSync(new URL('../similar.csv', import.meta.url), 'utf8');

// A small DOM adapter exercises the actual app's persistence and event handlers.
async function openApp(similar, storage) {
  const nodes = new Map();
  const makeNode = () => ({
    value: '', hidden: false, disabled: false, textContent: '', children: [], events: {},
    classList: { toggle() {} }, parentElement: { open: false },
    setAttribute() {}, removeAttribute() {}, focus() {},
    addEventListener(name, fn) { this.events[name] = fn; },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); }
  });
  const get = id => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); };
  const document = {
    body: { dataset: { practice: similar ? 'similar' : '' } },
    getElementById: get, createElement: makeNode,
    querySelector: () => ({ value: '10' }), addEventListener() {}
  };
  const location = { pathname: similar ? '/english-word-test/similar.html' : '/english-word-test/' };
  const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const fetch = async path => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(path.includes('similar.csv') ? similarCSV : baseCSV).buffer });
  const window = { addEventListener() {}, scrollTo() {} };
  const code = source.replace(/^import .*;\n/, '')
    .replace("await import('./similar-core.js?v=1')", 'similarModule')
    .replace(/init\(\);\s*$/, 'return { init, start, grade, next, renderStats, getSession: () => session };');
  const app = new Function(...Object.keys(core), 'similarModule', 'document', 'location', 'localStorage', 'fetch', 'window', code)(...Object.values(core), { loadSimilar }, document, location, localStorage, fetch, window);
  await app.init();
  assert.equal(get('load-error').textContent, '');
  return { ...app, get };
}
test('original app and variants grade, finish, retry and persist in separate stores', async () => {
  const storage = new Map();
  const normal = await openApp(false, storage);
  normal.get('range').value = '51';
  normal.get('range').events.change();
  normal.start('normal');
  assert.ok(normal.getSession().questions.every(w => w.index >= 51 && w.index <= 100));
  normal.get('answer').value = normal.getSession().questions[0].answer;
  normal.grade();
  const originalKey = 'kotoba-note:v1:/english-word-test';
  const originalRecord = storage.get(originalKey);
  assert.equal(Object.values(JSON.parse(originalRecord).records)[0].correct, 1);
  const variants = await openApp(true, storage);
  assert.equal(variants.get('total-words').textContent, 100);
  variants.start('normal');
  assert.ok(variants.getSession().questions.every(w => w.index >= 1 && w.index <= 50));
  for (let i = 0; i < 10; i++) {
    variants.get('answer').value = i === 0 ? 'wrong answer' : variants.getSession().questions[i].answer;
    variants.grade(); variants.grade(); variants.next();
  }
  assert.equal(variants.get('result-score').textContent, 9);
  const variantKey = 'word-up:similar:v1:/english-word-test/similar.html';
  const result = JSON.parse(storage.get(variantKey));
  assert.equal(result.completed, 1);
  assert.equal(result.best[10], 9);
  assert.equal(Object.values(result.records).reduce((sum, r) => sum + r.correct + r.incorrect, 0), 10);
  assert.equal(storage.get(originalKey), originalRecord);
  variants.get('retry-wrong').events.click();
  assert.equal(variants.getSession().questions.length, 1);
  variants.renderStats();
  const reopened = await openApp(false, storage);
  assert.equal(reopened.get('range').value, '51');
  const similarReopened = await openApp(true, storage);
  assert.equal(similarReopened.get('range').value, '1');
  assert.equal(storage.get(originalKey), originalRecord);
});
test('HTML pages declare all IDs used by the shared app', () => {
  for (const path of ['../index.html', '../similar.html']) {
    const html = readFileSync(new URL(path, import.meta.url), 'utf8');
    const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const match of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), match[1]);
  }
});
