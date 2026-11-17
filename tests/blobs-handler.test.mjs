import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as crypto from 'node:crypto';
const origin='https://20-victor-hugo.netlify.app',secret='isolated-secret';
const settings={VH_STATS_KEY:secret,VH_STATS_PASSWORD:'isolated-password',VH_STATS_STORAGE:'blobs'};
let opened=0,collections=[],cleanups=0;
const sandbox=vm.createContext({Response,URL,Buffer,Date,Intl,console,Netlify:{env:{get:k=>settings[k]}}});
const modules={
 'node:crypto':crypto,
 '@netlify/database':{getDatabase:()=>{throw new Error('PostgreSQL MUST NOT be opened in blobs/paused mode')}},
 '../lib/audience-blobs.mjs':{openAudienceStore:async()=>{opened++;return {collect:async event=>collections.push(event),report:async()=>({totals:{pageviews:7,visitors:2,visits:2}}),cleanup:async()=>{cleanups++}}}}
};
async function load(file){const m=new vm.SourceTextModule(await readFile(new URL(file,import.meta.url),'utf8'),{context:sandbox});await m.link(async name=>{const v=modules[name];if(!v)throw new Error(name);return new vm.SyntheticModule(Object.keys(v),function(){for(const k of Object.keys(v))this.setExport(k,v[k])},{context:sandbox})});await m.evaluate();return m.namespace.default;}
const handler=await load('../netlify/functions/stats.mjs'),cleanup=await load('../netlify/functions/stats-cleanup.mjs');
const ctx={deploy:{context:'production'}};
const req=(action,body,headers={})=>new Request(origin+'/.netlify/functions/stats?action='+action,{method:body?'POST':'GET',headers:{origin,...headers},body:body?JSON.stringify(body):undefined});
test('Blobs mode keeps authentication server-side and never opens PostgreSQL',async()=>{
 assert.equal((await handler(req('report'),ctx)).status,401);
 assert.equal((await handler(req('report',null,{cookie:'vh_admin=9999999999999.invalid'}),ctx)).status,401);assert.equal(opened,0);
 const login=await handler(req('login',{password:'isolated-password'}),ctx);
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 const report=await handler(req('report',null,{cookie}),ctx);assert.equal(report.status,200);assert.equal((await report.json()).totals.pageviews,7);
 const event={id:crypto.randomUUID(),time:Date.now(),visitor:'a'.repeat(64),session:'b'.repeat(64),page:'/rdc/',country:'France',city:'Lyon',referrerHost:'www.google.fr',campaign:'private@example.com'};
 const signature=crypto.createHmac('sha256',secret).update('edge:'+JSON.stringify(event)).digest('hex');
 const response=await handler(req('collect',event,{'x-vh-signature':signature}),ctx);
 assert.equal(response.status,200);assert.equal(collections.length,1);assert.equal(collections[0].source,'google.fr');
 assert.ok(!JSON.stringify(collections).includes('private@example.com'));assert.ok(!JSON.stringify(collections).includes(event.visitor));
 assert.equal((await handler(req('collect',event),ctx)).status,403);
 await handler(req('collect',event,{'x-vh-signature':signature}),{deploy:{context:'deploy-preview'}});assert.equal(collections.length,1);
 assert.equal((await handler(req('logout',{}),ctx)).headers.get('set-cookie').includes('Max-Age=0'),true);
 await cleanup(req(''),ctx);assert.equal(cleanups,1);
 settings.VH_STATS_PAUSED='1';const before=opened;
 assert.equal((await handler(req('report',null,{cookie}),ctx)).status,503);
 assert.equal((await handler(req('collect',event,{'x-vh-signature':signature}),ctx)).status,503);
 await cleanup(req(''),ctx);assert.equal(opened,before);assert.equal(cleanups,1);
});
