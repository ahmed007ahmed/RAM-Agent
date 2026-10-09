import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

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
      if (saved?.version === 1 && Array.isArray(saved.items)) {
        this.data = {version:1, updatedAt:saved.updatedAt || null, lastRun:saved.lastRun || null, items:saved.items.filter(x => x && validUrl(x.url)).slice(0, 500)};
      }
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
    if (!this.enabled) return {saved:false, count:0};
    const stamp = this.now();
    const byUrl = new Map(this.data.items.map(item => [item.url, item]));
    let added = 0;
    for (const result of results.slice(0, 300)) {
      const url = validUrl(result.url);
      if (!url || (mode !== 'LEAD' && !result.eligible)) continue;
      const existing = byUrl.get(url);
      if (existing) {
        existing.lastSeenAt = stamp;
        if (result.snippet) existing.snippet = clean(result.snippet, 2500);
        continue;
      }
      const sourceCategory = clean(result.category, 40).toUpperCase();
      const item = {
        id: randomUUID(), url, title:clean(result.title, 300), snippet:clean(result.snippet, 2500),
        category:this.categoryFor(sourceCategory), sourceCategory, status:'FOUND',
        client:clean(result.client, 200), pay:clean(result.pay || result.payText, 200),
        workType:clean(result.workType || (mode === 'LEAD' ? 'BUSINESS_LEAD_REQUIRES_VERIFICATION' : 'REMOTE_FREELANCE_PROJECT'), 60),
        verification:mode === 'LEAD' ? 'UNVERIFIED_SEARCH_RESULT' : 'NEEDS_OWNER_REVIEW',
        retrievedAt:clean(result.retrievedAt, 50) || new Date(stamp).toISOString(),
        firstSeenAt:stamp, lastSeenAt:stamp, notes:[],
        evidence:clean(result.evidence || result.amountEvidence, 500)
      };
      byUrl.set(url, item); added++;
    }
    this.data.items = [...byUrl.values()].sort((a,b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0)).slice(0, 500);
    this.data.lastRun = {at:stamp, categories:[...new Set(categories.filter(code => /^[A-Z_]{2,40}$/.test(code)).map(code => this.categoryFor(code)))], resultCount:results.length, added, failures:failures.slice(0,8)};
    this.data.updatedAt = stamp;
    await this.persist();
    return {saved:true, count:added, total:this.data.items.length, lastRun:this.data.lastRun};
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
