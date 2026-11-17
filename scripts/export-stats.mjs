// Operator-only utility. Reads exactly the three audience tables in ONE read-only snapshot.
// Connection and backup password must be supplied through an approved secure channel.
import pg from 'pg';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {encryptSnapshot,decryptSnapshot,digest} from '../netlify/lib/stats-backup.mjs';
const output=process.argv[2];
if(!output||!process.env.DATABASE_URL||!process.env.VH_BACKUP_PASSWORD)throw new Error('Need output path, DATABASE_URL and VH_BACKUP_PASSWORD');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
try{
 await db.connect();
 await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const counts=(await db.query('SELECT day::text AS day, dimension, label, count::text AS count FROM vh_audience_counts ORDER BY day,dimension,label')).rows;
 const seen=(await db.query('SELECT day::text AS day,kind,token FROM vh_audience_seen ORDER BY day,kind,token')).rows;
 const pageviews=(await db.query('SELECT id::text AS id,happened_at::text AS happened_at,visitor,session,page,source,campaign,country,city FROM vh_pageviews ORDER BY happened_at,id')).rows;
 const snapshot={version:1,exportedAt:new Date().toISOString(),counts,seen,pageviews};
 const encrypted=encryptSnapshot(snapshot,process.env.VH_BACKUP_PASSWORD);
 await mkdir(new URL('../backups/',import.meta.url),{recursive:true,mode:0o700});
 await writeFile(output,encrypted,{mode:0o600,flag:'wx'});
 const restored=decryptSnapshot(await readFile(output),process.env.VH_BACKUP_PASSWORD);
 if(JSON.stringify(restored)!==JSON.stringify(snapshot))throw new Error('Backup round-trip mismatch');
 await db.query('COMMIT');
 console.log(JSON.stringify({sha256:digest(encrypted),counts:counts.length,seen:seen.length,pageviews:pageviews.length}));
}catch{
 console.error('Export failed. No source writes were performed. Check the approved connection and backup destination.');
 process.exitCode=1;
}finally{await db.end();}
