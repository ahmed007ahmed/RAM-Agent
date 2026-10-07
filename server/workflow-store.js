import fs from 'node:fs/promises';
import path from 'node:path';

const MAX_TEXT = 24000;
const stages = ['SELECTED', 'IN_PROGRESS', 'DELIVERED', 'PAYMENT_PENDING', 'PAYMENT_REPORTED', 'RECEIVED'];
const safeText = (value, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);
const clone = value => JSON.parse(JSON.stringify(value));

export class WorkflowStore {
  constructor(directory, options = {}) {
    this.directory = safeText(directory, 1000);
    this.file = this.directory ? path.join(this.directory, 'ram-workflow-jobs.json') : '';
    this.requireMount = options.requireMount === true;
    this.jobs = new Map();
    this.enabled = false;
    this.writeChain = Promise.resolve();
    this.processing = false;
  }

  async init() {
    if (!this.file) return false;
    try {
      if (this.requireMount) {
        const mountInfo = await fs.readFile('/proc/self/mountinfo', 'utf8');
        const mountPath = path.resolve(this.directory).replace(/ /g, '\\040');
        if (!mountInfo.split('\n').some(line => line.split(' ')[4] === mountPath)) throw new Error('persistent volume mount missing');
      }
      await fs.mkdir(this.directory, {recursive: true});
      const raw = await fs.readFile(this.file, 'utf8').catch(error => error.code === 'ENOENT' ? '[]' : Promise.reject(error));
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) throw new Error('invalid workflow store');
      let recovered = false;
      for (const job of list.slice(-500)) if (job && typeof job.id === 'string') {
        for (const [kind, status] of Object.entries(job.runState || {})) if (status === 'RUNNING') { job.runState[kind] = 'QUEUED'; recovered = true; }
        this.jobs.set(job.id, job);
      }
      this.enabled = true;
      if (recovered) await this.persist();
      return true;
    } catch (error) {
      this.enabled = false;
      console.error('RAM workflow storage unavailable:', error?.code || error?.name || 'error');
      return false;
    }
  }

  async persist() {
    if (!this.enabled) throw Object.assign(new Error('أضف Volume دائمًا على Railway واربط RAM_DATA_DIR قبل تشغيل سير العمل السحابي.'), {status: 503});
    const serialized = JSON.stringify([...this.jobs.values()].slice(-500));
    const temp = `${this.file}.${process.pid}.tmp`;
    this.writeChain = this.writeChain.then(async () => {
      await fs.writeFile(temp, serialized, {encoding: 'utf8', mode: 0o600});
      await fs.rename(temp, this.file);
    });
    await this.writeChain;
  }

  record(job, note, actor = 'RAM') {
    job.events = Array.isArray(job.events) ? job.events : [];
    job.events.push({at: Date.now(), note: safeText(note, 500), actor});
    job.events = job.events.slice(-100);
    job.updatedAt = Date.now();
  }

  async start(input) {
    if (!this.enabled) throw Object.assign(new Error('التخزين السحابي الدائم غير مفعّل. اضبط Volume على Railway أولًا.'), {status: 503});
    if (input?.ownerConfirmed !== true) throw Object.assign(new Error('يلزم تأكيد اختيار الفرصة في التطبيق.'), {status: 400});
    const id = safeText(input?.id, 100);
    const title = safeText(input?.title, 240);
    const source = safeText(input?.source, 2048);
    try { const url = new URL(source); if (!id || !title || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error(); }
    catch { throw Object.assign(new Error('بيانات الفرصة أو رابطها غير صالح.'), {status: 400}); }
    if (this.jobs.has(id)) return clone(this.jobs.get(id));
    if (this.jobs.size >= 500) throw Object.assign(new Error('وصل سجل المهام السحابي إلى سعته؛ أرشف بعض المهام من التطبيق.'), {status: 507});
    const job = {
      id, title, source,
      category: safeText(input.category, 80),
      details: safeText(input.details, 8000),
      client: safeText(input.client, 240),
      amount: Number.isSafeInteger(input.amount) && input.amount > 0 ? input.amount : null,
      currency: safeText(input.currency, 12),
      basis: safeText(input.basis, 24),
      deadline: safeText(input.deadline, 40),
      stage: 'SELECTED',
      agreement: '',
      deliveryProof: '',
      drafts: {plan: '', sample: '', deliverable: ''},
      runState: {plan: 'QUEUED', sample: 'WAITING', deliverable: 'WAITING'},
      error: '', events: [], createdAt: Date.now(), updatedAt: Date.now()
    };
    this.record(job, 'وصل اختيار الفرصة للخادم؛ يبدأ توليد التقرير والعينة التحضيرية. لا يعني الاختيار قبول عميل أو عقدًا.');
    this.jobs.set(id, job);
    try { await this.persist(); } catch (error) { this.jobs.delete(id); throw error; }
    return clone(job);
  }

  async update(input) {
    if (!this.enabled) throw Object.assign(new Error('التخزين السحابي الدائم غير مفعّل.'), {status: 503});
    const job = this.jobs.get(safeText(input?.id, 100));
    if (!job) throw Object.assign(new Error('لم يعثر الخادم على هذه المهمة؛ أرسل اختيار الفرصة مجددًا.'), {status: 404});
    const stage = safeText(input.stage, 32);
    if (!stages.includes(stage)) throw Object.assign(new Error('مرحلة المهمة غير معروفة.'), {status: 400});
    if (stage === 'IN_PROGRESS') {
      if (input.ownerConfirmed !== true || !safeText(input.agreement, 8000)) throw Object.assign(new Error('أكد قبول العميل واكتب نطاق الاتفاق قبل بدء المخرج.'), {status: 400});
      job.agreement = safeText(input.agreement, 8000);
      job.stage = stage;
      job.runState.deliverable = 'QUEUED';
      job.error = '';
      this.record(job, 'أكد المالك الاتفاق والنطاق؛ أُضيف إعداد المخرج إلى عامل الخادم.', 'OWNER');
    } else if (stage === 'DELIVERED') {
      if (job.stage !== 'IN_PROGRESS' || input.ownerConfirmed !== true || !safeText(input.proof, 2000)) throw Object.assign(new Error('سجّل مرجع التسليم الفعلي بعد أن ترسله بنفسك.'), {status: 400});
      job.deliveryProof = safeText(input.proof, 2000);
      job.stage = stage;
      this.record(job, 'أكد المالك أنه سلّم العمل وأدخل مرجع التسليم. لم يرسل الخادم ملفًا.', 'OWNER');
    } else if (stage === 'PAYMENT_PENDING') {
      if (job.stage !== 'DELIVERED' || input.ownerConfirmed !== true) throw Object.assign(new Error('سجّل التسليم أولًا ثم أكد شروط الاستحقاق.'), {status: 400});
      job.agreedAmount = Number.isSafeInteger(input.agreedAmount) && input.agreedAmount > 0 ? input.agreedAmount : null;
      job.currency = safeText(input.currency, 12);
      job.payoutMethod = safeText(input.payoutMethod, 32);
      job.dueAt = Number.isFinite(Number(input.dueAt)) ? Number(input.dueAt) : null;
      job.stage = stage;
      this.record(job, 'سجل المالك شروط الاستحقاق؛ لم يُرسل طلب دفع ولم تُنفذ معاملة.', 'OWNER');
    } else {
      const currentIndex = stages.indexOf(job.stage), nextIndex = stages.indexOf(stage);
      if (stage === job.stage) return clone(job);
      if (nextIndex !== currentIndex + 1 || input.ownerConfirmed !== true) throw Object.assign(new Error('تأكيد المالك مطلوب للانتقال إلى هذه المرحلة.'), {status: 400});
      job.stage = stage;
      if (stage === 'PAYMENT_REPORTED') job.paymentReference = safeText(input.reference, 500);
      if (stage === 'RECEIVED') job.receiptConfirmedByOwner = true;
      this.record(job, `أكد المالك المرحلة: ${stage}.`, 'OWNER');
    }
    await this.persist();
    return clone(job);
  }

  async retry(input) {
    if (!this.enabled) throw Object.assign(new Error('التخزين السحابي الدائم غير مفعّل.'), {status: 503});
    const job = this.jobs.get(safeText(input?.id, 100));
    if (!job) throw Object.assign(new Error('المهمة غير موجودة.'), {status: 404});
    if (input.ownerConfirmed !== true) throw Object.assign(new Error('أكد إعادة المحاولة.'), {status: 400});
    const failed = Object.keys(job.runState).find(key => job.runState[key] === 'FAILED');
    if (!failed) return clone(job);
    job.runState[failed] = 'QUEUED';
    job.error = '';
    this.record(job, `وافق المالك على إعادة محاولة ${failed}.`, 'OWNER');
    await this.persist();
    return clone(job);
  }

  get(id) { const job = this.jobs.get(safeText(id, 100)); return job ? clone(job) : null; }

  async processNext(generate) {
    if (!this.enabled || this.processing) return false;
    const job = [...this.jobs.values()].find(item => Object.values(item.runState).includes('QUEUED'));
    if (!job) return false;
    const kind = ['plan', 'sample', 'deliverable'].find(key => job.runState[key] === 'QUEUED');
    if (!kind) return false;
    this.processing = true;
    job.runState[kind] = 'RUNNING';
    job.error = '';
    this.record(job, `بدأ الخادم إعداد ${kind}.`);
    try {
      await this.persist();
      const result = await generate(clone(job), kind);
      const current = this.jobs.get(job.id);
      if (!current) return true;
      const output = safeText(result?.content, 24000);
      if (!output) throw new Error('empty model output');
      current.drafts[kind] = output;
      current.runState[kind] = 'DONE';
      if (kind === 'plan' && current.stage === 'SELECTED') current.runState.sample = 'QUEUED';
      this.record(current, kind === 'plan' ? 'حُفظ التقرير على الخادم.' : kind === 'sample' ? 'حُفظت العينة التحضيرية على الخادم؛ ليست تسليمًا.' : 'حُفظت مسودة المخرج على الخادم؛ لم تُرسل للعميل.');
    } catch (error) {
      const current = this.jobs.get(job.id);
      if (current) {
        current.runState[kind] = 'FAILED';
        current.error = 'تعذر توليد المخرج. افحص إعداد النموذج وحصته ثم أعد المحاولة من التطبيق.';
        this.record(current, `${kind} لم يكتمل؛ لم يسجل الخادم إنجازًا.`);
      }
      console.error('RAM cloud workflow generation failed:', kind, error?.status || error?.name || 'error');
    } finally {
      await this.persist().catch(error => console.error('RAM workflow persist failed:', error?.code || 'error'));
      this.processing = false;
    }
    return true;
  }
}
