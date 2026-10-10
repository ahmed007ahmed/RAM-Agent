import fs from 'node:fs/promises';
import path from 'node:path';

export const QUEUE_CATEGORIES = Object.freeze({
  DESIGN: 'التصميم والهندسة والمواقع والإعلانات',
  FREIGHT: 'الشحن والحاويات والبضائع',
  SOURCING: 'طلبات التجار والمشترين والموردين',
  OTHER: 'الترجمة والأبحاث والعمل الحر الآخر'
});

const STATUSES = new Set(['FOUND','VERIFIED','CONTACT_PENDING','CONTACTED','NEGOTIATING','CONVERTED','EXCLUDED']);
const validUrl = value => {
  try { const url = new URL(String(value || '')); return ['http:','https:'].includes(url.protocol) ? url.toString() : ''; }
  catch { return ''; }
};
const clean = (value, max = 2000) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

export class CloudOpportunityQueues {
  constructor(directory = '', {requireMount = true, now = () => Date.now()} = {}) {
    this.directory = directory;
    this.enabled = !requireMount || directory === '/data';
    this.file = this.enabled ? path.join(directory || '.', 'ram-opportunity-queues.json') : '';
    this.now = now;
    this.data = {version:1, updatedAt:null, lastRun:null, items:[]};
    this.ready = false;
  }

  async init() {
    if (!this.enabled) { this.ready = true; return; }
    try {
      const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
      // Search results are leads, not work RAM has started. Purge the former
      // persistent opportunity list on upgrade; active work lives in
      // WorkflowStore instead.
      await this.persist();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.persist();
    }
    this.ready = true;
  }

  async persist() {
    if (!this.enabled) throw Object.assign(new Error('التخزين الدائم لقوائم السحابة غير مفعّل؛ اضبط RAM_DATA_DIR=/data واربط Volume.'), {status:503});
    await fs.mkdir(this.directory || '.', {recursive:true});
    const temp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(this.data), {encoding:'utf8', mode:0o600});
    await fs.rename(temp, this.file);
  }

  categoryFor(code) {
    if (Object.hasOwn(QUEUE_CATEGORIES, code)) return code;
    if (['ENGINEERING','TECH','ADVERTISING'].includes(code)) return 'DESIGN';
    if (['LOGISTICS','CONTAINERS'].includes(code)) return 'FREIGHT';
    if (['SOURCING','PROPERTY','ENERGY'].includes(code)) return 'SOURCING';
    return 'OTHER';
  }

  async recordSearch({categories = [], results = [], failures = [], mode = 'FREELANCE'} = {}) {
    // Keep discovered leads in the current response only. Once the owner or
    // authorized agent actually starts a job, /workflow/start stores it in
    // the durable work queue. Do not persist unstarted opportunities.
    const count = results.filter(result => validUrl(result.url) && (mode === 'LEAD' || result.eligible)).length;
    return {saved:false, persistent:false, count:0, ephemeralResults:count, reason:'UNSTARTED_OPPORTUNITIES_NOT_STORED'};
  }

  list({category = '', status = '', limit = 100} = {}) {
    const safeCategory = Object.hasOwn(QUEUE_CATEGORIES, category) ? category : '';
    const safeStatus = STATUSES.has(status) ? status : '';
    const max = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const items = this.data.items.filter(item => (!safeCategory || item.category === safeCategory) && (!safeStatus || item.status === safeStatus)).slice(0, max);
    const counts = Object.fromEntries(Object.keys(QUEUE_CATEGORIES).map(code => [code, this.data.items.filter(x => x.category === code).length]));
    return {enabled:this.enabled, persistent:this.enabled && this.ready, categories:QUEUE_CATEGORIES, counts, lastRun:this.data.lastRun, items};
  }

  async update({id, status, note = '', ownerConfirmed = false} = {}) {
    if (!ownerConfirmed) throw Object.assign(new Error('يلزم تأكيد المستخدم لتحديث حالة جهة الاتصال.'), {status:400});
    if (!STATUSES.has(status)) throw Object.assign(new Error('حالة القائمة غير معروفة.'), {status:400});
    const item = this.data.items.find(x => x.id === String(id || '').slice(0,100));
    if (!item) throw Object.assign(new Error('الفرصة غير موجودة في قوائم السحابة.'), {status:404});
    item.status = status;
    if (note) item.notes.push({at:this.now(), text:clean(note,1000), actor:'OWNER'});
    item.notes = item.notes.slice(-30);
    item.updatedAt = this.now(); this.data.updatedAt = item.updatedAt;
    await this.persist();
    return item;
  }
}
