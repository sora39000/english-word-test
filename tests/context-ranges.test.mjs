import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateData,freshState,makeTest,chooseVariant,markShown} from '../context-core.js';
for(const [start,file] of [[551,'context-data.json'],[601,'context-data-601-650.json'],[651,'context-data-651-700.json']]){
 const data=JSON.parse(readFileSync(new URL('../'+file,import.meta.url)));
 test('context range '+start+': 50 words, 250 sentences, choices stay in range',()=>{
  const words=validateData(data);
  assert.deepEqual(words.map(w=>w.id),Array.from({length:50},(_,i)=>start+i));
  assert.equal(new Set(words.flatMap(w=>w.variants.map(v=>v.sentence))).size,250);
  for(const w of words)for(const v of w.variants)assert.ok(v.options.every(id=>id>=start&&id<start+50));
  for(let i=0;i<20;i++){const q=makeTest(words,freshState());assert.equal(q.length,50);assert.equal(new Set(q.map(w=>w.id)).size,50);}
 });
 test('context range '+start+': retry uses another sentence',()=>{
  const history={};for(const w of data.words)for(let i=0;i<50;i++){const v=chooseVariant(w,history);assert.ok(!(history[w.id]?.recent||[]).includes(v.id));markShown(w,v,history);}
 });
}
