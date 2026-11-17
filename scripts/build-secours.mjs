import {cp,mkdir,readFile,writeFile,rm,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
const root=new URL('../',import.meta.url);
const out=new URL('../secours-public/',import.meta.url);
await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
for(const file of ['index.html','style.css','gallery.js','lots.json','assets','rdc','etage-1','etage-4','etage-5','a-propos','contact'])await cp(new URL(file,root),new URL(file,out),{recursive:true});
const pages=['index.html',...['rdc','etage-1','etage-4','etage-5','a-propos','contact'].map(p=>p+'/index.html')];
for(const file of pages){
 let html=await readFile(new URL(file,out),'utf8');
 html=html.replace(/<script\b[^>]*\bsrc=["']\/analytics\.js["'][^>]*>\s*<\/script>/gi,'');
 html=html.replace(/<a\b[^>]*class="stats-access"[^>]*>[^<]*<\/a>/g,'');
 await writeFile(new URL(file,out),html);
}
await writeFile(new URL('404.html',out),'<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page introuvable</title><link rel="stylesheet" href="/style.css"><main class="wrap"><h1>Page introuvable.</h1><a href="/">Retour à l’accueil</a></main></html>');
await writeFile(new URL('_headers',out),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Robots-Tag: noindex, nofollow\n');
// Validate every local HTML reference and every CSS asset. No dependency on Netlify.
let checked=0;
async function check(ref,from){
 if(!ref||/^(?:https?:|mailto:|tel:|data:|#)/i.test(ref))return;
 const clean=ref.split(/[?#]/)[0];
 const p=clean.startsWith('/')?path.join(out.pathname,clean):path.resolve(path.dirname(from),clean);
 const s=await stat(p).catch(()=>null);
 if(!s)throw new Error('Missing asset: '+ref+' in '+from);
 if(s.isDirectory())await stat(path.join(p,'index.html'));
 checked++;
}
for(const file of pages){
 const full=new URL(file,out).pathname,html=await readFile(full,'utf8');
 if(/analytics\.js|\.netlify\/functions|class="stats-access"/.test(html))throw new Error('Dynamic dependency in '+file);
 for(const m of html.matchAll(/(?:src|href)=["']([^"']+)["']/g))await check(m[1],full);
}
const css=await readFile(new URL('style.css',out),'utf8');
for(const m of css.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g))await check(m[1],new URL('style.css',out).pathname);
let files=0,bytes=0;
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else{files++;const s=await stat(p);bytes+=s.size;if(s.size>25*1024*1024)throw new Error('Cloudflare file limit exceeded: '+p);}}}
await walk(out.pathname);
console.log(JSON.stringify({pages:pages.length,checkedReferences:checked,files,bytes,output:out.pathname}));
