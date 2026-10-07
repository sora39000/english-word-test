// Shared pure logic. Vocabulary is loaded exclusively from words.csv.
export const normalize = value => String(value).trim().toLowerCase();
export const isCorrect = (input, answer) => normalize(input) === normalize(answer);
export const rate = record => record && record.correct + record.incorrect > 0
  ? record.correct / (record.correct + record.incorrect) : null;

export function parseCSV(source) {
  const text = source.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushField = () => { row.push(field); field = ''; closed = false; };
  const pushRow = () => { pushField(); if (row.some(v => v.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else if (c === '\r') { field += '\n'; if (text[i + 1] === '\n') i++; }
      else field += c;
    } else if (c === ',') pushField();
    else if (c === '\n' || c === '\r') { pushRow(); if (c === '\r' && text[i + 1] === '\n') i++; }
    else if (c === '"' && field === '' && !closed) quoted = true;
    else if (closed || c === '"') throw new Error('CSVの引用符の位置が不正です。CSV UTF-8形式で保存し直してください。');
    else field += c;
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません。');
  if (field !== '' || row.length || closed) pushRow();
  return rows;
}

export function loadWords(source) {
  const rows = parseCSV(source);
  if (!rows.length) throw new Error('CSVが空です。');
  const headers = rows.shift().map(v => v.trim());
  if (new Set(headers).size !== headers.length) throw new Error('CSVの列名が重複しています。');
  const front = headers.indexOf('FrontText'), back = headers.indexOf('BackText');
  const ix = headers.findIndex(v => v.toLowerCase() === 'index');
  if (front < 0 || back < 0) throw new Error('CSVに FrontText と BackText の列が必要です。');
  const ids = new Set(), indexes = new Set();
  const words = rows.map((row, i) => {
    const label = `データ${i + 1}件目`;
    if (row.length !== headers.length) throw new Error(`${label}の列数がヘッダーと一致しません。`);
    const question = row[front].trim(), answer = row[back].trim();
    if (!question || !answer) throw new Error(`${label}の問題文または正答が空です。`);
    const rawIndex = ix >= 0 ? row[ix].trim() : String(i + 1);
    const index = Number(rawIndex);
    if (!/^\d+$/.test(rawIndex) || !Number.isSafeInteger(index) || index < 1)
      throw new Error(`${label}のindexは1以上の整数にしてください。`);
    if (indexes.has(index)) throw new Error(`index ${index} が重複しています。`);
    indexes.add(index);
    // Content identity survives appends, reordering and adding an index column.
    const id = JSON.stringify([question, normalize(answer)]);
    if (ids.has(id)) throw new Error(`${label}に同じ問題文・正答の重複があります。`);
    ids.add(id);
    return { id, index, question, answer };
  });
  if (!words.length) throw new Error('CSVに問題がありません。');
  return { words, hasIndex: ix >= 0 };
}

export function latestRangeStart(words) {
  const highest = words.reduce((max, word) => Math.max(max, word.index), 0);
  return highest ? Math.floor((highest - 1) / 50) * 50 + 1 : 1;
}
export function rangeWords(words, range, records) {
  if (range === 'all') return [...words];
  if (range === 'latest') {
    const first = latestRangeStart(words);
    return words.filter(w => w.index >= first && w.index < first + 50).sort((a, b) => b.index - a.index);
  }
  if (range === 'wrong') return words.filter(w => records[w.id]?.last === false);
  const first = Number(range);
  return words.filter(w => w.index >= first && w.index < first + 50);
}
export function weakWords(words, records) {
  return words.filter(w => rate(records[w.id]) !== null && rate(records[w.id]) < 0.8);
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function chooseQuestions(pool, count, mode, records, previous = []) {
  let candidates = shuffle(mode === 'weak' ? weakWords(pool, records) : pool);
  if (mode === 'weak') candidates.sort((a, b) => rate(records[a.id]) - rate(records[b.id]));
  const size = count === 'all' ? candidates.length : Math.min(Number(count), candidates.length);
  let chosen = shuffle(candidates.slice(0, size));
  if (chosen.length > 1 && chosen.length === previous.length && chosen.every((w, i) => w.id === previous[i].id))
    chosen = [...chosen.slice(1), chosen[0]];
  return chosen;
}
export function recordAnswer(records, id, correct) {
  const old = records[id] || { correct: 0, incorrect: 0 };
  const next = { correct: old.correct + Number(correct), incorrect: old.incorrect + Number(!correct), last: correct };
  next.accuracy = rate(next);
  records[id] = next;
  return next;
}
export function freshProgress() { return { version: 1, records: {}, best: {}, completed: 0 }; }
export function readProgress(raw) {
  if (!raw) return freshProgress();
  const value = JSON.parse(raw);
  const count = n => Number.isSafeInteger(n) && n >= 0;
  if (value?.version !== 1 || !value.records || typeof value.records !== 'object' || Array.isArray(value.records)
    || !value.best || typeof value.best !== 'object' || Array.isArray(value.best) || !count(value.completed)) throw new Error('記録の形式が不正です。');
  for (const r of Object.values(value.records)) {
    if (!r || !count(r.correct) || !count(r.incorrect) || typeof r.last !== 'boolean') throw new Error('単語の記録が不正です。');
    r.accuracy = rate(r);
  }
  for (const [size, score] of Object.entries(value.best)) {
    if (!/^\d+$/.test(size) || Number(size) < 1 || !count(score) || score > Number(size)) throw new Error('最高点の記録が不正です。');
  }
  return value;
}
