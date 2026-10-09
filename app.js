import { loadWords, rangeWords, latestRangeStart, weakWords, chooseQuestions, isCorrect, recordAnswer, rate, freshProgress, readProgress } from './core.js';

const $ = id => document.getElementById(id);
const isSimilar = document.body.dataset.practice === 'similar';
const key = `${isSimilar ? 'word-up:similar:v1' : 'kotoba-note:v1'}:${location.pathname.replace(/index\.html$/, '').replace(/\/$/, '')}`;
let words = [], hasIndex = false, progress = freshProgress(), canSave = true;
let chooseSimilarQuestions, gradeSimilarAnswer;
const questionCount = pool => isSimilar ? new Set(pool.map(word => word.index)).size : pool.length;
let session = null, screen = 'start', pendingNavigation = null, quitTrigger = null;
const testName = first => {
  const number = Math.floor((first - 1) / 50) + 1;
  return `英単語テスト${number <= 20 ? String.fromCodePoint(0x2460 + number - 1) : `（${number}）`}`;
};
const percent = n => n === null ? '—' : String(Math.round(n * 100));
const warnStorage = message => { $('storage-warning').textContent = message; $('storage-warning').hidden = false; };
try { progress = readProgress(localStorage.getItem(key)); }
catch { canSave = false; warnStorage('保存済みの記録を読み込めませんでした。このページでは一時的に学習できますが、新しい記録は保存されません。元の記録は上書きしていません。ブラウザの保存設定を確認してください。'); }
function save() {
  if (!canSave) return;
  try { localStorage.setItem(key, JSON.stringify(progress)); }
  catch { canSave = false; warnStorage('学習記録を保存できません。このページを閉じると今回の記録は失われます。ブラウザの保存設定や空き容量を確認してください。'); }
}
// Store the concrete bucket so adding a new CSV batch never moves the selection.
const rangeKey = `${key}:selected-range`;
function rememberRange() {
  const selected = $('range').value;
  const value = selected === 'latest' ? String(latestRangeStart(words)) : selected;
  try { localStorage.setItem(rangeKey, value); }
  catch { warnStorage('出題範囲を保存できません。ブラウザの保存設定や空き容量を確認してください。'); }
}
function restoreRange(buckets) {
  let saved = null;
  try { saved = localStorage.getItem(rangeKey); } catch {}
  const valid = saved === 'all' || saved === 'wrong' || buckets.some(n => String(n) === saved);
  $('range').value = valid ? saved : String(buckets[0]);
  rememberRange();
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function empty(target, message) { target.replaceChildren(element('p', 'empty', message)); }
function selectedCount() { return document.querySelector('input[name="count"]:checked').value; }
function poolFor(range = $('range').value) { return rangeWords(words, range, progress.records); }
function updateOverview() {
  let correct = 0, incorrect = 0, studied = 0;
  const studiedIndexes = new Set();
  for (const word of words) {
    const record = progress.records[word.id];
    if (record) { correct += record.correct; incorrect += record.incorrect; if (record.correct + record.incorrect) { studied++; studiedIndexes.add(word.index); } }
  }
  if (isSimilar) studied = studiedIndexes.size;
  $('total-words').textContent = questionCount(words);
  $('studied-words').textContent = studied;
  $('overall-rate').textContent = percent(correct + incorrect ? correct / (correct + incorrect) : null);
  return { correct, incorrect, studied };
}
function updateSettings() {
  const pool = poolFor(), weak = weakWords(pool, progress.records);
  const total = questionCount(pool), weakTotal = questionCount(weak);
  const count = selectedCount(), actual = count === 'all' ? total : Math.min(Number(count), total);
  $('start-normal').disabled = pool.length === 0;
  $('start-weak').disabled = weak.length === 0;
  $('range-note').textContent = `${total}問が対象 · 今回は${actual}問出題${total && count !== 'all' && total < Number(count) ? '（対象数に合わせて調整）' : ''}`;
  $('weak-note').textContent = weak.length ? `苦手問題 ${weakTotal}問 · 正答率の低い問題から優先` : 'この範囲に苦手問題はまだありません。まずは通常テストへ。';
}
function show(name, focus = true) {
  screen = name;
  for (const id of ['start', 'test', 'result', 'stats']) $(`${id}-screen`).hidden = id !== name;
  for (const [id, active] of [['nav-start', name !== 'stats'], ['nav-stats', name === 'stats']]) {
    $(id).classList.toggle('active', active);
    if (active) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
  }
  if (name === 'start') { updateOverview(); updateSettings(); }
  if (name === 'stats') renderStats();
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (focus && $(name + '-title')) { const title = $(name + '-title'); title.tabIndex = -1; title.focus({ preventScroll: true }); }
}
function navigate(name) {
  if (screen === 'test') {
    pendingNavigation = name; quitTrigger = document.activeElement;
    $('quit-dialog').hidden = false; $('cancel-quit').focus(); return;
  }
  show(name);
}
function closeQuit(confirmed) {
  $('quit-dialog').hidden = true;
  if (!confirmed) { pendingNavigation = null; quitTrigger?.focus(); return; }
  const destination = pendingNavigation || 'start'; pendingNavigation = null;
  if (screen === 'test') session = null;
  show(destination);
}
function start(mode, options = {}) {
  const config = options.config || { mode, range: $('range').value, count: selectedCount(), fixed: null };
  const pool = config.fixed || poolFor(config.range);
  const chosen = (isSimilar ? chooseSimilarQuestions : chooseQuestions)(pool, config.count, config.mode, progress.records, options.previous || []);
  if (!chosen.length) { show('start'); return; }
  session = { config, questions: chosen, cursor: 0, answers: [], graded: false, finished: false };
  const blocks = [...new Set(chosen.map(word => Math.floor((word.index - 1) / 50) * 50 + 1))];
  $('test-title').textContent = blocks.length === 1 ? testName(blocks[0]) : '全範囲のテスト';
  $('test-mode').textContent = config.fixed ? 'REVIEW / 間違えた問題の復習' : config.mode === 'weak' ? 'FOCUS / 苦手問題テスト' : isSimilar ? 'VARIATIONS / 類題で練習' : 'PRACTICE / 通常テスト';
  show('test', false); renderQuestion();
}
function renderQuestion() {
  const word = session.questions[session.cursor];
  session.graded = false;
  $('position').textContent = `${session.cursor + 1} / ${session.questions.length} 問`;
  $('live-score').textContent = `正解 ${session.answers.filter(a => a.correct).length}問`;
  $('progress').max = session.questions.length; $('progress').value = session.answers.length;
  $('question-index').textContent = `WORD ${String(word.index).padStart(3, '0')}${isSimilar ? ` · 類題 ${word.variantIndex}` : ''}`;
  $('question').textContent = word.question;
  $('answer').value = ''; $('answer').readOnly = false; $('answer').removeAttribute('aria-invalid');
  $('feedback').hidden = true; $('feedback').replaceChildren();
  $('grade').disabled = false; $('next').disabled = true;
  $('next').textContent = session.cursor === session.questions.length - 1 ? '結果を見る →' : '次へ →';
  $('answer').focus({ preventScroll: true });
}
function grade() {
  if (!session || session.graded || session.finished) return;
  const word = session.questions[session.cursor], input = $('answer').value;
  const correct = (isSimilar ? gradeSimilarAnswer : isCorrect)(input, word.answer);
  session.graded = true;
  session.answers.push({ word, input, correct });
  recordAnswer(progress.records, word.id, correct); save();
  $('answer').readOnly = true; $('answer').setAttribute('aria-invalid', String(!correct));
  $('feedback').className = `feedback ${correct ? 'correct' : 'wrong'}`;
  $('feedback').replaceChildren(element('strong', '', correct ? '✓ 正解！' : '× 不正解'));
  $('feedback').append(element('div', '', `正答：${word.answer}`));
  $('feedback').hidden = false; $('grade').disabled = true; $('next').disabled = false;
  $('progress').value = session.answers.length;
  $('live-score').textContent = `正解 ${session.answers.filter(a => a.correct).length}問`;
  $('next').focus({ preventScroll: true });
}
function next() {
  if (!session || !session.graded || session.finished) return;
  if (session.cursor + 1 === session.questions.length) finish();
  else { session.cursor++; renderQuestion(); }
}
function reviewCard(word, answer) {
  const item = element('article', 'review-item');
  const header = element('div', 'review-top');
  header.append(element('span', '', `No. ${word.index}`));
  const record = progress.records[word.id];
  if (answer) header.append(element('span', '', answer.correct ? '✓ 正解' : '× 不正解'));
  else header.append(element('span', '', `正答率 ${percent(rate(record))}${record ? '%' : ''}`));
  item.append(header, element('p', 'review-question', word.question));
  if (answer && !answer.correct) item.append(element('p', 'review-input', `あなたの回答：${answer.input.trim() || '（未入力）'}`));
  item.append(element('p', 'review-answer', `正答：${word.answer}`));
  if (record) item.append(element('p', 'review-record', `正解 ${record.correct}回 · 不正解 ${record.incorrect}回 · 正答率 ${percent(rate(record))}% · 直近 ${record.last ? '✓ 正解' : '× 不正解'}`));
  else item.append(element('p', 'review-record', '未学習'));
  return item;
}
function finish() {
  if (session.finished) return;
  session.finished = true;
  const correct = session.answers.filter(a => a.correct), wrong = session.answers.filter(a => !a.correct), total = session.questions.length;
  progress.best[total] = Math.max(progress.best[total] || 0, correct.length);
  progress.completed++; save();
  $('result-score').textContent = correct.length;
  $('result-total').textContent = `/ ${total}問`;
  $('result-rate').textContent = `${percent(correct.length / total)}%`;
  $('result-best').textContent = `${progress.best[total]} / ${total}問`;
  $('result-message').textContent = wrong.length ? '思い出せなかったことばは、今が覚えるチャンス。' : '全問正解！ 今日の積み重ねを、次の一歩へ。';
  $('wrong-count').textContent = `${wrong.length}問`;
  $('retry-wrong').disabled = wrong.length === 0;
  $('retry-wrong').textContent = wrong.length ? `間違えた${wrong.length}問だけ再テスト` : '間違えた問題はありません';
  $('wrong-list').replaceChildren(...wrong.map(a => reviewCard(a.word, a)));
  if (!wrong.length) empty($('wrong-list'), 'すべて正解しました。新しい範囲にも挑戦してみましょう。');
  $('correct-summary').textContent = `正解した問題（${correct.length}問）`;
  $('correct-list').replaceChildren(...correct.map(a => reviewCard(a.word, a)));
  if (!correct.length) empty($('correct-list'), '今回は正解がありませんでした。もう一度、少しずつ。');
  $('correct-list').parentElement.open = false;
  show('result');
}
function renderStats() {
  const { correct, incorrect, studied } = updateOverview();
  const stats = [['収録問題', `${questionCount(words)}問`], ['学習した問題', `${studied}問`], ['正解数（累計）', `${correct}回`], ['不正解数（累計）', `${incorrect}回`], ['累計正答率', `${percent(correct + incorrect ? correct / (correct + incorrect) : null)}%`], ['完了したテスト', `${progress.completed}回`]];
  $('stats-grid').replaceChildren(...stats.map(([label, value]) => { const div = element('div', 'stat'); div.append(element('span', '', label), element('strong', '', value)); return div; }));
  const best = Object.entries(progress.best).sort(([a], [b]) => Number(a) - Number(b));
  $('best-list').replaceChildren(...best.map(([total, score]) => element('div', 'best-chip', `${total}問テスト：${score} / ${total}問`)));
  if (!best.length) empty($('best-list'), 'テストを完了すると最高点が表示されます。');
  const weak = weakWords(words, progress.records).sort((a, b) => rate(progress.records[a.id]) - rate(progress.records[b.id]));
  $('weak-count').textContent = `${weak.length}問`;
  $('weak-list').replaceChildren(...weak.map(w => reviewCard(w)));
  if (!weak.length) empty($('weak-list'), studied ? '今のところ苦手問題はありません。この調子で続けましょう。' : 'まずはテストを受けてみましょう。回答すると記録がたまります。');
  $('all-records').replaceChildren(...[...words].sort((a, b) => a.index - b.index).map(w => reviewCard(w)));
}
$('range').addEventListener('change', () => { rememberRange(); updateSettings(); });
$('count-options').addEventListener('change', updateSettings);
$('start-normal').addEventListener('click', () => start('normal'));
$('start-weak').addEventListener('click', () => start('weak'));
$('answer-form').addEventListener('submit', e => { e.preventDefault(); if (session?.graded) next(); else grade(); });
$('answer').addEventListener('keydown', e => { if (e.key === 'Enter') { if (e.isComposing || e.keyCode === 229 || e.repeat) { if (!e.isComposing) e.preventDefault(); return; } e.preventDefault(); if (session?.graded) next(); else grade(); } });
document.addEventListener('keydown', e => { if (screen === 'test' && e.key === 'Enter' && e.repeat) e.preventDefault(); });
$('next').addEventListener('click', next);
$('quit-test').addEventListener('click', () => navigate('start'));
$('cancel-quit').addEventListener('click', () => closeQuit(false));
$('confirm-quit').addEventListener('click', () => closeQuit(true));
$('quit-dialog').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); closeQuit(false); }
  if (e.key === 'Tab') {
    e.preventDefault();
    (document.activeElement === $('cancel-quit') ? $('confirm-quit') : $('cancel-quit')).focus();
  }
});
$('nav-start').addEventListener('click', () => navigate('start'));
$('nav-stats').addEventListener('click', () => navigate('stats'));
$('brand').addEventListener('click', e => { e.preventDefault(); navigate('start'); });
$('new-test').addEventListener('click', () => show('start'));
$('retry').addEventListener('click', () => {
  if (!session) return;
  // Recompute ordinary ranges; keep weak retry useful even after all weaknesses resolve.
  const config = session.config.mode === 'weak' ? { ...session.config, mode: 'normal', fixed: session.questions } : session.config;
  start(config.mode, { config, previous: session.questions });
});
$('retry-wrong').addEventListener('click', () => {
  if (!session) return;
  const wrong = session.answers.filter(a => !a.correct).map(a => a.word);
  if (wrong.length) start('normal', { config: { mode: 'normal', range: 'wrong', count: 'all', fixed: wrong }, previous: session.questions });
});
window.addEventListener('beforeunload', e => { if (screen === 'test' && session && !session.finished) { e.preventDefault(); e.returnValue = ''; } });
async function init() {
  try {
    const response = await fetch('./words.csv', { cache: 'no-store' });
    if (!response.ok) throw new Error(`CSVを取得できません（HTTP ${response.status}）。`);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()); }
    catch { throw new Error('CSVをUTF-8で読み込めません。Excelなどで「CSV UTF-8」として保存してください。'); }
    ({ words, hasIndex } = loadWords(text));
    if (isSimilar) {
      const similarModule = await import('./similar-core.js?v=3');
      const { loadSimilar } = similarModule;
      chooseSimilarQuestions = similarModule.chooseSimilarQuestions;
      gradeSimilarAnswer = similarModule.gradeSimilarAnswer;
      const variants = await fetch('./similar.csv', { cache: 'no-store' });
      if (!variants.ok) throw new Error(`類題CSVを取得できません（HTTP ${variants.status}）。`);
      const variantText = new TextDecoder('utf-8', { fatal: true }).decode(await variants.arrayBuffer());
      words = loadSimilar(variantText, words);
      hasIndex = true;
    }
    const latest = latestRangeStart(words);
    const ranges = [['latest', `${testName(latest)}（最新）`]];
    const buckets = [...new Set(words.map(w => Math.floor((w.index - 1) / 50) * 50 + 1))].sort((a, b) => a - b);
    ranges.push(...buckets.map(n => [String(n), `${testName(n)}（${questionCount(words.filter(w => w.index >= n && w.index < n + 50))}問）`]));
    ranges.push(['all', '全範囲を混ぜる'], ['wrong', '全範囲の間違えた問題のみ（直近が不正解）']);
    $('range').replaceChildren(...ranges.map(([value, text]) => { const option = element('option', '', text); option.value = value; return option; }));
    restoreRange(buckets);
    $('range').disabled = false;
    $('range').title = hasIndex ? 'CSVのindexで範囲を分けています。' : 'index列がないため、CSVのデータの行順で番号を付けています。';
    updateOverview(); updateSettings();
    if (screen === 'stats') renderStats();
  } catch (error) {
    $('load-error').textContent = `${error.message} ${isSimilar ? 'similar.csvとwords.csv' : 'words.csv'}を確認してページを再読み込みしてください。ファイルを直接開いている場合は、READMEの方法でローカルサーバーから開いてください。`;
    $('load-error').hidden = false;
    $('range-note').textContent = '問題を読み込めませんでした。';
  }
}
init();
