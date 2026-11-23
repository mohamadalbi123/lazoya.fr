const {Pool}=require('pg');
const {createClient}=require('@supabase/supabase-js');
const {Resend}=require('resend');
const crypto=require('node:crypto');
let pool;
const origin='https://www.lazoya.fr';
function db(){if(pool)return pool;const url=new URL(process.env.POSTGRES_URL);url.searchParams.delete('sslmode');return pool=new Pool({connectionString:url.href,ssl:{ca:require('node:fs').readFileSync(require('node:path').join(__dirname,'supabase-ca.crt'),'utf8'),rejectUnauthorized:true},max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});}
const query=(sql,args=[])=>db().query(sql,args);
async function tx(fn){const c=await db().connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
function supa(){return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});}
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fail(status,message){const e=new Error(message);e.status=status;throw e;}
function text(v,max=200){if(typeof v!=='string'||!v.trim()||v.length>max)fail(400,'Veuillez vérifier les champs du formulaire.');return v.trim();}
function uuid(v){if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v||''))fail(400,'Identifiant incorrect.');return v;}
async function rate(key,max=20){const r=await query(`INSERT INTO portal.limits(key,expires_at) VALUES($1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN portal.limits.expires_at<now() THEN 1 ELSE portal.limits.hits+1 END,expires_at=CASE WHEN portal.limits.expires_at<now() THEN now()+interval '15 minutes' ELSE portal.limits.expires_at END RETURNING hits`,[hash(key)]);if(r.rows[0].hits>max)fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');}
async function audit(c,actor,action,resource=''){await c.query('INSERT INTO portal.audit(actor,action,resource) VALUES($1,$2,$3)',[actor,action,String(resource)]);}
async function queue(c,dedupe,email,subject,body){await c.query('INSERT INTO portal.mail(dedupe,recipient,subject,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[dedupe,email,subject,body]);}
async function flush(){return tx(async c=>{const {rows}=await c.query("SELECT * FROM portal.mail WHERE sent_at IS NULL AND attempts<10 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED");let failed=0;for(const m of rows){let error;try{const r=await new Resend(process.env.RESEND_API_KEY||process.env.Lazoya_Portal).emails.send({from:'Lazoya <equipe@portail.lazoya.fr>',to:m.recipient,subject:m.subject,text:m.body,html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#23191c"><h1 style="color:#9c1231">Lazoya</h1><div style="white-space:pre-line">${escape(m.body)}</div><hr><p>Espace privé Lazoya</p></div>`},{idempotencyKey:m.id});error=r.error;}catch{error={name:'network'};}await c.query(`UPDATE portal.mail SET attempts=attempts+1,sent_at=CASE WHEN $2 THEN now() ELSE NULL END,last_error=$3,body=CASE WHEN $2 THEN '' ELSE body END WHERE id=$1`,[m.id,!error,error?String(error.name||'email'):null]);if(error)failed++;}return {processed:rows.length,failed};});}
async function invitation(user){const {data,error}=await supa().auth.admin.generateLink({type:'recovery',email:user.email});if(error)fail(503,'Impossible de préparer le lien. Réessayez.');const link=origin+'/portail/#token='+encodeURIComponent(data.properties.hashed_token);await queue(db(),'invite:'+crypto.randomUUID(),user.email,'Votre accès privé Lazoya',`Bonjour ${user.name},\n\nChoisissez votre mot de passe avec ce lien personnel à usage unique (valable une heure) :\n${link}\n\nSi le lien a expiré, utilisez « Mot de passe oublié » sur le portail.\nL’équipe Lazoya`);}
module.exports={db,query,tx,supa,hash,escape,fail,text,uuid,rate,audit,queue,flush,invitation,origin};
