import { loadWords, parseCSV, normalize } from './core.js';

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
    return { ...word, variantIndex: word.index, index: sourceIndex };
  });
}
