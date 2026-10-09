import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWords, rangeWords, chooseQuestions, freshProgress, recordAnswer, weakWords } from '../core.js';
import { loadSimilar } from '../similar-core.js';
const csv = readFileSync(new URL('../similar.csv', import.meta.url), 'utf8');
const originals = loadWords(readFileSync(new URL('../words.csv', import.meta.url), 'utf8')).words;
const variants = loadSimilar(csv, originals);
test('100 distinct variants cover exactly the first 50 words twice with unchanged answers', () => {
  assert.equal(variants.length, 100);
  assert.equal(new Set(variants.map(w => w.id)).size, 100);
  for (const original of originals.filter(w => w.index <= 50)) {
    const group = variants.filter(w => w.index === original.index);
    assert.equal(group.length, 2);
    for (const word of group) {
      assert.equal(word.answer, original.answer);
      assert.notEqual(word.question, original.question);
      assert.equal((word.question.match(/\(  \)/g) || []).length, 1);
      assert.ok(!word.question.toLowerCase().includes(word.answer.toLowerCase()));
    }
  }
  assert.ok(variants.every(w => w.index >= 1 && w.index <= 50));
});
test('ranges use source vocabulary numbers, never variant row numbers', () => {
  assert.equal(rangeWords(variants, '1', {}).length, 100);
  assert.equal(rangeWords(variants, '51', {}).length, 0);
  const more = loadSimilar('index,SourceIndex,FrontText,BackText\n101,51,Another question,analyze', originals);
  assert.equal(rangeWords([...variants, ...more], '51', {}).length, 1);
  assert.equal(rangeWords([...variants, ...more], 'latest', {})[0].index, 51);
  for (const count of ['10', '20', '30', '50', 'all']) {
    const chosen = chooseQuestions(variants, count, 'normal', {});
    assert.equal(chosen.length, count === 'all' ? 100 : Number(count));
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
