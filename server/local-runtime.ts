import type { Express } from 'express';
import { workerAuthorized } from './channelTests.js';
import type { LocalRuntimeState } from '../src/runtime-types.js';

export class LocalRuntime {
  private current?: Omit<LocalRuntimeState, 'online'> & { id: string; at: number };
  constructor(private now = () => Date.now()) {}
  heartbeat(input: any) {
    const states = ['running', 'missing', 'stopped'];
    const issues = ['email_missing', 'whatsapp_missing', 'browser_missing', 'jarvis_missing', 'model_missing', 'low_memory', 'component_stopped', 'jarvis_port_busy'];
    if (!input || typeof input.workerId !== 'string' || !input.workerId || input.workerId.length > 100 ||
      typeof input.startedAt !== 'number' || !Number.isFinite(input.startedAt) ||
      !Number.isInteger(input.ramGB) || input.ramGB < 1 || input.ramGB > 4096 ||
      typeof input.model !== 'string' || input.model.length > 160 ||
      !input.components || ['email', 'whatsapp', 'intelligence'].some(k => !states.includes(input.components[k])) ||
      !Array.isArray(input.issues) || input.issues.length > 8 || input.issues.some((i: unknown) => typeof i !== 'string' || !issues.includes(i))) {
      throw new Error('Estado de la computadora inválido.');
    }
    if (this.current && this.now() - this.current.at < 90000 && this.current.id !== input.workerId) throw new Error('Ya hay otra computadora de Central Comercial conectada.');
    this.current = { id: input.workerId, at: this.now(), startedAt: input.startedAt, ramGB: input.ramGB, model: input.model,
      components: { email: input.components.email, whatsapp: input.components.whatsapp, intelligence: input.components.intelligence }, issues: [...new Set<string>(input.issues)] };
  }
  status(): LocalRuntimeState {
    if (!this.current || this.now() - this.current.at >= 90000) return { online: false, issues: [] };
    const { id, at, ...status } = this.current;
    return { online: true, ...status };
  }
}
export function registerLocalRuntimeRoutes(app: Express, runtime: LocalRuntime) {
  // Outbound heartbeat only. There is no remote shell or process-control endpoint.
  app.post('/api/local-runtime/heartbeat', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Computadora no autorizada.' });
    try { runtime.heartbeat(req.body); res.json({ ok: true }); }
    catch (e: any) { res.status(409).json({ error: e.message }); }
  });
}
