import { getDatabase } from '@netlify/database';
import { openAudienceStore } from '../lib/audience-blobs.mjs';
export default async(req,context)=>{
 if(Netlify.env.get('VH_STATS_PAUSED')==='1')return new Response(null,{status:204});
 if(context.deploy?.context==='production'){
  if(Netlify.env.get('VH_STATS_STORAGE')==='blobs'){
   await (await openAudienceStore(context,Netlify.env.get('VH_STATS_KEY'))).cleanup();
   return new Response(null,{status:204});
  }
  const db=getDatabase();
  await db.sql`DELETE FROM vh_audience_seen WHERE day < (now() AT TIME ZONE 'Europe/Paris')::date`;
  await db.sql`DELETE FROM vh_audience_counts WHERE day < (now() AT TIME ZONE 'Europe/Paris')::date - 89`;
  await db.sql`DELETE FROM vh_pageviews WHERE happened_at < now() - interval '90 days'`;
 }
 return new Response(null,{status:204});
};
export const config={schedule:'17 3 * * *'};
