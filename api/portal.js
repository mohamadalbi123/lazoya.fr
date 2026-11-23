const crypto=require('node:crypto');
const {db,query,tx,supa,hash,fail,text,uuid,rate,audit,queue,flush,invitation,origin}=require('../server/portal/core');
const cookieName='__Host-lazoya_portal';
function cookie(req){const x=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));return x?.slice(cookieName.length+1)||'';}
function setCookie(res,token,seconds=43200){res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`);}
async function session(req){const token=cookie(req);if(!/^[a-f0-9]{64}$/.test(token))fail(401,'Veuillez vous connecter.');const {rows}=await query('SELECT u.* FROM portal.sessions s JOIN portal.users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now() AND u.active',[hash(token)]);if(!rows[0])fail(401,'Votre session a expiré. Veuillez vous reconnecter.');return rows[0];}
function roles(u,...allowed){if(!allowed.includes(u.role))fail(403,'Cet espace ne vous est pas accessible.');}
function password(v){if(typeof v!=='string'||v.length<12||v.length>128)fail(400,'Choisissez un mot de passe de 12 à 128 caractères.');return v;}
function email(v){v=text(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'Adresse e-mail incorrecte.');return v;}
function videoUrl(v){const u=new URL(v);if(u.protocol!=='https:'||!['www.youtube.com','youtube.com','youtu.be','vimeo.com','www.vimeo.com'].includes(u.hostname))fail(400,'Utilisez un lien YouTube ou Vimeo en HTTPS.');return u.href;}
async function createSession(user,res){await query("DELETE FROM portal.sessions WHERE expires_at<now(); DELETE FROM portal.limits WHERE expires_at<now()-interval '1 day'; DELETE FROM portal.mail WHERE sent_at<now()-interval '30 days'");const token=crypto.randomBytes(32).toString('hex');await query("INSERT INTO portal.sessions(hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[hash(token),user.id]);setCookie(res,token);return {user};}
async function state(u){const out={user:u};if(u.role==='admin'||u.role==='equipe'){
 out.categories=(await query('SELECT * FROM portal.categories ORDER BY position,name')).rows;
 out.videos=(await query('SELECT * FROM portal.videos WHERE NOT archived ORDER BY position,title')).rows;
 out.completions=(await query('SELECT * FROM portal.completions WHERE user_id=$1 OR $2',[u.id,u.role==='admin'])).rows;
 out.versions=(await query('SELECT * FROM portal.versions ORDER BY id DESC')).rows;
 out.acknowledgments=(await query('SELECT * FROM portal.acknowledgments WHERE user_id=$1 OR $2',[u.id,u.role==='admin'])).rows;
 }if(u.role==='admin'||u.role==='partenaire')out.contracts=(await query('SELECT * FROM portal.contracts WHERE user_id=$1 OR $2 ORDER BY created_at DESC',[u.id,u.role==='admin'])).rows;
 if(u.role==='admin'){out.users=(await query('SELECT * FROM portal.users ORDER BY name')).rows;out.draft=(await query('SELECT * FROM portal.draft')).rows[0];out.pendingMail=Number((await query('SELECT count(*) FROM portal.mail WHERE sent_at IS NULL')).rows[0].count);}
 return out;
}
async function run(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,origin), action=url.searchParams.get('action')||'state';
 if(!['GET','POST'].includes(req.method))fail(405,'Méthode non autorisée.');
 if(req.method==='POST'){
  if(req.headers.origin!==origin && !(process.env.PORTAL_TEST==='1'&&req.headers.origin==='http://localhost:4180'))fail(403,'Origine non autorisée.');
  if(!String(req.headers['content-type']).startsWith('application/json'))fail(415,'Format non autorisé.');
 }
 let b=req.body||{};if(typeof b==='string'){try{b=JSON.parse(b);}catch{fail(400,'Formulaire incorrect.');}}
 if(JSON.stringify(b).length>300000)fail(413,'Le contenu est trop volumineux.');
 if(req.method==='POST'&&['login','reset','password'].includes(action)){
  await rate('auth:'+ (req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown'),30);
  if(action==='login'){
   const mail=email(b.email);await rate('login:'+mail,12);const {data,error}=await supa().auth.signInWithPassword({email:mail,password:String(b.password||'')});
   if(error)fail(401,'E-mail ou mot de passe incorrect.');const u=(await query('SELECT * FROM portal.users WHERE id=$1 AND active',[data.user.id])).rows[0];if(!u)fail(403,'Accès désactivé ou non autorisé.');return createSession(u,res);
  }
  if(action==='reset'){
   const mail=email(b.email);await rate('reset:'+mail,3);const u=(await query('SELECT * FROM portal.users WHERE email=$1 AND active',[mail])).rows[0];if(u){await invitation(u);await flush();}return {message:'Si ce compte est actif, un lien personnel vous sera envoyé.'};
  }
  password(b.password);const {data,error}=await supa().auth.verifyOtp({token_hash:text(b.token,256),type:'recovery'});if(error)fail(400,'Lien expiré ou déjà utilisé. Demandez un nouveau lien.');
  const u=(await query('SELECT * FROM portal.users WHERE id=$1 AND active',[data.user.id])).rows[0];if(!u)fail(403,'Accès désactivé.');const updated=await supa().auth.admin.updateUserById(u.id,{password:b.password});if(updated.error)fail(400,'Le mot de passe n’a pas pu être enregistré.');await query('DELETE FROM portal.sessions WHERE user_id=$1',[u.id]);await audit(db(),u.id,'password_changed');return createSession(u,res);
 }
 const u=await session(req);
 if(req.method==='GET'){
  if(action==='state')return state(u);
  if(action==='file'){
   const id=uuid(url.searchParams.get('id'));const f=(await query('SELECT * FROM portal.files WHERE id=$1',[id])).rows[0];if(!f)fail(404,'Document introuvable.');
   if(u.role!=='admin'){
    const allowed=u.role==='partenaire'?(await query('SELECT 1 FROM portal.contracts WHERE file_id=$1 AND user_id=$2',[id,u.id])).rowCount:(await query('SELECT 1 FROM portal.videos WHERE file_id=$1 AND NOT archived',[id])).rowCount;
    if(!allowed)fail(403,'Document inaccessible.');
   }
   const headers={Authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,apikey:process.env.SUPABASE_SERVICE_ROLE_KEY};if(req.headers.range)headers.Range=req.headers.range;
   const remote=await fetch(process.env.SUPABASE_URL+'/storage/v1/object/authenticated/portal-private/'+f.path,{headers});if(!remote.ok)fail(404,'Fichier indisponible.');
   res.statusCode=remote.status;for(const key of ['content-type','content-length','content-range','accept-ranges'])if(remote.headers.has(key))res.setHeader(key,remote.headers.get(key));res.setHeader('Content-Disposition',`inline; filename="lazoya-${id}.${f.kind==='pdf'?'pdf':'mp4'}"`);res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");const {Readable}=require('node:stream');const {pipeline}=require('node:stream/promises');await pipeline(Readable.fromWeb(remote.body),res);return null;
  }fail(404,'Ressource introuvable.');
 }
 if(action==='logout'){await query('DELETE FROM portal.sessions WHERE hash=$1',[hash(cookie(req))]);setCookie(res,'',0);return {ok:true};}
 await rate('write:'+u.id,100);
 if(action==='complete'){roles(u,'equipe');const id=uuid(b.id);await query('INSERT INTO portal.completions(user_id,video_id) SELECT $1,id FROM portal.videos WHERE id=$2 AND NOT archived ON CONFLICT DO NOTHING',[u.id,id]);return {ok:true};}
 if(action==='acknowledge'){roles(u,'equipe');if(b.confirm!==true)fail(400,'Veuillez confirmer votre lecture.');await tx(async c=>{const v=(await c.query('SELECT * FROM portal.versions ORDER BY id DESC LIMIT 1')).rows[0];if(!v||v.id!==Number(b.version))fail(409,'Une nouvelle version est disponible. Relisez-la avant de confirmer.');await c.query('INSERT INTO portal.acknowledgments(user_id,version_id,name,email,evidence) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[u.id,v.id,u.name,u.email,'Je déclare avoir lu et compris cette version du règlement et des procédures.']);await audit(c,u.id,'acknowledged',v.id);const admins=(await c.query("SELECT email FROM portal.users WHERE role='admin' AND active")).rows;for(const admin of admins)await queue(c,`ack:${u.id}:${v.id}:${admin.email}`,admin.email,'Accusé de lecture des procédures',`${u.name} a déclaré avoir lu et compris la version ${v.id}.\nConsultez le suivi : ${origin}/admin/procedures/`);});await flush();return {ok:true};}
 roles(u,'admin');
 if(action==='users'){
  if(b.id){const id=uuid(b.id),name=text(b.name),mail=email(b.email);const old=(await query('SELECT * FROM portal.users WHERE id=$1',[id])).rows[0];if(!old||old.role==='admin')fail(400,'Le compte administrateur ne peut pas être modifié ici.');if(!['equipe','partenaire'].includes(b.role))fail(400,'Type d’accès incorrect.');if(old.email!==mail&&(await query('SELECT 1 FROM portal.users WHERE email=$1 AND id<>$2',[mail,id])).rowCount)fail(409,'Cette adresse possède déjà un compte.');if(old.email!==mail){const changed=await supa().auth.admin.updateUserById(id,{email:mail,email_confirm:true});if(changed.error)fail(400,'Impossible de mettre à jour cette adresse e-mail.');}await tx(async c=>{await c.query('UPDATE portal.users SET name=$2,email=$3,role=$4,active=$5 WHERE id=$1',[id,name,mail,b.role,b.active===true]);await c.query('DELETE FROM portal.sessions WHERE user_id=$1',[id]);await audit(c,u.id,'user_updated',id);});return {ok:true};}
  const name=text(b.name),mail=email(b.email);if(!['equipe','partenaire'].includes(b.role))fail(400,'Type d’accès incorrect.');if((await query('SELECT 1 FROM portal.users WHERE email=$1',[mail])).rowCount)fail(409,'Cette adresse possède déjà un compte.');
  const {data,error}=await supa().auth.admin.createUser({email:mail,password:crypto.randomBytes(32).toString('base64url'),email_confirm:true});if(error)fail(409,'Impossible de créer ce compte. Vérifiez son adresse.');
  try{await query('INSERT INTO portal.users(id,name,email,role) VALUES($1,$2,$3,$4)',[data.user.id,name,mail,b.role]);}catch(e){await supa().auth.admin.deleteUser(data.user.id);throw e;}
  await audit(db(),u.id,'user_created',data.user.id);await invitation({name,email:mail});const delivery=await flush();return {ok:true,delivery};
 }
 if(action==='remove-user'){const id=uuid(b.id);const target=(await query('SELECT * FROM portal.users WHERE id=$1',[id])).rows[0];if(!target||target.role==='admin')fail(400,'Le compte administrateur ne peut pas être retiré ici.');await tx(async c=>{await c.query('UPDATE portal.users SET active=false WHERE id=$1',[id]);await c.query('DELETE FROM portal.sessions WHERE user_id=$1',[id]);await audit(c,u.id,'user_access_removed',id);});return {ok:true};}
 if(action==='invite'){const target=(await query('SELECT * FROM portal.users WHERE id=$1 AND active',[uuid(b.id)])).rows[0];if(!target)fail(404,'Compte actif introuvable.');await invitation(target);return {ok:true,delivery:await flush()};}
 if(action==='category'){
  if(b.remove){await query('DELETE FROM portal.categories WHERE id=$1',[uuid(b.id)]);return {ok:true};}
  if(b.id)await query('UPDATE portal.categories SET name=$2 WHERE id=$1',[uuid(b.id),text(b.name)]);else await query('INSERT INTO portal.categories(name) VALUES($1)',[text(b.name)]);return {ok:true};
 }
 if(action==='video'){
  if(b.remove){await query('UPDATE portal.videos SET archived=true WHERE id=$1',[uuid(b.id)]);return {ok:true};}
  let file=null,link=null;if(b.file)file=uuid(b.file);else {try{link=videoUrl(text(b.url,1500));}catch(e){if(e.status)throw e;fail(400,'Lien vidéo incorrect.');}}
  const args=[uuid(b.category),text(b.title),String(b.description||'').slice(0,4000),link,file,Math.max(0,Math.min(9999,Number(b.position)||0))];
  if(file&&!(await query("SELECT 1 FROM portal.files WHERE id=$1 AND kind='video'",[file])).rowCount)fail(400,'Fichier vidéo incorrect.');
  if(b.id)await query('UPDATE portal.videos SET category_id=$1,title=$2,description=$3,url=$4,file_id=$5,position=$6 WHERE id=$7',[...args,uuid(b.id)]);else await query('INSERT INTO portal.videos(category_id,title,description,url,file_id,position) VALUES($1,$2,$3,$4,$5,$6)',args);return {ok:true};
 }
 if(action==='draft'){const content=typeof b.content==='string'?b.content:null;if(content===null||content.length>150000)fail(400,'Document trop volumineux.');const r=await query('UPDATE portal.draft SET content=$1,revision=revision+1 WHERE revision=$2 RETURNING revision',[content,Number(b.revision)]);if(!r.rowCount)fail(409,'Le brouillon a changé. Rechargez avant de modifier.');return {ok:true};}
 if(action==='publish'){if(b.approved!==true)fail(400,'L’approbation de cette version est obligatoire.');await tx(async c=>{const d=(await c.query('SELECT * FROM portal.draft FOR UPDATE')).rows[0];if(d.revision!==Number(b.revision)||!d.content.trim())fail(409,'Enregistrez et relisez le brouillon avant publication.');const name=text(b.founder);const v=(await c.query('INSERT INTO portal.versions(content,hash,founder_name,approved_by) VALUES($1,$2,$3,$4) RETURNING id',[d.content,hash(d.content),name,u.id])).rows[0];await audit(c,u.id,'published',v.id);for(const person of (await c.query("SELECT * FROM portal.users WHERE role='equipe' AND active")).rows)await queue(c,`version:${v.id}:${person.id}`,person.email,'Nouvelles procédures Lazoya',`Bonjour ${person.name},\nLa version ${v.id} des procédures est disponible. Merci de la lire et d’en accuser réception :\n${origin}/equipe/procedures/`);});return {ok:true,delivery:await flush()};}
 if(action==='upload'){
  if(!['application/pdf','video/mp4','video/webm'].includes(b.type)||!Number.isInteger(b.size)||b.size<1||b.size>52428800)fail(400,'PDF, MP4 ou WebM uniquement, maximum 50 Mo.');
  const id=crypto.randomUUID(),kind=b.type==='application/pdf'?'pdf':'video',path=id+(kind==='pdf'?'.pdf':b.type==='video/webm'?'.webm':'.mp4');
  const {data,error}=await supa().storage.from('portal-private').createSignedUploadUrl(path,{upsert:false});if(error)fail(503,'Téléversement indisponible.');
  await query('INSERT INTO portal.files(id,path,kind,created_by) VALUES($1,$2,$3,$4)',[id,path,kind,u.id]);return {id,url:data.signedUrl};
 }
 if(action==='contract'){
  const target=uuid(b.user),file=uuid(b.file);if(!['signed','proposed'].includes(b.status)||!/^\d{4}-\d{2}-\d{2}$/.test(b.date))fail(400,'Statut ou date incorrect.');
  const f=(await query("SELECT * FROM portal.files WHERE id=$1 AND kind='pdf'",[file])).rows[0];if(!f||!(await query("SELECT 1 FROM portal.users WHERE id=$1 AND role='partenaire'",[target])).rowCount)fail(400,'Partenaire ou PDF incorrect.');
  const {data,error}=await supa().storage.from('portal-private').download(f.path);if(error||!data||!Buffer.from(await data.slice(0,5).arrayBuffer()).equals(Buffer.from('%PDF-')))fail(400,'Le fichier doit être un PDF valide entièrement téléversé.');
  await tx(async c=>{const r=await c.query('INSERT INTO portal.contracts(user_id,file_id,title,status,agreement_date) VALUES($1,$2,$3,$4,$5) RETURNING id',[target,file,text(b.title),b.status,b.date]);await audit(c,u.id,'contract_added',r.rows[0].id);});return {ok:true};
 }
 if(action==='mail-retry'){await query('UPDATE portal.mail SET attempts=0 WHERE sent_at IS NULL');return {ok:true,delivery:await flush()};}
 fail(404,'Action introuvable.');
}
module.exports=async(req,res)=>{try{const result=await run(req,res);if(result!==null){res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=200;res.end(JSON.stringify(result));}}catch(e){if(res.headersSent){res.end();return;}res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=e.status|| (['23503','23505'].includes(e.code)?409:500);res.end(JSON.stringify({error:e.status?e.message:res.statusCode===409?'Cet élément est déjà utilisé. Modifiez les éléments associés avant de continuer.':'Une erreur est survenue. Réessayez dans quelques instants.'}));if(!e.status)console.error('Portal error',e.code||e.name);}};
module.exports._test={roles,videoUrl,password};
