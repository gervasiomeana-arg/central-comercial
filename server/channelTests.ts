import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Express, Request, Response } from 'express';

type Channel = 'email' | 'whatsapp';
type State = 'pendiente' | 'en_proceso' | 'aceptado_servicio' | 'fallido' | 'resultado_desconocido';
export interface TestJob {
  id: string; channel: Channel; recipient: string; subject: string; text: string;
  state: State; createdAt: number; updatedAt: number; workerId?: string;
  lease?: string; providerId?: string; evidence?: string;
}
export const TEST_RECIPIENTS = { email: 'gervasiomeana@gmail.com', whatsapp: '5492235802743' };
const PROMOTION = 'Conocé Open Voley: una plataforma de scouting y análisis de voleibol para entrenadores, clubes y asociaciones. Consultá sus funcionalidades y condiciones vigentes en https://openvoley.com. ¿Querés recibir una presentación? Respondé este mensaje. Equipo Open Voley.';

// Separate from commercial contacts, payments and conversion metrics.
export class ChannelTestQueue {
  private jobs: TestJob[];
  private worker: { id: string; at: number; email: boolean; whatsapp: boolean } | null = null;
  constructor(private filename: string, private now = () => Date.now()) {
    this.jobs = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : [];
    if (!Array.isArray(this.jobs)) throw new Error('Registro de pruebas inválido. Conserve el archivo y revise su respaldo.');
  }
  private save() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const tmp = this.filename + '.tmp';
    const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(this.jobs, null, 2)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(tmp, this.filename);
  }
  private expire() {
    let changed = false;
    for (const job of this.jobs) {
      if ((job.state === 'en_proceso' || job.state === 'pendiente') && this.now() - job.updatedAt > 180000) {
        job.state = 'resultado_desconocido';
        job.evidence = 'El ejecutor no confirmó el resultado. No se reenviará automáticamente.';
        delete job.lease; changed = true;
      }
    }
    if (changed) this.save();
  }
  heartbeat(id: string, email: boolean, whatsapp: boolean) {
    if (!id || id.length > 100) throw new Error('Identificador de ejecutor inválido.');
    if (this.worker && this.now() - this.worker.at < 90000 && this.worker.id !== id) {
      throw new Error('Ya hay otro ejecutor activo. Cierre el anterior antes de iniciar otro.');
    }
    this.worker = { id, at: this.now(), email, whatsapp };
  }
  status() {
    this.expire();
    const online = Boolean(this.worker && this.now() - this.worker.at < 90000);
    return { recipients: TEST_RECIPIENTS, online,
      emailReady: online && Boolean(this.worker?.email), whatsappReady: online && Boolean(this.worker?.whatsapp),
      jobs: this.jobs.slice(-20).reverse().map(({ lease, workerId, ...job }) => job) };
  }
  enqueue(channels: Channel[]) {
    this.expire();
    const status = this.status();
    if (!channels.length || channels.some(c => c !== 'email' && c !== 'whatsapp')) throw new Error('Seleccione email o WhatsApp.');
    for (const channel of new Set(channels)) {
      if (!status.online || !(channel === 'email' ? status.emailReady : status.whatsappReady)) {
        throw new Error('Falta conectar ' + channel + ' en el ejecutor de su computadora. No se envió ningún mensaje.');
      }
      if (this.jobs.some(j => j.channel === channel && ['pendiente', 'en_proceso'].includes(j.state))) throw new Error('Ya hay una prueba pendiente para ese canal.');
      if (this.jobs.filter(j => j.channel === channel && this.now() - j.createdAt < 86400000).length >= 5) throw new Error('Límite de cinco pruebas diarias por canal.');
    }
    const created = [...new Set(channels)].map(channel => ({ id: crypto.randomUUID(), channel,
      recipient: TEST_RECIPIENTS[channel], subject: 'Prueba enviada por Central Comercial — Open Voley',
      text: PROMOTION + '\n\nPrueba solicitada por el propietario y ejecutada por Central Comercial.',
      state: 'pendiente' as const, createdAt: this.now(), updatedAt: this.now() }));
    this.jobs.push(...created); this.save(); return created;
  }
  claim(workerId: string) {
    this.expire();
    if (!this.worker || this.worker.id !== workerId || this.now() - this.worker.at >= 90000) throw new Error('Ejecutor desconectado.');
    const job = this.jobs.find(j => j.state === 'pendiente' && this.worker![j.channel]);
    if (!job) return null;
    job.state = 'en_proceso'; job.updatedAt = this.now(); job.workerId = workerId;
    job.lease = crypto.randomBytes(24).toString('hex'); this.save(); return { ...job };
  }
  complete(id: string, workerId: string, lease: string, result: { state: State; providerId?: string; evidence?: string }) {
    this.expire();
    const job = this.jobs.find(j => j.id === id);
    if (!job || job.state !== 'en_proceso' || job.workerId !== workerId || !lease || lease !== job.lease) throw new Error('Prueba no asignada o ya finalizada.');
    if (!['aceptado_servicio', 'fallido', 'resultado_desconocido'].includes(result.state)) throw new Error('Resultado inválido.');
    if (result.state === 'aceptado_servicio' && (!result.providerId || !result.evidence)) throw new Error('Falta confirmación del servicio.');
    job.state = result.state; job.providerId = String(result.providerId || '').slice(0, 300);
    job.evidence = String(result.evidence || '').slice(0, 700); job.updatedAt = this.now();
    delete job.lease; this.save();
  }
}

export function workerAuthorized(header: string | undefined, key = process.env.CHANNEL_TEST_WORKER_KEY || '') {
  if (key.length < 32 || !header?.startsWith('Bearer ')) return false;
  const hash = (v: string) => crypto.createHash('sha256').update(v).digest();
  return crypto.timingSafeEqual(hash(header.slice(7)), hash(key));
}

export function registerWorkerTestRoutes(app: Express, queue: ChannelTestQueue) {
  // Worker secret is independent of the optional administrator login.
  app.post('/api/channel-tests/worker/:action', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Ejecutor no autorizado.' });
    try {
      const { workerId } = req.body;
      if (req.params.action === 'heartbeat') { queue.heartbeat(workerId, req.body.email === true, req.body.whatsapp === true); return res.json({ ok: true }); }
      if (req.params.action === 'claim') return res.json({ job: queue.claim(workerId) });
      if (req.params.action === 'complete') { queue.complete(req.body.id, workerId, req.body.lease, req.body.result || {}); return res.json({ ok: true }); }
      return res.status(404).json({ error: 'Acción desconocida.' });
    } catch (error: any) { return res.status(409).json({ error: error.message }); }
  });
}
