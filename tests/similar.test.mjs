import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWords, rangeWords, chooseQuestions, freshProgress, recordAnswer, weakWords } from '../core.js';
import { loadSimilar, chooseSimilarQuestions, gradeSimilarAnswer } from '../similar-core.js';
const csv = readFileSync(new URL('../similar.csv', import.meta.url), 'utf8');
const originals = loadWords(readFileSync(new URL('../words.csv', import.meta.url), 'utf8')).words;
const variants = loadSimilar(csv, originals);
test('200 distinct variants cover both 50-word ranges twice with unchanged answers', () => {
  assert.equal(variants.length, 200);
  assert.equal(new Set(variants.map(w => w.id)).size, 200);
  for (const original of originals) {
    const group = variants.filter(w => w.index === original.index);
    assert.equal(group.length, 2);
    for (const word of group) {
      assert.equal(word.answer, original.answer);
      assert.notEqual(word.question, original.question);
      assert.equal((word.question.match(/\(  \)/g) || []).length, 1);
      assert.ok(!word.question.toLowerCase().includes(word.answer.toLowerCase()));
    }
  }
  assert.ok(variants.every(w => w.index >= 1 && w.index <= 100));
});
test('ranges use source vocabulary numbers, never variant row numbers', () => {
  assert.equal(rangeWords(variants, '1', {}).length, 100);
  assert.equal(rangeWords(variants, '51', {}).length, 100);
  const more = loadSimilar('index,SourceIndex,FrontText,BackText\n101,51,Another question,analyze', originals);
  assert.equal(rangeWords([...variants, ...more], '51', {}).length, 101);
  assert.ok(rangeWords([...variants, ...more], 'latest', {}).every(w => w.index >= 51));
  for (const count of ['10', '20', '30', '50', 'all']) {
    const chosen = chooseQuestions(variants, count, 'normal', {});
    assert.equal(chosen.length, count === 'all' ? 200 : Number(count));
    assert.equal(new Set(chosen.map(w => w.id)).size, chosen.length);
  }
});
test('wrong answers and weak selection stay at variant level; originals are untouched', () => {
  const normal = freshProgress(), similar = freshProgress();
  const before = JSON.stringify(normal), word = variants[0];
  recordAnswer(similar.records, word.id, false);
  assert.equal(rangeWords(variants, 'wrong', similar.records).length, 1);
  assert.equal(weakWords(variants, similar.records).length, 1);
  recordAnswer(similar.records, word.id, true);
  assert.equal(rangeWords(variants, 'wrong', similar.records).length, 0);
  assert.equal(JSON.stringify(normal), before);
  assert.ok(!originals.some(w => w.id === word.id));
});
test('reject missing source, mismatched answer, duplicate or unchanged examples', () => {
  for (const invalid of [
    'index,FrontText,BackText\n1,x,suitable',
    'index,SourceIndex,FrontText,BackText\n1,999,x,suitable',
    'index,SourceIndex,FrontText,BackText\n1,1,x,wrong',
    'index,SourceIndex,FrontText,BackText\n1,1,x,suitable\n1,1,y,suitable',
    'index,SourceIndex,FrontText,BackText\n1,1,x,suitable\n2,1,x,suitable'
  ]) assert.throws(() => loadSimilar(invalid, originals));
  const original = originals[0];
  const escape = s => '"' + s.replaceAll('"', '""') + '"';
  assert.throws(() => loadSimilar('index,SourceIndex,FrontText,BackText\n1,1,' + escape(original.question) + ',' + escape(original.answer), originals));
});

test('each test samples one variant per word and exposes only the first-letter hint', () => {
  for (const count of ['10', '20', '30', '50', 'all']) {
    for (let run = 0; run < 10; run++) {
      const sample = chooseSimilarQuestions(variants, count, 'normal', {});
      assert.equal(sample.length, count === 'all' ? 100 : Number(count));
      assert.equal(new Set(sample.map(w => w.index)).size, sample.length);
      assert.ok(sample.every(w => !/\d+文字/.test(w.question)));
      assert.ok(sample.every(w => w.question.endsWith('ヒント：頭文字 ' + w.answer[0])));
    }
  }
  const old = loadWords(csv).words;
  assert.deepEqual(variants.map(w => w.id), old.map(w => w.id));
  const random = Math.random;
  try {
    Math.random = () => .99999;
    const first = chooseSimilarQuestions(variants, 'all', 'normal', {});
    Math.random = () => 0;
    const second = chooseSimilarQuestions(variants, 'all', 'normal', {});
    assert.ok(first.some(w => second.find(v => v.index === w.index).id !== w.id));
  } finally { Math.random = random; }
});
test('weak and wrong-only practice cannot repeat a vocabulary item', () => {
  const records = {};
  for (const w of variants) recordAnswer(records, w.id, false);
  for (const mode of ['normal', 'weak']) {
    const sample = chooseSimilarQuestions(rangeWords(variants, 'wrong', records), 'all', mode, records);
    assert.equal(sample.length, 100);
    assert.equal(new Set(sample.map(w => w.index)).size, 100);
  }
});

test('each named range produces exactly 50 unique vocabulary items with no mixing', () => {
  for (const first of [1, 51]) {
    const pool = rangeWords(variants, String(first), {});
    assert.equal(pool.length, 100);
    for (let i = 0; i < 20; i++) {
      const sample = chooseSimilarQuestions(pool, 'all', 'normal', {});
      assert.equal(sample.length, 50);
      assert.equal(new Set(sample.map(w => w.index)).size, 50);
      assert.ok(sample.every(w => w.index >= first && w.index < first + 50));
    }
  }
});
test('optional s is accepted only when designated by the answer', () => {
  for (const input of ['afterward', 'afterwards', ' AFTERWARDS ', 'afterward(s)']) assert.ok(gradeSimilarAnswer(input, 'afterward(s)'));
  assert.ok(!gradeSimilarAnswer('afterwardss', 'afterward(s)'));
  assert.ok(!gradeSimilarAnswer('finding', 'findings'));
});
