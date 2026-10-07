import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {randomUUID} from 'node:crypto';

const emptyStore = () => ({version:1, enabled:false, config:null, jobs:[], events:[], lastRunAt:null, nextRunAt:null, lastError:null});
let writeQueue = Promise.resolve();

export function automationStoragePath(env=process.env) {
  if (env.RAM_AUTOMATION_DATA_FILE) return env.RAM_AUTOMATION_DATA_FILE;
  const mount=String(env.RAILWAY_VOLUME_MOUNT_PATH||'').trim();
  return mount ? join(mount,'ram-automation.json') : null;
}
export function automationStorageReady(env=process.env) { return Boolean(automationStoragePath(env)); }

export async function readAutomationStore() {
  const file=automationStoragePath();
  if (!file) return emptyStore();
  try {
    const data=JSON.parse(await readFile(file,'utf8'));
    if(data?.version!==1||!Array.isArray(data.jobs))return emptyStore();
    return {...emptyStore(),...data};
  } catch(error) {
    if(error?.code==='ENOENT')return emptyStore();
    throw error;
  }
}

export function writeAutomationStore(next) {
  const file=automationStoragePath();
  if (!file) return Promise.reject(new Error('Railway persistent volume is not attached'));
  writeQueue=writeQueue.then(async()=>{
    await mkdir(dirname(file),{recursive:true,mode:0o700});
    const temp=`${file}.${process.pid}.${randomUUID()}.tmp`;
    try { await writeFile(temp,JSON.stringify(next),'utf8'); await rename(temp,file); }
    catch(error) { await import('node:fs/promises').then(fs=>fs.rm(temp,{force:true})).catch(()=>{}); throw error; }
  });
  return writeQueue;
}

export function newAutomationJob(fields) {
  const now=new Date().toISOString();
  return {id:randomUUID(),createdAt:now,updatedAt:now,status:'MATCHED_PREPARING',...fields};
}

export function publicAutomationStatus(store) {
  return {ok:true,connected:automationStorageReady(),durable:automationStorageReady(),enabled:store.enabled===true,
    intervalMinutes:store.config?.intervalMinutes||60,lastRunAt:store.lastRunAt||null,nextRunAt:store.nextRunAt||null,
    lastError:store.lastError||null,jobCount:store.jobs.length,
    counts:store.jobs.reduce((out,job)=>{out[job.status]=(out[job.status]||0)+1;return out;},{}),
    jobs:store.jobs.slice(0,30).map(({id,title,url,category,status,createdAt,updatedAt,analysis,error})=>({id,title,url,category,status,createdAt,updatedAt,analysis,error}))};
}
