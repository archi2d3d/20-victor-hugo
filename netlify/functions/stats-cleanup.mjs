import { getDatabase } from '@netlify/database';
export default async(req,context)=>{if(context.deploy?.context==='production'){await getDatabase().sql`DELETE FROM vh_pageviews WHERE happened_at < now() - interval '90 days'`;}return new Response(null,{status:204});};
export const config={schedule:'17 3 * * *'};
