import { validateData, freshState, readState, rate, shuffle, makeTest, chooseVariant, markShown, recordAnswer } from './context-core.js?v=1';
const $ = id => document.getElementById(id);
const key = 'word-up:context:v1:' + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
let state = freshState(), canSave = true, words = [], byId = new Map(), session = null, screen = 'home', destination = 'home', quitTrigger = null;
const warn = message => { $('storage-note').textContent = message; $('storage-note').hidden = false; };
try { state = readState(localStorage.getItem(key)); }
catch { canSave = false; warn('保存記録を読み込めませんでした。元の記録を上書きせず、今回は一時的に練習します。'); }
function save() {
  if (!canSave) return;
  try { localStorage.setItem(key, JSON.stringify(state)); }
  catch { canSave = false; warn('記録を保存できません。ブラウザの保存設定を確認してください。この画面では引き続き練習できます。'); }
}
function el(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
const pct = n => n === null ? '未学習' : Math.round(n * 100) + '%';
function updateHome() {
  const weak = words.filter(w => rate(state.records[w.id]) !== null && rate(state.records[w.id]) < .8);
  $('start').disabled = words.length !== 50;
  $('weak').disabled = weak.length === 0;
  $('weak-note').textContent = weak.length ? '苦手な単語 ' + weak.length + '語 · 別の英文で復習（正答率80%未満）' : '苦手な単語はまだありません。まずは50問テストへ。';
}
function show(name) {
  screen = name;
  for (const id of ['home','quiz','result','records']) $(id).hidden = id !== name;
  for (const [id,active] of [['nav-home',name !== 'records'],['nav-records',name === 'records']]) { $(id).classList.toggle('active',active); if(active) $(id).setAttribute('aria-current','page'); else $(id).removeAttribute('aria-current'); }
  if (name === 'home') updateHome();
  if (name === 'records') renderRecords();
  window.scrollTo({top:0,behavior:'auto'});
  $(name + '-title')?.focus({preventScroll:true});
}
function navigate(name) {
  if (screen === 'quiz' && session && !session.finished) {
    destination = name; quitTrigger = document.activeElement; $('quit-dialog').showModal(); $('cancel-quit').focus(); return;
  }
  show(name);
}
function start(mode = 'normal', ids = []) {
  if (!words.length) return;
  const questions = makeTest(words,state,mode,ids,session?.words.map(w=>w.id) || []);
  if (!questions.length) { show('home'); return; }
  session = { words: questions, cursor: 0, answers: [], graded: false, finished: false, variant: null };
  show('quiz'); renderQuestion();
}
function renderQuestion() {
  const w = session.words[session.cursor];
  session.variant = chooseVariant(w,state.history);
  session.graded = false;
  markShown(w,session.variant,state.history); save();
  $('position').textContent = (session.cursor + 1) + ' / ' + session.words.length + ' 問';
  $('live-score').textContent = '正解 ' + session.answers.filter(a=>a.correct).length + '問';
  $('progress').max = session.words.length; $('progress').value = session.answers.length;
  $('sentence').textContent = session.variant.sentence.replace('_____', '( _____ )');
  $('options').replaceChildren(...shuffle(session.variant.options).map((id,i) => {
    const label = el('label',undefined,'choice'), radio = document.createElement('input');
    radio.type='radio'; radio.name='answer'; radio.value=String(id); radio.required=true;
    label.append(radio, el('span',String.fromCharCode(65+i), 'letter'), el('span',byId.get(id).word));
    return label;
  }));
  $('choices').disabled = false; $('grade').disabled = true; $('next').disabled = true;
  $('next').textContent = session.cursor === session.words.length - 1 ? '結果を見る →' : '次へ →';
  $('choose-note').textContent = '選択肢の行をタップして選べます。';
  $('feedback').hidden = true; $('feedback').replaceChildren(); $('sentence').focus({preventScroll:true});
}
function explanation(word, variant) {
  const wrap = el('div');
  wrap.append(el('h3','全文と和訳'),el('p',variant.sentence.replace('_____',word.word)),el('p',variant.translation),el('h3','判断の手掛かり'),el('p',variant.clue + '。ここでは「' + word.meaning + '」を表す ' + word.word + ' が適切です。'),el('h3','4つの選択肢を比べる'));
  const list = el('ul');
  for (const id of variant.options) {
    const option = byId.get(id);
    const item = el('li');
    item.append(el('strong',option.word + ' — ' + option.pos + '：' + option.meaning));
    item.append(el('div',id === word.id ? 'この文の手掛かりと一致します。' : option.pos !== word.pos ? 'この意味では文脈に合いません。また、この空欄では' + word.pos + 'が必要です。' : '「' + option.meaning + '」という意味では、上の手掛かりが示す「' + word.meaning + '」を表せません。'));
    list.append(item);
  }
  wrap.append(list); return wrap;
}
function grade() {
  if (!session || session.graded || session.finished || screen !== 'quiz') return;
  const selected = document.querySelector('input[name="answer"]:checked');
  if (!selected) { $('choose-note').textContent='選択肢を1つ選んでください。'; return; }
  const word=session.words[session.cursor], answer=Number(selected.value), correct=answer===word.id;
  session.graded=true;
  session.answers.push({word,variant:session.variant,selected:answer,correct});
  recordAnswer(state,word.id,correct); save();
  $('choices').disabled=true; $('grade').disabled=true; $('next').disabled=false;
  for (const label of $('options').children) {
    const id=Number(label.querySelector('input').value);
    if(id===word.id) { label.classList.add('correct-choice'); label.append(el('span','✓ 正解','choice-status')); }
    else if(id===answer) { label.classList.add('wrong-choice'); label.append(el('span','× 選択','choice-status')); }
  }
  $('choose-note').textContent='';
  $('feedback').replaceChildren(el('p',correct?'✓ 正解！':'× 不正解：正答は ' + word.word,'verdict' + (correct?'':' wrong')), explanation(word,session.variant));
  $('feedback').hidden=false;
  $('progress').value=session.answers.length;
  $('live-score').textContent='正解 '+session.answers.filter(a=>a.correct).length+'問';
  $('next').focus({preventScroll:true});
  $('feedback').scrollIntoView({block:'start',behavior:'auto'});
}
function next() {
  if (!session || !session.graded || session.finished) return;
  if (session.cursor + 1 === session.words.length) finish();
  else { session.cursor++; renderQuestion(); window.scrollTo({top:0,behavior:'auto'}); }
}
function finish() {
  if (session.finished) return;
  session.finished=true;
  const correct=session.answers.filter(a=>a.correct).length,total=session.answers.length;
  state.completed++; state.best[total]=Math.max(state.best[total]||0,correct); save();
  $('score').textContent=correct; $('score-total').textContent='/ '+total+'問';
  $('result-rate').textContent='正答率 '+pct(correct/total);
  $('best-score').textContent='同じ問題数の最高点 '+state.best[total]+' / '+total;
  const wrong=session.answers.filter(a=>!a.correct);
  $('retry-wrong').disabled=wrong.length===0;
  $('retry-wrong').textContent=wrong.length?'間違えた'+wrong.length+'単語を別の文で復習':'間違えた単語はありません';
  $('wrong-list').replaceChildren(...wrong.map(a=>{
    const card=el('article',undefined,'review-item');
    card.append(el('p',a.variant.sentence,'review-question'),el('p','あなたの回答：'+byId.get(a.selected).word,'review-input'),el('p','正答：'+a.word.word,'review-answer'));
    const details=el('details');details.append(el('summary','和訳と根拠を見る'),explanation(a.word,a.variant));card.append(details);return card;
  }));
  if(!wrong.length) $('wrong-list').append(el('p','全問正解です。次は別の英文でも確かめてみましょう。','empty'));
  show('result');
}
function renderRecords() {
  let correct=0,wrong=0,learned=0;
  for(const w of words){const r=state.records[w.id];if(r){correct+=r.correct;wrong+=r.incorrect;if(r.correct+r.incorrect)learned++;}}
  const stats=[['学習した単語',learned+' / 50'],['正解数',correct+'回'],['不正解数',wrong+'回'],['累計正答率',pct(correct+wrong?correct/(correct+wrong):null)],['完了したテスト',state.completed+'回'],['50問の最高点',(state.best[50]??'—')+' / 50']];
  $('stats').replaceChildren(...stats.map(([name,value])=>{const n=el('div',undefined,'stat');n.append(el('span',name),el('strong',value));return n;}));
  const sorted=[...words].sort((a,b)=>(rate(state.records[a.id])??2)-(rate(state.records[b.id])??2)||a.id-b.id);
  $('word-records').replaceChildren(...sorted.map(w=>{const r=state.records[w.id],n=el('div',undefined,'word-record'),left=el('div');left.append(el('strong',w.word),el('small',w.meaning));const right=el('div',pct(rate(r)));if(r)right.append(el('small','正解 '+r.correct+' · 不正解 '+r.incorrect+' · 直近 '+(r.last?'正解':'不正解')));n.append(left,right);return n;}));
}
$('answer-form').addEventListener('submit',e=>{e.preventDefault();grade();});
$('options').addEventListener('change',()=>{if(session&&!session.graded)$('grade').disabled=false;});
$('next').addEventListener('click',next);
$('start').addEventListener('click',()=>start());
$('weak').addEventListener('click',()=>start('weak'));
$('again').addEventListener('click',()=>start());
$('retry-wrong').addEventListener('click',()=>start('wrong',session.answers.filter(a=>!a.correct).map(a=>a.word.id)));
$('nav-home').addEventListener('click',()=>navigate('home'));
$('nav-records').addEventListener('click',()=>navigate('records'));
$('back-home').addEventListener('click',()=>show('home'));
$('quit').addEventListener('click',()=>navigate('home'));
$('cancel-quit').addEventListener('click',()=>{$('quit-dialog').close();quitTrigger?.focus();});
$('confirm-quit').addEventListener('click',()=>{$('quit-dialog').close();session=null;show(destination);});
window.addEventListener('beforeunload',e=>{if(screen==='quiz'&&session&&!session.finished){e.preventDefault();e.returnValue='';}});
async function init() {
  try {
    const response=await fetch('./context-data.json?v=1',{cache:'no-store'});
    if(!response.ok)throw Error('問題を読み込めませんでした。');
    words=validateData(await response.json());byId=new Map(words.map(w=>[w.id,w]));
    updateHome();
  } catch(error) { $('load-error').textContent=error.message+' ページを再読み込みしてください。';$('load-error').hidden=false; }
}
init();
