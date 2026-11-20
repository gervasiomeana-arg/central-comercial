import https from 'node:https';
import type { RequestHandler } from 'express';

export function operationsProxy(configured?: string): RequestHandler | undefined {
  if (!configured?.trim()) return undefined;
  const target = new URL(configured);
  if (target.protocol !== 'https:' || target.username || target.password ||
      target.pathname !== '/' || target.search || target.hash) {
    throw new Error('CENTRAL_OPERATIONS_URL debe ser una URL raíz HTTPS.');
  }
  return (req, res, next) => {
    const incoming = new URL(req.originalUrl, 'https://publish.invalid');
    let route: string;
    try { route = decodeURIComponent(incoming.pathname).replace(/\/+/g, '/').toLowerCase(); }
    catch { return res.sendStatus(400); }
    if (!route.startsWith('/api/')) return next();
    if (incoming.origin !== 'https://publish.invalid') return res.sendStatus(400);
    // Worker controls are reached directly on the operation host, never through Publish.
    if (/^\/api\/(?:batches\/[^/?]+\/|[^/?]+\/worker\/|local-runtime\/(?:heartbeat|migrate|checkpoint))/.test(route)) {
      return res.sendStatus(404);
    }
    const headers: Record<string, string> = {};
    for (const name of ['authorization', 'content-type', 'content-length', 'accept', 'range']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    const upstream = https.request({
      hostname: target.hostname, port: target.port || 443, method: req.method,
      path: req.originalUrl, headers, timeout: 180000,
    }, response => {
      res.status(response.statusCode || 502);
      for (const name of ['content-type', 'content-length', 'content-disposition', 'content-range',
        'accept-ranges', 'cache-control']) {
        const value = response.headers[name];
        if (value !== undefined) res.setHeader(name, value);
      }
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (res.headersSent) res.destroy();
      else res.status(502).json({ error: 'El servidor de operación no respondió.' });
    });
    req.on('aborted', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    req.pipe(upstream);
  };
}
