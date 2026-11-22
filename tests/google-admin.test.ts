import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import express from 'express';
import { requireAdminAuth } from '../server/auth.js';
import { registerGoogleAdminRoutes } from '../server/google-admin.js';
import { LocalRuntime, registerLocalRuntimeRoutes } from '../server/local-runtime.js';
import { PcRecordsRelay, registerPcRecordsRoutes } from '../server/pc-records.js';

test('Publish exige una cuenta de Google verificada y autorizada antes de abrir el resumen', async t => {
  const settings = {
    CENTRAL_LOCAL_MODE: 'false', CENTRAL_CLOUD_OPERATIONS: 'false',
    GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-secret',
    GOOGLE_ADMIN_EMAIL: 'owner@example.com', CHANNEL_TEST_WORKER_KEY: 'fixture-worker-key'.repeat(3),
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  const app = express();
  app.use(express.json());
  let now = Date.now();
  const runtime = new LocalRuntime(() => now);
  const relay = new PcRecordsRelay(() => now);
  registerLocalRuntimeRoutes(app, runtime, workerId => relay.claim(workerId));
  registerGoogleAdminRoutes(app);
  registerPcRecordsRoutes(app, runtime, relay);
  app.get('/resumen-privado', requireAdminAuth, (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Servidor de prueba sin dirección.');
  const url = 'http://127.0.0.1:' + address.port;

  const realFetch = globalThis.fetch;
  let email = 'another@example.com';
  let verified = true;
  let exchanges = 0;
  t.mock.method(globalThis, 'fetch', (input: string | URL | Request, init?: RequestInit) => {
    if (input === 'https://oauth2.googleapis.com/token') {
      exchanges++;
      assert.match(String(init?.body), /code_verifier=/);
      return Promise.resolve(Response.json({ access_token: 'fixture-token' }));
    }
    if (input === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return Promise.resolve(Response.json({ sub: 'fixture-sub', email, email_verified: verified }));
    }
    return realFetch(input, init);
  });

  const start = await fetch(url + '/api/auth/google', { redirect: 'manual' });
  const location = new URL(start.headers.get('location')!);
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  const oauthCookie = start.headers.get('set-cookie')!;
  assert.match(oauthCookie, /HttpOnly; Secure; SameSite=Lax/);
  const flow = oauthCookie.split(';')[0];
  const state = location.searchParams.get('state')!;
  const callback = (value: string) => fetch(url + '/api/auth/google/callback?' + new URLSearchParams({ code: 'fixture', state: value }), {
    redirect: 'manual', headers: { Cookie: flow },
  });

  assert.equal((await fetch(url + '/resumen-privado')).status, 401);
  assert.equal((await callback('x'.repeat(43))).headers.get('location'), '/?google_login=retry');
  assert.equal(exchanges, 0);
  assert.equal((await callback(state)).headers.get('location'), '/?google_login=denied');
  email = 'owner@example.com';
  verified = false;
  assert.equal((await callback(state)).headers.get('location'), '/?google_login=denied');
  verified = true;
  const signedIn = await callback(state);
  assert.equal(signedIn.headers.get('location'), '/');
  const cookie = signedIn.headers.getSetCookie().find(line => line.startsWith('__Host-central-session='))!;
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  const ownerHeaders = { Cookie: cookie.split(';')[0] };
  assert.equal((await fetch(url + '/resumen-privado', { headers: ownerHeaders })).status, 200);

  const workerId = 'fixture-pc';
  const heartbeat = { workerId, startedAt: now, ramGB: 8, model: 'test',
    components: { email: 'running', whatsapp: 'running', intelligence: 'running' }, issues: [] };
  const pcPost = (route: string, payload: unknown) => fetch(url + route, {
    method: 'POST', headers: { Authorization: 'Bearer ' + settings.CHANNEL_TEST_WORKER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const readRecords = () => fetch(url + '/api/pc-records', { headers: ownerHeaders }).then(res => res.json());
  assert.equal((await fetch(url + '/api/pc-records')).status, 401);
  assert.equal((await pcPost('/api/local-runtime/heartbeat', heartbeat).then(res => res.json())).recordsRequest, undefined);
  assert.deepEqual(await readRecords(), { online: true });
  const { recordsRequest } = await pcPost('/api/local-runtime/heartbeat', heartbeat).then(res => res.json());
  assert.ok(recordsRequest);
  const records = {
    applications: [], campaigns: [], clients: [], subscriptions: [], contacts: [{ id: 'from-pc' }],
    conversations: [{ id: 'thread-from-pc' }], accountCharges: [], payments: [], tasks: [],
  };
  assert.equal((await pcPost('/api/pc-records', { requestId: recordsRequest, workerId: 'different-pc', records })).status, 409);
  assert.equal((await pcPost('/api/pc-records', { requestId: recordsRequest, workerId, records })).status, 200);
  assert.deepEqual((await readRecords()).records, records);
  now += 45000;
  assert.deepEqual(await readRecords(), { online: true });
});
