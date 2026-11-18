// Run only in the owner's manually dispatched GitHub Actions workflow.
// The credential is read from an encrypted repository secret, never written.
import {spawnSync} from 'node:child_process';
import {cpSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const credential=JSON.parse(process.env.MARGIN_SITE_SOURCE_CREDENTIAL || '{}');
const manifest=JSON.parse(readFileSync(path.join(source,'.openai/hosting.json'),'utf8'));
if(credential.auth_mode!=='http_extra_header'||!credential.token||!credential.branch||credential.branch.startsWith('-')||new URL(credential.remote_url).hostname!=='git.chatgpt-team.site'||!credential.remote_url.endsWith('/'+manifest.project_id+'.git'))throw new Error('A valid, project-scoped deployment credential is required.');
if(credential.token_expires_at && Date.parse(credential.token_expires_at)<=Date.now())throw new Error('The temporary deployment credential expired.');
const checkout=mkdtempSync(path.join(tmpdir(),'margin-cloud-source-'));
const env={...process.env,GIT_TERMINAL_PROMPT:'0',MARGIN_GIT_AUTHORIZATION:'Authorization: Bearer '+credential.token};
delete env.MARGIN_SITE_SOURCE_CREDENTIAL;
for(const key of Object.keys(env))if(key.startsWith('GIT_TRACE')||key==='GIT_CURL_VERBOSE')delete env[key];
const git=(args)=>{
  const result=spawnSync('git',['-c','credential.helper=','-c','http.extraHeader=','-c','http.followRedirects=false','--config-env=http.'+credential.remote_url+'.extraHeader=MARGIN_GIT_AUTHORIZATION',...args],{cwd:checkout,env,encoding:'utf8'});
  if(result.status!==0)throw new Error((result.stderr||'Git operation failed').replaceAll(credential.token,'[redacted]'));
  return result.stdout.trim();
};
try {
  git(['init']);git(['remote','add','origin',credential.remote_url]);
  const exists=git(['ls-remote','origin','refs/heads/'+credential.branch]);
  if(exists){git(['fetch','--depth=1','origin',credential.branch]);git(['checkout','-B',credential.branch,'FETCH_HEAD']);}
  else git(['checkout','--orphan',credential.branch]);
  for(const name of ['.openai','.gitignore','worker','scripts','tests','package.json','README.md'])cpSync(path.join(source,name),path.join(checkout,name),{recursive:true});
  git(['config','user.name','Margin deployment']);git(['config','user.email','margin@users.noreply.github.com']);
  git(['add','.openai','.gitignore','worker','scripts','tests','package.json','README.md']);git(['commit','--allow-empty','-m','Deploy private Margin cloud storage']);
  const sha=git(['rev-parse','HEAD']);git(['push','origin','HEAD:refs/heads/'+credential.branch]);
  console.log('MARGIN_SITE_COMMIT='+sha);
}finally{rmSync(checkout,{recursive:true,force:true});}
