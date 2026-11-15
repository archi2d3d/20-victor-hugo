(()=>{
 const readCookie=name=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||'';
 const setCookie=(name,value,age)=>{document.cookie=name+'='+value+'; Path=/; Max-Age='+age+'; Secure; SameSite=Lax'};
 try{
  // Preserve refusals collected by the previous version; discard its tracking IDs.
  let previous;try{previous=JSON.parse(localStorage.getItem('vh_stats_consent')||'null')}catch{}
  if(previous?.value==='no'){setCookie('vh_stats_optout','1',15552000)}
  ['vh_stats_consent','vh_stats_visitor','vh_stats_session'].forEach(k=>localStorage.removeItem(k));
  setCookie('vh_audience_day','',0);setCookie('vh_audience_visit','',0);
  function optedOut(){return readCookie('vh_stats_optout')==='1'}
  function update(){document.querySelectorAll('[data-audience-toggle]').forEach(b=>b.textContent=optedOut()?'Autoriser la mesure d’audience':'M’opposer à la mesure d’audience');const status=document.getElementById('audience-choice');if(status)status.textContent=optedOut()?'Votre opposition est enregistrée dans ce navigateur.':'La mesure d’audience limitée est active dans ce navigateur.'}
  document.querySelectorAll('[data-audience-toggle]').forEach(b=>b.onclick=()=>{const refuse=!optedOut();setCookie('vh_stats_optout',refuse?'1':'',refuse?15552000:0);if(refuse){setCookie('vh_audience_day','',0);setCookie('vh_audience_visit','',0)}update()});update();
  const link=document.createElement('a');link.href='/confidentialite/';link.textContent='Confidentialité et statistiques';document.querySelector('footer')?.append(link);

 }catch{}
})();
