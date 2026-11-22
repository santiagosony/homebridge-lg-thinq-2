import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Auth } from './Auth.js';
import { Gateway } from './Gateway.js';
import { BROWSER_USER_AGENT } from './request.js';

// A local stand-in for LG's account servers. Like the real ones (see
// nVuln/homebridge-lg-thinq#402), it answers HTTP 403 to POST /spx/preLogin when the
// User-Agent identifies the client as axios.
describe('Auth login User-Agent', () => {
  let server: Server;
  let baseUrl: string;
  const requests: { method?: string; url?: string; userAgent?: string }[] = [];

  const readBody = (req: IncomingMessage) => new Promise<void>(resolve => {
    req.resume();
    req.on('end', () => resolve());
  });

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      await readBody(req);
      const userAgent = req.headers['user-agent'];
      requests.push({ method: req.method, url: req.url, userAgent });

      if (req.url === '/spx/preLogin') {
        if (/axios/i.test(userAgent ?? '')) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'text/html');
          res.end('<html><body><h1>403 Forbidden</h1></body></html>');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ signature: 'sig', tStamp: '1', encrypted_pw: 'encrypted' }));
        return;
      }

      // Stop the flow right after pre-login with a recognizable account error.
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { code: 'TEST.STOP', message: 'stopped after pre-login' } }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('passes LG pre-login, which rejects the axios User-Agent with HTTP 403', async () => {
    const gateway = new Gateway({
      empTermsUri: `${baseUrl}/emp`,
      empSpxUri: `${baseUrl}/spx`,
      thinq2Uri: `${baseUrl}/thinq2`,
      thinq1Uri: `${baseUrl}/thinq1`,
      countryCode: 'US',
      languageCode: 'en-US',
    });
    const auth = new Auth(gateway);

    // Before the fix this failed with "LG pre-login failed" (HTTP 403).
    await expect(auth.login('user@example.com', 'password')).rejects.toThrow('stopped after pre-login');

    const preLogin = requests.find(request => request.url === '/spx/preLogin');
    expect(preLogin).toEqual({ method: 'POST', url: '/spx/preLogin', userAgent: BROWSER_USER_AGENT });
    expect(requests.map(request => request.url)).toEqual([
      '/spx/preLogin',
      '/emp/emp/v2.0/account/session/user%40example.com',
    ]);
  });
});
