/** Local development only: let an iPhone reach a loopback-only API over IPv6 .local. */
import http from 'node:http';

const upstreamPort = Number(process.env.IOS_UPSTREAM_PORT ?? 4000);
const listenPort = Number(process.env.IOS_BRIDGE_PORT ?? 4000);
for (const port of [upstreamPort, listenPort]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
}
const hopHeaders = new Set(['connection', 'proxy-connection', 'keep-alive', 'transfer-encoding', 'upgrade']);
const forwarded = (headers) => Object.fromEntries(Object.entries(headers).filter(([key]) => !hopHeaders.has(key)));
const server = http.createServer((request, response) => {
  const address = request.socket.remoteAddress?.toLowerCase() ?? '';
  if (!(address === '::1' || /^fe[89ab][0-9a-f]:/.test(address) || /^f[cd][0-9a-f]{2}:/.test(address))) {
    response.writeHead(403).end('This development bridge accepts local IPv6 clients only.');
    return;
  }
  if (!request.url?.startsWith('/') || request.url.startsWith('//')) {
    response.writeHead(400).end('Invalid request path.');
    return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, method: request.method,
    path: request.url, headers: forwarded(request.headers) }, (incoming) => {
    response.writeHead(incoming.statusCode ?? 502, forwarded(incoming.headers));
    incoming.pipe(response);
    incoming.on('error', () => response.destroy());
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain' });
    response.end('The local backend is unavailable.');
  });
  request.on('aborted', () => upstream.destroy());
  response.on('close', () => { if (!response.writableFinished) upstream.destroy(); });
  request.pipe(upstream);
});
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
server.listen({ host: '::', port: listenPort, ipv6Only: true }, () => {
  console.log(`Local IPv6 bridge :${listenPort} -> 127.0.0.1:${upstreamPort}; no data is logged.`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
