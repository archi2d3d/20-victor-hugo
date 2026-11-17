import { createHash, createHmac } from 'node:crypto';

export const parisDay = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', {
 timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(now));
const encode = value => Buffer.from(value).toString('base64url');
const decode = value => Buffer.from(value, 'base64url').toString();
const number = value => {
 const n = Number(value);
 if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid audience count');
 return n;
};
const sorted = rows => rows.sort((a,b) => b.count - a.count || a.label.localeCompare(b.label));
const checksum = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Private objects represent independent daily dimensions, never a joined event.
// No shared mutable counter; deterministic, dimension-specific keys make retries idempotent.
export function createAudienceStore(store, secret, now = () => Date.now()) {
 const list = async prefix => (await store.list({prefix})).blobs;
 const json = key => store.get(key, {type:'json', consistency:'strong'});
 const put = (key, value) => store.setJSON(key, value, {onlyIfNew:true});
 const dayRows = async day => {
  const archived = await json(`closed/${day}`);
  if (archived) return archived.rows;
  const baseline = await json(`baseline/${day}`) || {rows:[], seen:{visitor:0,session:0}};
  const counts = new Map(baseline.rows.map(r => [JSON.stringify([r.dimension,r.label]), number(r.count)]));
  const add = (dimension,label,n) => {
   const k = JSON.stringify([dimension,label]); counts.set(k, number((counts.get(k)||0)+n));
  };
  for (const {key} of await list(`units/${day}/`)) {
   const [, , dimension, label] = key.split('/');
   add(dimension,decode(label),1);
  }
  for (const [kind,label] of [['visitor','visitors'],['session','visits']]) {
   const n = (await list(`seen/${day}/${kind}/`)).length - baseline.seen[kind];
   if (n < 0) throw new Error('Incomplete migration markers');
   add('metric',label,n);
  }
  return [...counts].map(([k,count]) => {const [dimension,label]=JSON.parse(k); return {dimension,label,count};});
 };
 return {
  async collect({day, visitor, session, page, source, country, geo, eventId}) {
   if (day !== parisDay(now())) throw new Error('Closed collection day');
   if (await json(`closed/${day}`)) throw new Error('Day already archived');
   const dimensions = [['metric','pageviews'],['page',page],['source',source],['country',country]];
   if (geo) dimensions.push(['city',geo]);
   const operations = dimensions.map(([dimension,label]) => {
    const id = createHmac('sha256',secret).update(`unit:${dimension}:${eventId}`).digest('hex');
    return () => put(`units/${day}/${dimension}/${encode(label)}/${id}`,1);
   });
   operations.push(() => put(`seen/${day}/visitor/${visitor}`,1), () => put(`seen/${day}/session/${session}`,1));
   // Retry the same keys, never a read-modify-write. Surface persistent failure.
   await Promise.all(operations.map(async operation => {try {await operation();} catch {await operation();}}));
  },
  async report(days, since) {
   if (!await json('migration/verified')) throw new Error('Migration not verified');
   const totals={pageviews:0,visitors:0,visits:0}, groups=new Map(),daily=[];
   for (let d=new Date(since+'T12:00:00Z'); d.toISOString().slice(0,10)<=parisDay(now()); d.setUTCDate(d.getUTCDate()+1)) {
    const day=d.toISOString().slice(0,10), rows=await dayRows(day);
    for (const r of rows) {
     if (r.dimension==='metric') totals[r.label]=number((totals[r.label]||0)+r.count);
     else {const k=JSON.stringify([r.dimension,r.label]); groups.set(k,number((groups.get(k)||0)+r.count));}
    }
    const pv=rows.find(r=>r.dimension==='metric'&&r.label==='pageviews');
    if(pv)daily.push({day,count:pv.count});
   }
   const group = dimension => sorted([...groups].flatMap(([k,count])=>{const [d,label]=JSON.parse(k);return d===dimension?[{label,count}]:[]}));
   return {totals,pages:group('page'),sources:group('source'),countries:group('country'),locations:group('city'),daily,days,since,rounded:false,hasData:daily.length>0};
  },
  // Import only a final, consistent PostgreSQL snapshot AFTER old writers drain.
  // Can overlap new Blobs collection: imported marker keys merge without overwrites.
  async importSnapshot(snapshot) {
   if (await json('migration/verified')) {
    if ((await json('migration/verified')).checksum!==checksum(snapshot)) throw new Error('Different snapshot already imported');
    return;
   }
   if (snapshot.version!==1 || !Array.isArray(snapshot.counts) || !Array.isArray(snapshot.seen) || !Array.isArray(snapshot.pageviews)) throw new Error('Invalid snapshot');
   const hash=checksum(snapshot), pending=await json('migration/pending');
   if (pending && pending.checksum!==hash) throw new Error('Different pending snapshot');
   await put('migration/pending',{checksum:hash});
   if((await json('migration/pending')).checksum!==hash)throw new Error('Concurrent migration conflict');
   const byDay=new Map();
   const get = day => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Invalid day');
    if(!byDay.has(day))byDay.set(day,{rows:[],seen:{visitor:0,session:0}});
    return byDay.get(day);
   };
   for(const r of snapshot.counts)get(r.day).rows.push({dimension:r.dimension,label:r.label,count:number(r.count)});
   for(const r of snapshot.seen){
    if(!['visitor','session'].includes(r.kind)||!/^[0-9a-f]{64}$/.test(r.token))throw new Error('Invalid marker');
    get(r.day).seen[r.kind]++;
    await put(`seen/${r.day}/${r.kind}/${r.token}`,1);
   }
   for(const [day,baseline] of byDay){
    await put(`baseline/${day}`,baseline);
    if(checksum(await json(`baseline/${day}`))!==checksum(baseline))throw new Error('Baseline verification failed');
   }
   for(const r of snapshot.seen)if(await json(`seen/${r.day}/${r.kind}/${r.token}`)!==1)throw new Error('Marker verification failed');
   await put('migration/verified',{checksum:hash,counts:snapshot.counts.length,seen:snapshot.seen.length,pageviews:snapshot.pageviews.length});
  },
  async cleanup() {
   if(!await json('migration/verified'))throw new Error('Migration not verified');
   const today=parisDay(now());
   // Never compact near midnight: allow all bounded function invocations to drain.
   const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(new Date(now())));
   if(hour<3)return;
   const oldest=new Date(today+'T12:00:00Z');oldest.setUTCDate(oldest.getUTCDate()-89);
   const since=oldest.toISOString().slice(0,10);
   const days=new Set();
   for(const prefix of ['units/','seen/','baseline/','closed/'])for(const {key} of await list(prefix))days.add(key.split('/')[1]);
   for(const day of [...days].sort()){
    if(day>=today)continue;
    if(day>=since){
     const rows=await dayRows(day);
     await put(`closed/${day}`,{rows});
     if(checksum((await json(`closed/${day}`)).rows)!==checksum(rows))throw new Error('Archive verification failed');
    }
    // A verified immutable summary is written BEFORE removing granular keys.
    for(const prefix of [`units/${day}/`,`seen/${day}/`])for(const {key} of await list(prefix))await store.delete(key);
    await store.delete(`baseline/${day}`);
    if(day<since)await store.delete(`closed/${day}`);
   }
  }
 };
}

// Previews MUST NOT use the production site-wide store.
export function audienceStoreName(context) {
 const production=context.deploy?.context==='production';
 const id=production?'production':`preview-${context.deploy?.id||'local'}`;
 return `vh-audience-v3-${id}`;
}
export async function openAudienceStore(context, secret) {
 const {getStore}=await import('@netlify/blobs');
 return createAudienceStore(getStore({name:audienceStoreName(context),region:'eu-central-1',consistency:'strong'}),secret);
}
