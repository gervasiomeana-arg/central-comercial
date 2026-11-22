import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { requireAdminAuth } from './auth.js';
import { workerAuthorized } from './channelTests.js';
import { db } from './db.js';
import { cloudMonitorMode } from './execution-role.js';
import { googleAdminConfig } from './google-admin.js';
import type { LocalRuntime } from './local-runtime.js';
import type { PcCommercialRecords, PcRecordsStatus } from '../src/pc-records-types.js';

const recordKeys = [
  'applications', 'campaigns', 'clients', 'subscriptions', 'contacts',
  'conversations', 'accountCharges', 'payments', 'tasks',
] as const satisfies readonly (keyof PcCommercialRecords)[];

const reportLifetime = 45000;
const requestLifetime = 40000;

export class PcRecordsRelay {
  private pending?: { id: string; requestedAt: number; workerId?: string };
  private latest?: { workerId: string; receivedAt: number; records: PcCommercialRecords };
  constructor(private now = () => Date.now()) {}

  status(online: boolean): PcRecordsStatus {
    const current = this.latest;
    if (!online || (current && this.now() - current.receivedAt >= reportLifetime)) this.latest = undefined;
    if ((!this.latest || this.now() - this.latest.receivedAt >= 15000) &&
        (!this.pending || this.now() - this.pending.requestedAt >= requestLifetime)) {
      this.pending = { id: randomUUID(), requestedAt: this.now() };
    }
    return { online, records: this.latest?.records, receivedAt: this.latest?.receivedAt };
  }

  claim(workerId: string) {
    if (this.latest && this.latest.workerId !== workerId) this.latest = undefined;
    const request = this.pending;
    if (!request || this.now() - request.requestedAt >= requestLifetime) return;
    if (request.workerId && request.workerId !== workerId) return;
    request.workerId = workerId;
    return request.id;
  }

  accept(id: unknown, workerId: unknown, input: unknown) {
    const request = this.pending;
    if (!request?.workerId || request.id !== id || request.workerId !== workerId ||
        this.now() - request.requestedAt >= requestLifetime || !input || typeof input !== 'object') return false;
    const entries = input as Partial<PcCommercialRecords>;
    if (!recordKeys.every(key => Array.isArray(entries[key]))) return false;
    const records = Object.fromEntries(recordKeys.map(key => [key, entries[key]])) as unknown as PcCommercialRecords;
    this.latest = { workerId: request.workerId, records, receivedAt: this.now() };
    this.pending = undefined;
    return true;
  }
}

export function registerPcRecordsRoutes(app: Express, runtime: LocalRuntime, relay: PcRecordsRelay) {
  app.get('/api/local-runtime/records', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.CENTRAL_LOCAL_MODE !== 'true' || !workerAuthorized(req.headers.authorization)) {
      return res.sendStatus(401);
    }
    const records: PcCommercialRecords = {
      applications: db.getApplications(), campaigns: db.getCampaigns(), clients: db.getClients(),
      subscriptions: db.getSubscriptions(), contacts: db.getContacts(), conversations: db.getConversations(),
      accountCharges: db.getAccountCharges(), payments: db.getPayments(), tasks: db.getTasks(),
    };
    return res.json(records);
  });

  app.get('/api/pc-records', requireAdminAuth, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!cloudMonitorMode() || !googleAdminConfig()) return res.sendStatus(404);
    return res.json(relay.status(runtime.status().online));
  });

  app.post('/api/pc-records', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!cloudMonitorMode() || !googleAdminConfig() || !workerAuthorized(req.headers.authorization)) {
      return res.sendStatus(401);
    }
    if (!runtime.status().online || !relay.accept(req.body?.requestId, req.body?.workerId, req.body?.records)) {
      return res.sendStatus(409);
    }
    return res.json({ ok: true });
  });
}
