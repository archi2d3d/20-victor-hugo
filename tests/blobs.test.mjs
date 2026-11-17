import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAudienceStore,parisDay,audienceStoreName} from '../netlify/lib/audience-blobs.mjs';
import {encryptSnapshot,decryptSnapshot,digest} from '../netlify/lib/stats-backup.mjs';
const secret='isolated-test-signing-key',password='isolated backup password longer than 24 characters';
const day='2026-11-17';
function memory(){
 const data=new Map();let fail=0;
 return {data,setFailures:n=>{fail=n},async list({prefix}){return {blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}},async get(key,{type}={}){const v=data.get(key);if(v===undefined)return null;return type==='json'?JSON.parse(v):v},async setJSON(key,value,{onlyIfNew}={}){
  await Promise.resolve();
  if(fail-->0)throw new Error('Injected write failure');
  if(onlyIfNew&&data.has(key))return {modified:false};data.set(key,JSON.stringify(value));return {modified:true};
 },async delete(key){data.delete(key)}};
}
const snapshot=()=>({version:1,counts:[{day,dimension:'metric',label:'pageviews',count:'5'},{day,dimension:'metric',label:'visitors',count:'1'},{day,dimension:'metric',label:'visits',count:'1'},{day,dimension:'page',label:'/rdc/',count:'5'}],seen:[{day,kind:'visitor',token:'a'.repeat(64)},{day,kind:'session',token:'b'.repeat(64)}],pageviews:[{id:'legacy-row',country:'France',campaign:''}]});
const entry=(id,visitor='a'.repeat(64),session='b'.repeat(64))=>({day,visitor,session,page:'/rdc/',source:'google.fr',country:'France',geo:'France · Lyon',eventId:String(id)});
const setup=()=>{const store=memory();let time=Date.parse(day+'T12:00:00Z');return {store,api:createAudienceStore(store,secret,()=>time),time:t=>{time=Date.parse(t)}}};
const ready=async api=>api.importSnapshot({version:1,counts:[],seen:[],pageviews:[]});
test('150 simultaneous writes retain every view; visitor and visit markers deduplicate',async()=>{
 const {store,api}=setup();await ready(api);
 await Promise.all(Array.from({length:150},(_,i)=>api.collect(entry(i))));
 const r=await api.report(1,day);
 assert.deepEqual(r.totals,{pageviews:150,visitors:1,visits:1});
 assert.equal(r.pages[0].count,150);assert.equal(r.sources[0].count,150);assert.equal(r.locations[0].count,150);
 assert.ok(![...store.data.values()].some(v=>v.includes('google.fr'))); // Dimensions encoded separately in keys.
 const keys=[...store.data.keys()];
 assert.equal(keys.filter(k=>k.startsWith('units/')).length,750);
 const ids=keys.filter(k=>k.startsWith('units/')).map(k=>k.split('/').at(-1));
 assert.equal(new Set(ids).size,750); // No join identifier between dimensions.
});
test('Repeated event delivery and transient writes do not double count',async()=>{
 const {store,api}=setup();await ready(api);store.setFailures(1);
 await api.collect(entry('same'));await api.collect(entry('same'));
 assert.deepEqual((await api.report(1,day)).totals,{pageviews:1,visitors:1,visits:1});
});
test('Persistent failure is surfaced, never reported as successful collection',async()=>{
 const {store,api}=setup();await ready(api);store.setFailures(100);
 await assert.rejects(api.collect(entry('failure')),/Injected/);
});
test('Import preserves baseline totals and handles old/new collection overlap without duplicate visitors',async()=>{
 const {api}=setup(),data=snapshot(),before=JSON.stringify(data);
 await api.collect(entry('new-after-switch'));
 await api.collect(entry('new-person','c'.repeat(64),'d'.repeat(64)));
 await api.importSnapshot(data);await api.importSnapshot(data);
 assert.deepEqual((await api.report(1,day)).totals,{pageviews:7,visitors:2,visits:2});
 assert.equal(JSON.stringify(data),before);
 await assert.rejects(api.importSnapshot({...data,counts:[]}),/Different snapshot/);
});
test('Unverified or incomplete migration cannot serve a misleading empty report',async()=>{
 const {store,api}=setup();await assert.rejects(api.report(1,day),/not verified/);
 store.setFailures(1);await assert.rejects(api.importSnapshot(snapshot()));
 await assert.rejects(api.report(1,day),/not verified/);
 await api.importSnapshot(snapshot());assert.equal((await api.report(1,day)).totals.pageviews,5);
});
test('Cleanup consolidates before deleting markers and keeps exactly the same report',async()=>{
 const {store,api,time}=setup();await api.importSnapshot(snapshot());await api.collect(entry('additional'));
 const before=await api.report(90,day);
 time('2026-11-18T01:00:00Z');await api.cleanup(); // 02:00 Paris, too early.
 assert.ok([...store.data.keys()].some(k=>k.startsWith('seen/')));
 time('2026-11-18T04:00:00Z');await Promise.all([api.cleanup(),api.cleanup()]);
 const after=await api.report(90,day);
 assert.deepEqual(after,before);
 assert.ok(![...store.data.keys()].some(k=>k.startsWith('seen/')||k.startsWith('units/')));
 assert.ok(store.data.has('closed/'+day));
 await api.cleanup();assert.deepEqual(await api.report(90,day),before);
});
test('Failed archive write leaves all granular data intact',async()=>{
 const {store,api,time}=setup();await ready(api);await api.collect(entry('one'));
 time('2026-11-18T04:00:00Z');const keys=[...store.data.keys()];store.setFailures(1);
 await assert.rejects(api.cleanup(),/Injected/);assert.deepEqual([...store.data.keys()],keys);
});
test('90-day retention expires summaries without touching immutable migration backup',async()=>{
 const {store,api,time}=setup();await api.importSnapshot(snapshot());await store.setJSON('backup/encrypted-placeholder',{ciphertext:'opaque'});
 time('2027-02-16T04:00:00Z');await api.cleanup();
 assert.ok(store.data.has('backup/encrypted-placeholder'));
 assert.ok(!store.data.has('closed/'+day));assert.ok(!store.data.has('baseline/'+day));
});
test('Backup preserves every table and detects wrong password or tampering',()=>{
 const original=snapshot(),encrypted=encryptSnapshot(original,password);
 assert.deepEqual(decryptSnapshot(encrypted,password),original);
 assert.ok(!encrypted.includes(Buffer.from('legacy-row')));
 assert.equal(digest(encrypted).length,64);
 assert.throws(()=>decryptSnapshot(encrypted,'wrong password'));
 const corrupt=Buffer.from(encrypted);corrupt[corrupt.length-1]^=1;
 assert.throws(()=>decryptSnapshot(corrupt,password));
});
test('Paris day remains correct around midnight and daylight saving changes',()=>{
 assert.equal(parisDay(Date.parse('2026-11-16T23:10:00Z')),day);
 assert.equal(parisDay(Date.parse('2026-10-25T01:10:00Z')),'2026-10-25');
});

test('Preview and local stores cannot resolve to production',()=>{
 assert.equal(audienceStoreName({deploy:{context:'production'}}),'vh-audience-v3-production');
 assert.equal(audienceStoreName({deploy:{context:'deploy-preview',id:'abc'}}),'vh-audience-v3-preview-abc');
 assert.equal(audienceStoreName({}),'vh-audience-v3-preview-local');
});
