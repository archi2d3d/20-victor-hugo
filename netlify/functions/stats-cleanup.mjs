import { getDatabase } from '@netlify/database';
export default async(req,context)=>{
 if(context.deploy?.context==='production'){
  const db=getDatabase();
  await db.sql`DELETE FROM vh_audience_seen WHERE day < (now() AT TIME ZONE 'Europe/Paris')::date`;
  await db.sql`DELETE FROM vh_audience_counts WHERE day < (now() AT TIME ZONE 'Europe/Paris')::date - 89`;
  await db.sql`DELETE FROM vh_pageviews WHERE happened_at < now() - interval '90 days'`;
 }
 return new Response(null,{status:204});
};
export const config={schedule:'17 3 * * *'};
