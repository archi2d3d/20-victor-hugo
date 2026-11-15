(()=>{
 const endpoint='/.netlify/functions/stats';
 const consentKey='vh_stats_consent';
 const setChoice=v=>localStorage.setItem(consentKey,JSON.stringify({value:v,time:Date.now()}));
 const readChoice=()=>{try{let c=JSON.parse(localStorage.getItem(consentKey));return c&&Date.now()-c.time<15552000000?c.value:null}catch{return null}};
 let sent=false;
 function track(){
  if(sent||localStorage.getItem('vh_stats_exclude')==='1'||readChoice()!=='yes')return;
  sent=true;
  try{
   let visitor=JSON.parse(localStorage.getItem('vh_stats_visitor')||'null');
   if(!visitor||Date.now()-visitor.time>7776000000){visitor={id:crypto.randomUUID(),time:Date.now()};localStorage.setItem('vh_stats_visitor',JSON.stringify(visitor))}
   let visit=JSON.parse(localStorage.getItem('vh_stats_session')||'null');
   if(!visit||Date.now()-visit.time>1800000){let q=new URLSearchParams(location.search);visit={id:crypto.randomUUID(),source:q.get('utm_source')||'',medium:q.get('utm_medium')||'',campaign:q.get('utm_campaign')||'',referrer:document.referrer}}
   visit.time=Date.now();localStorage.setItem('vh_stats_session',JSON.stringify(visit));
   const payload={id:crypto.randomUUID(),consent:true,visitor:visitor.id,session:visit.id,page:location.pathname,...Object.fromEntries(['source','medium','campaign','referrer'].map(k=>[k,visit[k]||'']))};
   fetch(endpoint+'?action=collect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).catch(()=>{});
  }catch{}
 }
 function preferences(){
  document.getElementById('vh-consent')?.remove();
  const box=document.createElement('aside');box.id='vh-consent';box.setAttribute('aria-label','Choix des statistiques');
  box.innerHTML='<p><strong>Statistiques de fréquentation</strong><br>Avec votre accord, nous mesurons les visites, les pages consultées, leur provenance et la ville approximative. Aucun nom ni adresse IP n’est conservé dans ces statistiques. Données conservées 90 jours. <a href="/confidentialite/">En savoir plus</a></p><div><button type="button" data-choice="yes">Accepter</button><button type="button" data-choice="no">Refuser</button></div>';
  box.querySelectorAll('button').forEach(b=>b.onclick=()=>{setChoice(b.dataset.choice);if(b.dataset.choice==='no'){localStorage.removeItem('vh_stats_visitor');localStorage.removeItem('vh_stats_session')}box.remove();track()});document.body.append(box);
 }
 try{
  const style=document.createElement('style');style.textContent='#vh-consent{position:fixed;z-index:20;bottom:16px;left:16px;right:16px;max-width:660px;margin:auto;background:#faf9f6;border:1px solid #c7b5a3;padding:20px;box-shadow:0 6px 30px #0002;font:14px/1.5 Arial;color:#292d29}#vh-consent p{margin:0 0 14px}#vh-consent a{text-decoration:underline}#vh-consent div{display:flex;gap:12px}#vh-consent button{flex:1;padding:10px;background:#faf9f6;border:1px solid #a26843;color:#754b30;cursor:pointer}.vh-preferences{border:0;background:none;color:inherit;text-decoration:underline;font:inherit;cursor:pointer;padding:0}';document.head.append(style);
  const button=document.createElement('button');button.className='vh-preferences';button.textContent='Confidentialité et statistiques';button.onclick=preferences;document.querySelector('footer')?.append(button);
  if(localStorage.getItem('vh_stats_exclude')!=='1'){if(readChoice()===null)preferences();else track()}
 }catch{}
})();
