const PATHS=['/','/rdc/','/etage-1/','/etage-4/','/etage-5/','/a-propos/','/contact/'];
const encoder=new TextEncoder();
async function digest(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('')}
function network(ip){if(/^\d+\.\d+\.\d+\.\d+$/.test(ip))return ip.split('.').slice(0,3).join('.')+'.0';if(ip.includes(':')){const [left,right='']=ip.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];return [...a,...Array(Math.max(0,8-a.length-b.length)).fill('0'),...b].slice(0,3).map(x=>parseInt(x||'0',16).toString(16)).join(':')+'::'}return ''}
export default async(request,context)=>{
 const response=await context.next();
 if(Netlify.env.get('VH_STATS_PAUSED')==='1')return response;
 try{
  if(context.deploy?.context!=='production'||request.method!=='GET'||response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
  const cookies=request.headers.get('cookie')||'';
  if(/(?:^|;\s*)(?:vh_exclude|vh_stats_optout)=1(?:;|$)/.test(cookies)||/(?:^|;\s*)vh_admin=/.test(cookies)||request.headers.get('sec-gpc')==='1'||request.headers.get('dnt')==='1')return response;
  const ua=request.headers.get('user-agent')||'';
  if(/bot|crawler|spider|headless|preview|lighthouse/i.test(ua))return response;
  const secret=Netlify.env.get('VH_STATS_KEY');if(!secret)return response;
  const origin=new URL(context.site.url);if(origin.hostname!=='20-victor-hugo.netlify.app')return response;
  const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
  const family=/Firefox/i.test(ua)?'Firefox':/Edg\//.test(ua)?'Edge':/Chrome/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':'Other';
  const prefix=network(context.ip||'');
  const identity=prefix?await digest(secret,'network:'+origin.hostname+':'+day+':'+prefix+':'+family):crypto.randomUUID();
  const visitor=identity,session=await digest(secret,'window:'+origin.hostname+':'+identity+':'+Math.floor(now/1800000));
  let referrerHost='';try{referrerHost=new URL(request.headers.get('referer')||'').hostname}catch{}
  const body=JSON.stringify({id:crypto.randomUUID(),time:now,page:new URL(request.url).pathname,visitor,session,referrerHost,country:context.geo?.country?.name||'',city:context.geo?.city||''});
  const signature=await digest(secret,'edge:'+body);
  const target=new URL('/.netlify/functions/stats?action=collect',origin);target.protocol='https:';
  context.waitUntil(fetch(target,{method:'POST',headers:{'content-type':'application/json','x-vh-signature':signature},body}).then(r=>{if(!r.ok)console.warn('Audience collector status',r.status)}).catch(()=>console.warn('Audience collector unavailable')));
 }catch{console.warn('Audience measurement skipped')}
 return response;
};
export const config={path:PATHS,method:'GET',onError:'bypass'};
