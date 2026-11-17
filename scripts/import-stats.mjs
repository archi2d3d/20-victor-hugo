// No credentials are obtained by this utility. Never put backups or tokens in Git.
import {getStore} from '@netlify/blobs';
import {readFile} from 'node:fs/promises';
import {decryptSnapshot,digest} from '../netlify/lib/stats-backup.mjs';
import {createAudienceStore} from '../netlify/lib/audience-blobs.mjs';
const file=process.argv[2],name=process.env.VH_MIGRATION_STORE;
if(!file||!name||!process.env.VH_BACKUP_PASSWORD||!process.env.NETLIFY_AUTH_TOKEN||!process.env.NETLIFY_SITE_ID||!process.env.VH_STATS_KEY)throw new Error('Missing approved migration configuration');
if(name==='vh-audience-v3-production'&&!process.argv.includes('--production-after-drain'))throw new Error('Production requires verified shutdown/drain of old PostgreSQL writers');
if(!/^vh-audience-v3-(production|test-[a-z0-9-]+|preview-[a-z0-9-]+)$/.test(name))throw new Error('Invalid migration store');
const encrypted=await readFile(file),snapshot=decryptSnapshot(encrypted,process.env.VH_BACKUP_PASSWORD);
const store=getStore({name,region:'eu-central-1',consistency:'strong',siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_AUTH_TOKEN});
// Preserve the FULL encrypted backup, including old consent-era rows, before marking migration verified.
const sha=digest(encrypted),backupKey=`backup/${sha}`;
await store.set(backupKey,encrypted,{onlyIfNew:true});
const copy=Buffer.from(await store.get(backupKey,{type:'arrayBuffer',consistency:'strong'}));
if(digest(copy)!==sha)throw new Error('Remote backup checksum mismatch');
await createAudienceStore(store,process.env.VH_STATS_KEY).importSnapshot(snapshot);
console.log(JSON.stringify({verified:true,backupSha256:sha,store:name}));
