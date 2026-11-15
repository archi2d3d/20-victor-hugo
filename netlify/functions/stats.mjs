import { getDatabase } from '@netlify/database';
import { createHmac, timingSafeEqual } from 'node:crypto';
const pages=new Set(['/','/rdc/','/etage-1/','/etage-4/','/etage-5/','/a-propos/','/contact/']);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const key=()=>Netlify.env.get('VH_STATS_KEY');
const hash=v=>createHmac('sha256',key()).update(v).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const cookie=req=>{const s=req.headers.get('cookie')||'';return Object.fromEntries(s.split(';').map(x=>x.trim().split('=')))};
const authorized=req=>{const v=cookie(req).vh_admin||'';const [exp,sig]=v.split('.');return Number(exp)>Date.now()&&equal(sig||'',hash('admin:'+exp))};
const safe=v=>typeof v==='string'?v.replace(/[\x00-\x1f]/g,'').slice(0,100):'';
export default async(req,context)=>{
 if(!key()||!Netlify.env.get('VH_STATS_PASSWORD'))return reply({error:'Statistiques non configurées'},503);
 const url=new URL(req.url),action=url.searchParams.get('action')||'report';
 if(req.method==='POST'&&action!=='collect'&&req.headers.get('origin')!==url.origin)return reply({error:'Origine refusée'},403);
 if(action==='login'&&req.method==='POST'){
  const b=await req.json().catch(()=>({}));
  if(!equal(hash(String(b.password||'')),hash(Netlify.env.get('VH_STATS_PASSWORD')||'disabled')))return reply({error:'Mot de passe incorrect'},401);
  const exp=String(Date.now()+86400000),token=exp+'.'+hash('admin:'+exp);
  return reply({ok:true},200,{'Set-Cookie':`vh_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`});
 }
 if(action==='logout'&&req.method==='POST')return reply({ok:true},200,{'Set-Cookie':'vh_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 if(action==='collect'&&req.method==='POST'){
  if(context.deploy?.context!=='production')return reply({ok:true,ignored:true});
  // Only the site's edge middleware may submit an event. No browser beacon.
  const raw=await req.text();
  if(raw.length>4096||!equal(req.headers.get('x-vh-signature')||'',hash('edge:'+raw)))return reply({error:'Événement non autorisé'},403);
  let b;try{b=JSON.parse(raw)}catch{return reply({},400)}
  if(!Number.isFinite(b.time)||Math.abs(Date.now()-b.time)>60000||!pages.has(b.page)||!/^([0-9a-f]{64}|[0-9a-f-]{36})$/i.test(b.visitor)||!(/^[0-9a-f]{64}$/i.test(b.session)))return reply({error:'Événement incorrect'},400);
  let source='Direct / inconnu';
  if(typeof b.referrerHost==='string'&&/^[a-z0-9.-]{1,253}$/i.test(b.referrerHost)){
   const host=b.referrerHost.toLowerCase().replace(/^www\./,'');
   if(host!==url.hostname)source=host;
  }
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const scoped=(kind,value)=>hash('audience-v2:'+url.hostname+':'+day+':'+kind+':'+value);
  const visitor=scoped('visitor',b.visitor),session=scoped('session',b.session);
  const country=safe(b.country)||'Pays indisponible';
  const city=safe(b.city);
  const geo=city?country+' · '+city:'';
  
  // Atomic aggregates, without event history or links between dimensions.
  await getDatabase().sql`
   WITH v AS (INSERT INTO vh_audience_seen(day,kind,token) VALUES (${day},'visitor',${visitor}) ON CONFLICT DO NOTHING RETURNING 1),
   s AS (INSERT INTO vh_audience_seen(day,kind,token) VALUES (${day},'session',${session}) ON CONFLICT DO NOTHING RETURNING 1),
   increments(dimension,label,n) AS (
    VALUES ('metric','pageviews',1::bigint),('page',${b.page},1::bigint),('source',${source},1::bigint),('country',${country},1::bigint)
    UNION ALL SELECT 'city',${geo},1 WHERE ${geo}<>''
    UNION ALL SELECT 'metric','visitors',count(*) FROM v HAVING count(*)>0
    UNION ALL SELECT 'metric','visits',count(*) FROM s HAVING count(*)>0
   )
   INSERT INTO vh_audience_counts(day,dimension,label,count) SELECT ${day},dimension,label,n FROM increments WHERE true
   ON CONFLICT(day,dimension,label) DO UPDATE SET count=vh_audience_counts.count+EXCLUDED.count`;
  return reply({ok:true});
 }
 if(!authorized(req))return reply({error:'Connexion nécessaire'},401);
 if(action!=='report'||req.method!=='GET')return reply({},405);
 const days=[1,7,30,90].includes(Number(url.searchParams.get('days')))?Number(url.searchParams.get('days')):30;
 const since=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-(days-1)*86400000));
 const rows=await getDatabase().sql`SELECT dimension,label,sum(count)::bigint AS count,max(count)::bigint AS maximum FROM vh_audience_counts WHERE day>=${since} GROUP BY dimension,label`;
 const count=n=>Number(n);
 const selected=d=>rows.filter(r=>r.dimension===d);
 const totals={pageviews:0,visitors:0,visits:0};
 selected('metric').forEach(r=>totals[r.label]=count(r.count));
 const report=d=>selected(d).map(r=>({label:r.label,count:count(r.count)})).sort((a,b)=>b.count-a.count);
 const locations=selected('city').map(r=>({label:r.label,count:count(r.count)})).sort((a,b)=>b.count-a.count);
 const dailyRows=await getDatabase().sql`SELECT day::text AS day,count FROM vh_audience_counts WHERE dimension='metric' AND label='pageviews' AND day>=${since} ORDER BY day`;
 return reply({totals,pages:report('page'),sources:report('source'),countries:report('country'),locations,daily:dailyRows.map(r=>({day:r.day,count:count(r.count)})),days,since,rounded:false,hasData:rows.length>0});
};
export const config={rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:60}};
