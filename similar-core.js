import { loadWords, parseCSV, normalize, chooseQuestions, weakWords, shuffle, rate } from './core.js';

// index identifies a variant; SourceIndex identifies its original vocabulary item.
export function loadSimilar(source, originals) {
  const loaded = loadWords(source).words;
  const rows = parseCSV(source);
  const headers = rows.shift().map(value => value.trim());
  const sourceColumn = headers.indexOf('SourceIndex');
  if (sourceColumn < 0) throw new Error('類題CSVにSourceIndex列が必要です。');
  const originalByIndex = new Map(originals.map(word => [word.index, word]));
  return loaded.map((word, i) => {
    const raw = rows[i][sourceColumn].trim();
    const sourceIndex = Number(raw), original = originalByIndex.get(sourceIndex);
    if (!/^\d+$/.test(raw) || !original) throw new Error(`類題${i + 1}のSourceIndexに対応する元の問題がありません。`);
    if (normalize(word.answer) !== normalize(original.answer)) throw new Error(`類題${i + 1}の正答が元の単語と一致しません。`);
    if (word.question === original.question) throw new Error(`類題${i + 1}は元の問題と同じ文です。`);
    // Keep the original content ID so changing hint display preserves saved records.
    const question = word.question.replace(/\nヒント：[^\n]*$/, '') + `\nヒント：頭文字 ${original.answer[0]}`;
    return { ...word, question, variantIndex: word.index, index: sourceIndex };
  });
}

export function chooseSimilarQuestions(pool, count, mode, records, previous = []) {
  const candidates = shuffle(mode === 'weak' ? weakWords(pool, records) : pool);
  if (mode === 'weak') candidates.sort((a, b) => rate(records[a.id]) - rate(records[b.id]));
  const byWord = new Map();
  for (const word of candidates) if (!byWord.has(word.index)) byWord.set(word.index, word);
  return chooseQuestions([...byWord.values()], count, mode, records, previous);
}
