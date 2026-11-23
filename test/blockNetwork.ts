/**
 * Jest setup: tests must not reach LG or any other outside server.
 *
 * Tests that depended on LG servers failed whenever LG was slow, changed, or
 * rate-limited the CI runner, and could not run where LG is not reachable. With this
 * file, a connection to any host other than this machine fails at once with an error
 * that names the host, so a test that forgets to fake a request fails clearly instead
 * of timing out. Tests can still start local servers (127.0.0.1) and connect to them.
 */
import net from 'node:net';

// Connect directly, so a proxy on this machine cannot carry requests to outside hosts.
for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) {
  delete process.env[name];
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);

type ConnectTarget = { host?: string, path?: string };

// net.Socket#connect is called as (options[, listener]), (port[, host][, listener]),
// (path[, listener]), or by Node itself with an array of normalized arguments.
function connectTarget(args: unknown[]): ConnectTarget {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === 'object' && first !== null) {
    const options = first as { host?: unknown, path?: unknown };
    return {
      host: typeof options.host === 'string' ? options.host : undefined,
      path: typeof options.path === 'string' ? options.path : undefined,
    };
  }
  if (typeof first === 'string' && Number.isNaN(Number(first))) {
    return { path: first };
  }
  return { host: typeof args[1] === 'string' ? args[1] : undefined };
}

const originalConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
  const { host, path } = connectTarget(args);
  if (path === undefined && host !== undefined && !LOCAL_HOSTS.has(host)) {
    const error = new Error(`Network access is blocked in tests: connection to ${host}. Fake the request instead.`);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return (originalConnect as (...connectArgs: unknown[]) => net.Socket).apply(this, args);
} as typeof net.Socket.prototype.connect;
