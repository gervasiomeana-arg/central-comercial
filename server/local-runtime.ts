import { validDay } from '../src/ledger.js';
import { validateActivity } from './runtime-activity.js';
import type { Express } from 'express';
import { workerAuthorized } from './channelTests.js';
import { pcUpdateStates, type LocalRuntimeState, type PcUpdateStatus } from '../src/runtime-types.js';

export class LocalRuntime {
  private current?: Omit<LocalRuntimeState, 'online'> & { id: string; at: number };
  constructor(private now = () => Date.now()) {}
  heartbeat(input: any) {
    const states = ['running', 'missing', 'stopped'];
    const issues = ['email_missing', 'whatsapp_missing', 'browser_missing', 'jarvis_missing', 'model_missing', 'low_memory', 'component_stopped', 'jarvis_port_busy', 'email_auth', 'whatsapp_auth', 'backup_failed'];
    if (!input || typeof input.workerId !== 'string' || !input.workerId || input.workerId.length > 100 ||
      typeof input.startedAt !== 'number' || !Number.isFinite(input.startedAt) ||
      !Number.isInteger(input.ramGB) || input.ramGB < 1 || input.ramGB > 4096 ||
      typeof input.model !== 'string' || input.model.length > 160 ||
      (input.backupAt !== undefined && (typeof input.backupAt !== 'number' || !Number.isFinite(input.backupAt) || input.backupAt < 0)) ||
      !input.components || ['email', 'whatsapp', 'intelligence'].some(k => !states.includes(input.components[k])) ||
      !Array.isArray(input.issues) || input.issues.length > 12 || input.issues.some((i: unknown) => typeof i !== 'string' || !issues.includes(i))) {
      throw new Error('Estado de la computadora inválido.');
    }
    if(input.connections!==undefined && (!input.connections || ['email','whatsapp','intelligence'].some(k=>typeof input.connections[k]!=='boolean')))throw new Error('Conexiones inválidas.');
    if(input.sourceFingerprint!==undefined && !/^[a-f0-9]{64}$/.test(input.sourceFingerprint))throw new Error('Versión inválida.');
    if(input.diagnosticMode!==undefined && typeof input.diagnosticMode!=='boolean')throw new Error('Modo inválido.');
    if (this.current && this.now() - this.current.at < 90000 && this.current.id !== input.workerId) throw new Error('Ya hay otra computadora de Central Comercial conectada.');
    if (input.reportUnavailable !== undefined && typeof input.reportUnavailable !== 'boolean') throw new Error('Estado del reporte inválido.');
    const reportUnavailable = input.reportUnavailable === true;
    const now = this.now();
    const current = this.current;
    const previous = current && current.id === input.workerId && current.startedAt === input.startedAt &&
      now - (current.reportAt ?? -Infinity) < 90000 ? current : undefined;
    const activity = reportUnavailable ? previous?.activity : input.activity === undefined ? undefined : validateActivity(input.activity);
    const connections = reportUnavailable ? previous?.connections : input.connections
      ? {email:input.connections.email, whatsapp:input.connections.whatsapp, intelligence:input.connections.intelligence} : undefined;
    const reportAt = reportUnavailable ? previous?.reportAt : activity || connections ? now : undefined;
    let update: PcUpdateStatus | undefined;
    if (input.update !== undefined) {
      const candidate = input.update;
      const validCommit = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
      if (!candidate || !pcUpdateStates.includes(candidate.status) ||
          typeof candidate.at !== 'string' || !Number.isFinite(Date.parse(candidate.at)) ||
          (candidate.targetCommit !== undefined && !validCommit(candidate.targetCommit)) ||
          (candidate.installedCommit !== undefined && !validCommit(candidate.installedCommit))) {
        throw new Error('Estado de actualización inválido.');
      }
      update = { status: candidate.status, at: candidate.at, targetCommit: candidate.targetCommit, installedCommit: candidate.installedCommit };
    }
    const report = input.ownerReport;
    const ownerReport = report && typeof report.day === 'string' && validDay(report.day) &&
      ['sin_intento', 'aceptado_proveedor', 'entrega_confirmada', 'rechazado', 'resultado_desconocido', 'registro_no_disponible'].includes(report.status)
      ? { day: report.day, status: report.status,
          at: typeof report.at === 'string' && Number.isFinite(Date.parse(report.at))
            ? new Date(report.at).toISOString() : undefined }
      : undefined;
    this.current = { activity, ownerReport, update, id: input.workerId, at: now, startedAt: input.startedAt, ramGB: input.ramGB, model: input.model, backupAt: input.backupAt,
      components: { email: input.components.email, whatsapp: input.components.whatsapp, intelligence: input.components.intelligence }, issues: [...new Set<string>(input.issues)],
      connections, reportAt, reportUnavailable,
      diagnosticMode:input.diagnosticMode,sourceFingerprint: reportUnavailable ? previous?.sourceFingerprint : input.sourceFingerprint };
  }
  status(): LocalRuntimeState {
    if (!this.current) return { online: false, issues: [] };
    if (this.now() - this.current.at >= 90000) {
      return { online: false, issues: [], lastSeenAt: this.current.at };
    }
    const { id, at, ...status } = this.current;
    return { online: true, ...status,receivedAt:at };
  }
}
export function registerLocalRuntimeRoutes(app: Express, runtime: LocalRuntime, claimRecords?: (workerId: string) => string | undefined) {
  // Outbound heartbeat only. There is no remote shell or process-control endpoint.
  app.post('/api/local-runtime/heartbeat', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!workerAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Computadora no autorizada.' });
    try {
      runtime.heartbeat(req.body);
      res.json({ ok: true, recordsRequest: claimRecords?.(req.body.workerId) });
    }
    catch (e: any) { res.status(409).json({ error: e.message }); }
  });
}
