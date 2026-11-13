import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import { workerAuthorized } from './channelTests.js';
import { db } from './db.js';
import type { JarvisContext, JarvisPlan, JarvisStatus, JarvisStrategy } from '../src/openjarvis-types.js';

type StoredPlan = JarvisPlan & { workerId?: string; leaseHash?: string };
const digest = (s: string) => createHash('sha256').update(s).digest();
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function validateStrategy(input: unknown): JarvisStrategy {
  const p = input as JarvisStrategy;
  const strings = (v: unknown, min: number, max: number, length: number): v is string[] =>
    Array.isArray(v) && v.length >= min && v.length <= max && v.every(s => text(s, length));
  if (!p || !Array.isArray(p.segments) || !p.segments.length || p.segments.length > 5 ||
    !p.segments.every(s => s && text(s.name, 160) && text(s.reason, 500)) ||
    !strings(p.searchQueries, 1, 5, 240) || !text(p.campaignAngle, 1000) ||
    !strings(p.nextSteps, 1, 6, 400) || !strings(p.ownerQuestions, 0, 4, 300)) {
    throw new Error('OpenJarvis devolvió una estrategia incompleta o demasiado extensa. No se aplicó ningún cambio.');
  }
  // Only this explicit, non-executable schema is retained. No tool calls, HTML or commands.
  return { segments: p.segments.map(s => ({ name: s.name.trim(), reason: s.reason.trim() })),
    searchQueries: p.searchQueries.map(s => s.trim()), campaignAngle: p.campaignAngle.trim(),
    nextSteps: p.nextSteps.map(s => s.trim()), ownerQuestions: p.ownerQuestions.map(s => s.trim()) };
}

export class JarvisQueue {
  private plans: StoredPlan[];
  private worker?: { id: string; at: number; ready: boolean; model: string; detail: string; assistant: boolean };
  constructor(private file: string, private now = () => Date.now()) {
    this.plans = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    if (!Array.isArray(this.plans)) throw new Error('Registro OpenJarvis inválido; conservar el archivo para revisión.');
  }
  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.plans, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.file);
  }
  private expire() {
    let changed = false;
    for (const plan of this.plans) {
      if ((plan.state === 'running' && this.now() - plan.updatedAt > 600000) ||
          (plan.state === 'queued' && this.now() - plan.updatedAt > 86400000)) {
        plan.state = 'failed'; plan.error = 'La tarea venció sin confirmación. No se repite automáticamente.';
        plan.updatedAt = this.now(); delete plan.leaseHash; changed = true;
      }
    }
    if (changed) this.save();
  }
  heartbeat(id: unknown, ready: unknown, model: unknown, assistant = false) {
    if (!text(id, 100) || typeof ready !== 'boolean' || typeof model !== 'string' || model.length > 160 || (ready && !model.trim())) {
      throw new Error('Estado del puente OpenJarvis inválido.');
    }
    if (this.worker && this.worker.id !== id && this.now() - this.worker.at < 90000) throw new Error('Ya hay un puente OpenJarvis conectado.');
    this.worker = { id: id as string, at: this.now(), ready, model, assistant: assistant === true,
      detail: ready ? 'Modelo disponible en el servidor local de OpenJarvis.' : 'Puente conectado; OpenJarvis o su modelo local todavía no están disponibles.' };
  }
  status(): Omit<JarvisStatus, 'configured'> {
    this.expire();
    const online = Boolean(this.worker && this.now() - this.worker.at < 90000);
    return { online, ready: online && Boolean(this.worker?.ready), assistantReady: online && Boolean(this.worker?.ready && this.worker?.assistant), model: online ? this.worker!.model : '',
      detail: online ? this.worker!.detail : 'Pendiente de iniciar el puente y OpenJarvis en tu computadora.',
      plans: this.plans.slice(-30).reverse().map(({ workerId, leaseHash, ...plan }) => plan) };
  }
  assistantWorkerReady(id: string) { return this.status().assistantReady === true && this.worker?.id === id; }
  completed(id:string){const p=this.plans.find(p=>p.id===id);if(p?.state!=='completed'||!p.strategy)return null;return {id:p.id,context:p.context,strategy:p.strategy};}
  enqueue(context: JarvisContext) {
    this.expire();
    // Reuse identical requests, including completed ones, for a day: no repeated model spending.
    const same = this.plans.find(p => p.state !== 'failed' && this.now() - p.createdAt < 86400000 && JSON.stringify(p.context) === JSON.stringify(context));
    if (same) return same.id;
    if (!this.status().ready) throw new Error('Primero conectá OpenJarvis y su modelo local. No se llamó a una API de pago.');
    if (this.plans.filter(p => this.now() - p.createdAt < 86400000).length >= 6) throw new Error('Límite de seis estrategias diarias para cuidar los recursos.');
    const plan: StoredPlan = { id: randomUUID(), context, state: 'queued', createdAt: this.now(), updatedAt: this.now() };
    this.plans.push(plan); this.save(); return plan.id;
  }
  claim(id: string) {
    const status = this.status();
    if (!status.ready || this.worker?.id !== id) throw new Error('Puente OpenJarvis no disponible.');
    if (this.plans.some(p => p.state === 'running')) return null;
    const plan = this.plans.find(p => p.state === 'queued');
    if (!plan) return null;
    const lease = randomBytes(24).toString('hex');
    plan.state = 'running'; plan.updatedAt = this.now(); plan.workerId = id; plan.leaseHash = digest(lease).toString('hex');
    plan.model = this.worker.model; this.save();
    return { id: plan.id, lease, context: plan.context, model: plan.model };
  }
  complete(id: string, workerId: string, lease: unknown, input: { strategy?: unknown; failed?: boolean }) {
    this.expire();
    const plan = this.plans.find(p => p.id === id);
    if (!plan || plan.workerId !== workerId || !text(lease, 100) || !plan.leaseHash ||
      !timingSafeEqual(digest(lease as string), Buffer.from(plan.leaseHash, 'hex'))) throw new Error('Resultado no asignado a este puente.');
    // Duplicate delivery after a lost HTTP response is acknowledged without regenerating.
    if (plan.state === 'completed' || plan.state === 'failed') return;
    if (plan.state !== 'running') throw new Error('Tarea no ejecutable.');
    if (input.failed === true) { plan.state = 'failed'; plan.error = 'No se obtuvo una estrategia válida del modelo local. Revisá la ventana del puente.'; }
    else { plan.strategy = validateStrategy(input.strategy); plan.state = 'completed'; }
    plan.updatedAt = this.now(); this.save();
  }
}

