// Owner-authorized administrators only. This command never sends mail.
const crypto=require('node:crypto');const {supa,query,db}=require('../../server/portal/core');
(async()=>{for(const [email,name] of [['lazoya2025@gmail.com','Lazoya'],['mohalbi123@hotmail.com','Lazoya — administration']]){
 if((await query('SELECT 1 FROM portal.users WHERE email=$1',[email])).rowCount){console.log('Administrator already configured');continue;}
 const {data,error}=await supa().auth.admin.createUser({email,password:crypto.randomBytes(32).toString('base64url'),email_confirm:true});if(error)throw new Error('Administrator creation failed');await query("INSERT INTO portal.users(id,name,email,role) VALUES($1,$2,$3,'admin')",[data.user.id,name,email]);console.log('Authorized administrator configured');
}await db().end();})().catch(()=>{console.error('Administrator setup failed');process.exitCode=1;});
