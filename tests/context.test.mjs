import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateData,freshState,makeTest,chooseVariant,markShown,recordAnswer,readState} from '../context-core.js';
const data=JSON.parse(readFileSync(new URL('../context-data.json',import.meta.url)));
test('50 distinct words, 250 distinct sentences and in-range choices',()=>{
 const words=validateData(data);assert.deepEqual(words.map(w=>w.id),Array.from({length:50},(_,i)=>551+i));
 const sentences=words.flatMap(w=>w.variants.map(v=>v.sentence));assert.equal(new Set(sentences).size,250);
 for(let i=0;i<100;i++){const q=makeTest(words,freshState());assert.equal(q.length,50);assert.equal(new Set(q.map(w=>w.id)).size,50);}
});
test('five variants without repeat, then avoid two most recent',()=>{
 for(const w of data.words){const h={};for(let i=0;i<100;i++){const recent=h[w.id]?.recent||[];const v=chooseVariant(w,h);assert.ok(!recent.includes(v.id));markShown(w,v,h);if(i===4)assert.equal(h[w.id].seen.length,5);}}
});
test('weak and wrong review, storage roundtrip',()=>{const s=freshState();recordAnswer(s,551,false);recordAnswer(s,552,true);assert.deepEqual(makeTest(data.words,s,'weak').map(w=>w.id),[551]);assert.deepEqual(makeTest(data.words,s,'wrong',[552]).map(w=>w.id),[552]);assert.deepEqual(readState(JSON.stringify(s)),s);assert.throws(()=>readState('{"version":1}'));});