export function enqueueJarvisPlan(queue: JarvisQueue, appId: unknown, country: unknown) {
  if (!text(appId, 100) || !text(country, 100)) throw new Error('Elegí una aplicación y un país del objetivo mensual.');
  const app = db.getApplicationById(appId as string), report = db.getSalesGoalReport();
  if (!app || app.status !== 'lista' || !app.campaignsAllowed) throw new Error('Esta aplicación todavía no está habilitada para campañas.');
  if (!report.goal.countries.includes(country as string)) throw new Error('El país debe estar incluido en el objetivo mensual.');
  // No contacts, message histories, balances, credentials or unverified offers leave this boundary.
  return queue.enqueue({ app: { id: app.id, name: app.name, description: app.description,
    audience: app.targetAudience, website: app.website, features: app.verifiedFeatures }, country: country as string,
    goal: { month: report.goal.month, targetClients: report.goal.targetClients, remainingClients: report.remaining,
      dailyEmailLimit: report.goal.dailyEmailLimit, dailyResearchLimit: report.goal.dailyResearchLimit } });
}
export function registerJarvisWorkerRoutes(app: Express, queue: JarvisQueue) {
  app.post('/api/openjarvis/worker/:action', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Puente no autorizado.' });
    try {
      const { workerId } = req.body || {};
      if (!text(workerId, 100)) throw new Error('Identificador de puente inválido.');
      if (req.params.action === 'heartbeat') { queue.heartbeat(workerId, req.body.ready, req.body.model, req.body.assistant === true); return res.json({ ok: true }); }
      if (req.params.action === 'claim') return res.json({ job: queue.claim(workerId) });
      if (req.params.action === 'complete') { queue.complete(req.body.id, workerId, req.body.lease, req.body); return res.json({ ok: true }); }
      return res.status(404).json({ error: 'Acción desconocida.' });
    } catch (e: any) { return res.status(409).json({ error: e.message }); }
  });
}
