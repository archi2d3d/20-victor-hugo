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
 if(req.method==='POST'&&req.headers.get('origin')!==url.origin)return reply({error:'Origine refusée'},403);
 if(action==='login'&&req.method==='POST'){
  const b=await req.json().catch(()=>({}));
  if(!equal(hash(String(b.password||'')),hash(Netlify.env.get('VH_STATS_PASSWORD')||'disabled')))return reply({error:'Mot de passe incorrect'},401);
  const exp=String(Date.now()+86400000),token=exp+'.'+hash('admin:'+exp);
  return reply({ok:true},200,{'Set-Cookie':`vh_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`});
 }
 if(action==='logout'&&req.method==='POST')return reply({ok:true},200,{'Set-Cookie':'vh_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 if(action==='collect'&&req.method==='POST'){
  if(context.deploy?.context!=='production')return reply({ok:true,ignored:true});
  if(authorized(req)||cookie(req).vh_exclude==='1')return reply({ok:true,ignored:true});
  if(/bot|crawler|spider|headless|preview|lighthouse/i.test(req.headers.get('user-agent')||''))return reply({ok:true,ignored:true});
  if(Number(req.headers.get('content-length'))>4096)return reply({},413);
  const b=await req.json().catch(()=>({}));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(b.consent!==true||!uuid.test(b.visitor)||!uuid.test(b.session)||!uuid.test(b.id)||!pages.has(b.page))return reply({error:'Événement incorrect'},400);
  let source='Direct / inconnu',campaign=safe(b.campaign);
  if(b.medium==='email')source='Email'+(safe(b.source)?' · '+safe(b.source):'');
  else if(safe(b.source))source=safe(b.source);
  else if(b.referrer){try{let host=new URL(b.referrer).hostname;if(host!==url.hostname)source=host.replace(/^www\./,'')}catch{}}
  const db=getDatabase();
  await db.sql`INSERT INTO vh_pageviews(id,visitor,session,page,source,campaign,country,city) VALUES (${b.id},${hash(b.visitor)},${hash(b.session)},${b.page},${source},${campaign},${safe(context.geo?.country?.name)},${safe(context.geo?.city)}) ON CONFLICT DO NOTHING`;
  return reply({ok:true});
 }
 if(!authorized(req))return reply({error:'Connexion nécessaire'},401);
 if(action!=='report'||req.method!=='GET')return reply({},405);
 const days=[1,7,30,90].includes(Number(url.searchParams.get('days')))?Number(url.searchParams.get('days')):30;
 const since=new Date(Date.now()-days*86400000).toISOString();
 const db=getDatabase();
 const [totals,pagesReport,sources,locations,daily]=await Promise.all([
 db.sql`SELECT count(*)::int AS pageviews,count(DISTINCT visitor)::int AS visitors,count(DISTINCT session)::int AS visits FROM vh_pageviews WHERE happened_at>=${since}`,
 db.sql`SELECT page AS label,count(*)::int AS count FROM vh_pageviews WHERE happened_at>=${since} GROUP BY page ORDER BY count DESC`,
 db.sql`SELECT source AS label,campaign,count(*)::int AS count FROM vh_pageviews WHERE happened_at>=${since} GROUP BY source,campaign ORDER BY count DESC`,
 db.sql`SELECT country,city,count(*)::int AS count FROM vh_pageviews WHERE happened_at>=${since} GROUP BY country,city ORDER BY count DESC LIMIT 100`,
 db.sql`SELECT to_char(happened_at AT TIME ZONE 'Europe/Paris','YYYY-MM-DD') AS day,count(*)::int AS count FROM vh_pageviews WHERE happened_at>=${since} GROUP BY day ORDER BY day`
 ]);
 return reply({totals:totals[0],pages:pagesReport,sources,locations,daily,days,since});
};
export const config={rateLimit:{action:'rate_limit',aggregateBy:['ip','domain'],windowSize:60,windowLimit:60}};
