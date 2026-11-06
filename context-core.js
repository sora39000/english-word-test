export function shuffle(items, random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const rate = record => record && record.correct + record.incorrect ? record.correct / (record.correct + record.incorrect) : null;
export function validateData(data) {
  if (data?.version !== 1 || !Array.isArray(data.words) || data.words.length !== 50) throw Error('問題データの形式が正しくありません。');
  const ids = new Set(data.words.map(w => w.id)), variants = new Set();
  if (ids.size !== 50) throw Error('単語番号が重複しています。');
  for (const w of data.words) {
    if (!Number.isInteger(w.id) || !w.word || !w.meaning || !w.pos || !Array.isArray(w.variants) || w.variants.length !== 5) throw Error('単語データが不足しています。');
    for (const v of w.variants) {
      if (!v.id || variants.has(v.id) || typeof v.sentence !== 'string' || v.sentence.split('_____').length !== 2 || !v.translation || !v.clue || !Array.isArray(v.options) || v.options.length !== 4 || new Set(v.options).size !== 4 || !v.options.includes(w.id) || v.options.some(id => !ids.has(id))) throw Error('問題・選択肢データが正しくありません。');
      variants.add(v.id);
    }
  }
  return data.words;
}
export function freshState() { return { version: 1, records: {}, history: {}, best: {}, completed: 0 }; }
export function readState(raw) {
  if (!raw) return freshState();
  const s = JSON.parse(raw);
  const count = n => Number.isSafeInteger(n) && n >= 0;
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  if (s?.version !== 1 || !object(s.records) || !object(s.history) || !object(s.best) || !count(s.completed)) throw Error('保存記録の形式が正しくありません。');
  for (const r of Object.values(s.records)) if (!object(r) || !count(r.correct) || !count(r.incorrect) || typeof r.last !== 'boolean') throw Error('学習記録を読み込めません。');
  for (const h of Object.values(s.history)) if (!object(h) || !Array.isArray(h.seen) || !Array.isArray(h.recent) || ![...h.seen, ...h.recent].every(id => typeof id === 'string')) throw Error('出題履歴を読み込めません。');
  for (const [n,score] of Object.entries(s.best)) if (!/^[1-9]\d*$/.test(n) || Number(n) > 50 || !count(score) || score > Number(n)) throw Error('最高点の形式が正しくありません。');
  return s;
}
export function chooseVariant(word, history, random = Math.random) {
  const h = history[word.id] || { seen: [], recent: [] };
  let candidates = word.variants.filter(v => !h.seen.includes(v.id) && !h.recent.slice(-2).includes(v.id));
  if (!candidates.length) candidates = word.variants.filter(v => !h.recent.slice(-2).includes(v.id));
  return candidates[Math.floor(random() * candidates.length)];
}
export function markShown(word, variant, history) {
  const h = history[word.id] || { seen: [], recent: [] };
  const valid = new Set(word.variants.map(v => v.id));
  let seen = [...new Set(h.seen.filter(id => valid.has(id)))];
  if (seen.length >= word.variants.length) seen = [];
  if (!seen.includes(variant.id)) seen.push(variant.id);
  history[word.id] = { seen, recent: [...h.recent, variant.id].slice(-2) };
}
export function recordAnswer(state, id, correct) {
  const old = state.records[id] || { correct: 0, incorrect: 0 };
  state.records[id] = { correct: old.correct + Number(correct), incorrect: old.incorrect + Number(!correct), last: correct };
}
export function makeTest(words, state, mode = 'normal', retryIds = [], previous = []) {
  const requested = new Set(retryIds);
  let pool = words.filter(w => mode === 'wrong' ? requested.has(w.id) : mode === 'weak' ? rate(state.records[w.id]) !== null && rate(state.records[w.id]) < .8 : true);
  pool = shuffle(pool);
  if (pool.length > 1 && pool.length === previous.length && pool.every((w,i) => w.id === previous[i])) pool.push(pool.shift());
  return pool;
}
