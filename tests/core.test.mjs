import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, loadWords, isCorrect, rangeWords, latestRangeStart, weakWords, chooseQuestions, recordAnswer, freshProgress, readProgress, rate } from '../core.js';
const csv = readFileSync(new URL('../words.csv', import.meta.url), 'utf8');
test('current project CSV: usable questions with unique identities and indexes', () => {
  const data = loadWords(csv); assert.ok(data.words.length > 0);
  assert.equal(new Set(data.words.map(w => w.id)).size, data.words.length);
  assert.equal(new Set(data.words.map(w => w.index)).size, data.words.length);
  assert.ok(data.words.every(w => w.question && w.answer));
});
test('CSV quotes, commas, embedded newline, escaped quote, BOM, CRLF', () => {
  assert.deepEqual(parseCSV('\uFEFFFrontText,BackText\r\n"a, ""b""\r\nc",yes\r\n'), [['FrontText', 'BackText'], ['a, "b"\nc', 'yes']]);
  assert.equal(loadWords('FrontText,BackText\n"<script>test</script>",x').words[0].question, '<script>test</script>');
});
test('invalid data reports errors rather than silently dropping rows', () => {
  for (const invalid of ['', 'A,B\nx,y', 'FrontText,BackText\n"a,b', 'FrontText,BackText\na,', 'FrontText,BackText\na,b,c', 'FrontText,BackText\na,b\na,b', 'index,FrontText,BackText\n0,a,b', 'index,FrontText,BackText\n1,a,b\n1,c,d', 'index,FrontText,BackText\n,a,b', 'FrontText,BackText\n"a"x,b', 'FrontText,BackText,BackText\na,b,c']) assert.throws(() => loadWords(invalid));
});
test('matching ignores case and outer whitespace but not missing letters', () => {
  assert.ok(isCorrect('  SuITaBle\n', 'suitable')); assert.ok(!isCorrect('suitabl', 'suitable')); assert.ok(!isCorrect('', 'suitable')); assert.ok(!isCorrect('sui table', 'suitable'));
});
const growing = size => loadWords('index,FrontText,BackText\n' + Array.from({ length: size }, (_, i) => `${i + 1},Question ${i + 1},answer${i + 1}`).join('\n')).words;
test('50/100/150/200 records: ranges, latest, full set and sample size', () => {
  for (const size of [50, 100, 150, 200]) {
    const words = growing(size);
    assert.equal(rangeWords(words, 'all', {}).length, size);
    assert.deepEqual(rangeWords(words, 'latest', {}).map(w => w.index), Array.from({ length: 50 }, (_, i) => size - i));
    for (let start = 1; start <= size; start += 50) assert.equal(rangeWords(words, String(start), {}).length, 50);
    for (const count of ['10', '20', '30', '50', 'all']) {
      const sample = chooseQuestions(words, count, 'normal', {});
      assert.equal(sample.length, count === 'all' ? size : Number(count)); assert.equal(new Set(sample.map(w => w.id)).size, sample.length);
    }
  }
});
test('index handles gaps and out-of-order data; latest stays within newest block', () => {
  const words = loadWords('index,FrontText,BackText\n101,c,c\n1,a,a\n51,b,b').words;
  assert.equal(rangeWords(words, '51', {})[0].index, 51); assert.equal(rangeWords(words, 'latest', {})[0].index, 101);
  assert.equal(rangeWords(words, 'latest', {}).length, 1);
  assert.equal(chooseQuestions(words, '50', 'normal', {}).length, 3);
});
test('new batches never borrow questions from earlier batches, even with partial additions', () => {
  for (const size of [51, 75, 100, 101, 125, 150, 151, 175, 200]) {
    const words = growing(size), first = Math.floor((size - 1) / 50) * 50 + 1;
    assert.equal(latestRangeStart(words), first);
    for (const range of ['latest', String(first)]) {
      const pool = rangeWords(words, range, {}), records = {};
      assert.equal(pool.length, size - first + 1);
      for (const word of words) recordAnswer(records, word.id, false);
      for (const mode of ['normal', 'weak']) {
        for (const count of ['10', '50', 'all']) {
          const selected = chooseQuestions(pool, count, mode, records);
          assert.ok(selected.length > 0);
          assert.ok(selected.every(w => w.index >= first && w.index <= size));
          const repeated = chooseQuestions(pool, count, mode, records, selected);
          assert.ok(repeated.every(w => w.index >= first && w.index <= size));
        }
      }
    }
  }
  assert.deepEqual(rangeWords([], 'latest', {}), []);
});
test('tracking, latest-wrong filter, weakest priority and persistence round trip', () => {
  const words = growing(4), data = freshProgress();
  recordAnswer(data.records, words[0].id, false);
  recordAnswer(data.records, words[1].id, false); recordAnswer(data.records, words[1].id, true);
  recordAnswer(data.records, words[2].id, true);
  assert.equal(rangeWords(words, 'wrong', data.records).length, 1);
  assert.equal(weakWords(words, data.records).length, 2);
  assert.equal(chooseQuestions(words, '1', 'weak', data.records)[0].id, words[0].id);
  assert.equal(rate(data.records[words[1].id]), .5); assert.equal(data.records[words[1].id].accuracy, .5);
  assert.deepEqual(readProgress(JSON.stringify(data)), data);
  assert.throws(() => readProgress('{bad')); assert.throws(() => readProgress('{"version":7}'));
});
test('stable identity across append, reorder and adding index; content edits get a new record', () => {
  const a = loadWords('FrontText,BackText\nq,a').words[0];
  const b = loadWords('index,FrontText,BackText\n2,other,x\n1,q,A').words[1];
  assert.equal(a.id, b.id); assert.notEqual(a.id, loadWords('FrontText,BackText\nq,b').words[0].id);
});
test('repeat test avoids identical order; one-question and empty pools remain safe', () => {
  const original = Math.random;
  try { Math.random = () => .999; const words = growing(3); const repeat = chooseQuestions(words, 'all', 'normal', {}, words); assert.notDeepEqual(repeat, words); assert.equal(repeat.length, 3); }
  finally { Math.random = original; }
  assert.equal(chooseQuestions(growing(1), 'all', 'normal', {}).length, 1);
  assert.deepEqual(chooseQuestions([], '10', 'normal', {}), []);
});

