// Keep server code, migrations, environment files and tooling out of static hosting.
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'public');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output);
const dirs=['assets','content','portail'];
for(const entry of fs.readdirSync(root,{withFileTypes:true})){
 if(entry.isDirectory()&&!['node_modules','public','.git'].includes(entry.name)&&fs.existsSync(path.join(root,entry.name,'index.html')))dirs.push(entry.name);
 if(entry.isFile()&&['index.html','app.js','styles.css','seo-pages.css','robots.txt','sitemap.xml'].includes(entry.name))fs.copyFileSync(path.join(root,entry.name),path.join(output,entry.name));
}
for(const dir of new Set(dirs))fs.cpSync(path.join(root,dir),path.join(output,dir),{recursive:true});
// Vercel's static output serves these private entry points directly. Each uses
// the same client app, which immediately asks the server for the signed-in user.
for (const route of [
  'equipe', 'equipe/academie', 'equipe/procedures',
  'partenaire', 'partenaire/contrat',
  'admin', 'admin/academie', 'admin/procedures', 'admin/contrats', 'admin/utilisateurs'
]) {
  const destination = path.join(output, route);
  fs.mkdirSync(destination, {recursive:true});
  fs.copyFileSync(path.join(root, 'portail', 'index.html'), path.join(destination, 'index.html'));
}
console.log('Public static output prepared; private server files excluded.');
