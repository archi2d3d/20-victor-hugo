import { mkdir,cp } from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const p of ['index.html','style.css','gallery.js','analytics.js','lots.json','assets','rdc','etage-1','etage-4','etage-5','a-propos','contact','statistiques','confidentialite'])await cp(p,'public/'+p,{recursive:true});
