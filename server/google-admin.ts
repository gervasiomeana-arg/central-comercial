import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Express, Request } from 'express';
import { authManager, googleSessionCookie, requestAdminToken } from './auth.js';
import { cloudMonitorMode } from './execution-role.js';

export const GOOGLE_ADMIN_START = 'https://central-comercial.ai.studio/api/auth/google';
const callback = GOOGLE_ADMIN_START + '/callback';
const stateCookie = '__Host-central-oauth';
export const googleCookieOptions = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
const stateAgeMs = 5 * 60 * 1000;
const sessionAgeMs = 7 * 24 * 60 * 60 * 1000;

export function googleAdminConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const email = (process.env.GOOGLE_ADMIN_EMAIL?.trim() || authManager.getAdminPublic()?.email)?.toLowerCase();
  return clientId && clientSecret && email ? { clientId, clientSecret, email } : undefined;
}

function cookie(req: Request, name: string) {
  return req.headers.cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith(name + '='))?.slice(name.length + 1);
}

export function verifiedGoogleAdmin(profile: unknown, ownerEmail: string) {
  const account = profile as { sub?: unknown; email?: unknown; email_verified?: unknown; name?: unknown } | null;
  return account && account.email_verified === true && typeof account.sub === 'string' && account.sub.length > 0 &&
    typeof account.email === 'string' && account.email.toLowerCase() === ownerEmail
    ? { id: 'google-' + account.sub, email: ownerEmail, name: typeof account.name === 'string' ? account.name.slice(0, 120) : 'Administrador' }
    : null;
}

export function registerGoogleAdminRoutes(app: Express) {
  app.get('/api/auth/google', (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const config = cloudMonitorMode() ? googleAdminConfig() : undefined;
    if (!config) return res.redirect(303, '/?google_login=unavailable');

    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    res.cookie(stateCookie, [state, verifier, Date.now()].join('.'), { ...googleCookieOptions, maxAge: stateAgeMs });
    const destination = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    destination.search = new URLSearchParams({
      client_id: config.clientId, redirect_uri: callback, response_type: 'code',
      scope: 'openid email', state, prompt: 'select_account',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    }).toString();
    res.redirect(303, destination.toString());
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    const config = cloudMonitorMode() ? googleAdminConfig() : undefined;
    if (!config) return res.redirect(303, '/?google_login=unavailable');

    const attempt = cookie(req, stateCookie);
    res.clearCookie(stateCookie, googleCookieOptions);
    const match = /^([\w-]{43})\.([\w-]{43})\.(\d{13})$/.exec(attempt || '');
    const { state, code } = req.query;
    if (!match || typeof state !== 'string' || !/^[\w-]{43}$/.test(state) ||
        !timingSafeEqual(Buffer.from(match[1]), Buffer.from(state)) ||
        Date.now() - Number(match[3]) > stateAgeMs || Number(match[3]) > Date.now() ||
        typeof code !== 'string' || !code || code.length > 2048) {
      return res.redirect(303, '/?google_login=retry');
    }

    try {
      const exchange = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({
          code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: callback,
          grant_type: 'authorization_code', code_verifier: match[2],
        }),
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!exchange.ok) throw new Error('Google rechazó el código.');
      const { access_token } = await exchange.json();
      if (typeof access_token !== 'string' || !access_token) throw new Error('Google no devolvió una sesión.');

      const identity = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + access_token }, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!identity.ok) throw new Error('Google no devolvió la identidad.');
      const owner = verifiedGoogleAdmin(await identity.json(), config.email);
      if (!owner) return res.redirect(303, '/?google_login=denied');

      authManager.logout(requestAdminToken(req));
      const existingAdmin = authManager.getAdminPublic();
      const session = authManager.createSession(existingAdmin?.email.toLowerCase() === owner.email ? existingAdmin : owner);
      res.cookie(googleSessionCookie, session, { ...googleCookieOptions, maxAge: sessionAgeMs });
      return res.redirect(303, '/');
    } catch {
      return res.redirect(303, '/?google_login=retry');
    }
  });
}
