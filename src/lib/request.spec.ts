import { describe, test, expect, afterEach, afterAll, beforeAll, jest } from '@jest/globals';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { MonitorError, NotConnectedError } from '../errors/index.js';
import { BROWSER_USER_AGENT, requestClient } from './request.js';

const originalAdapter = requestClient.defaults.adapter;

const responseFor = (config: InternalAxiosRequestConfig, data: unknown = { ok: true }): AxiosResponse => ({
  config,
  data,
  headers: {},
  status: 200,
  statusText: 'OK',
});

const withTimeout = async <T>(promise: Promise<T>): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('request slot was not released')), 1000);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

describe('request client throttling', () => {
  afterEach(() => {
    requestClient.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  test('releases the request slot when a ThinQ1 response is translated into an error', async () => {
    let calls = 0;
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      calls++;
      if (calls === 1) {
        return responseFor(config, {
          lgedmRoot: {
            returnCd: '0106',
            returnMsg: 'offline',
          },
        });
      }

      return responseFor(config);
    });

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(requestClient.get('/thinq1-error')).rejects.toThrow(NotConnectedError);
    await expect(withTimeout(requestClient.get('/after-thinq1-error'))).resolves.toMatchObject({ data: { ok: true } });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  test('releases the request slot when a network error is translated into an error', async () => {
    let calls = 0;
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => {
      calls++;
      if (calls === 1) {
        throw new Error('socket closed');
      }

      return responseFor(config);
    });

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(requestClient.get('/network-error')).rejects.toThrow(NotConnectedError);
    await expect(withTimeout(requestClient.get('/after-network-error'))).resolves.toMatchObject({ data: { ok: true } });
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  test('preserves unknown ThinQ1 monitor error codes without undefined text', async () => {
    const adapter = jest.fn(async (config: InternalAxiosRequestConfig) => responseFor(config, {
      lgedmRoot: {
        returnCd: '9998',
      },
    }));

    requestClient.defaults.adapter = adapter as AxiosAdapter;

    await expect(requestClient.get('/unknown-thinq1-error')).rejects.toThrow(new MonitorError('9998'));
  });
});

describe('request client User-Agent', () => {
  let server: Server;
  let baseUrl: string;
  let receivedUserAgents: (string | undefined)[];

  beforeAll(async () => {
    receivedUserAgents = [];
    server = createServer((req, res) => {
      receivedUserAgents.push(req.headers['user-agent']);
      res.setHeader('Content-Type', 'application/json');
      res.end('{}');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  afterEach(() => {
    receivedUserAgents = [];
  });

  // LG's account servers answer HTTP 403 to requests that identify as axios (for example
  // POST /spx/preLogin), which broke login. See nVuln/homebridge-lg-thinq#402.
  test('sends a browser User-Agent instead of the axios default', async () => {
    await requestClient.post(`${baseUrl}/spx/preLogin`, 'user_auth2=x', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    expect(receivedUserAgents).toEqual([BROWSER_USER_AGENT]);
    expect(receivedUserAgents[0]).not.toMatch(/axios/i);
  });

  test('keeps a User-Agent set by the caller, whatever its letter case', async () => {
    await requestClient.get(`${baseUrl}/service/devices`, { headers: { 'user-agent': 'okhttp/3.14.9' } });
    await requestClient.get(`${baseUrl}/service/devices`, { headers: { 'User-Agent': 'okhttp/3.14.9' } });

    expect(receivedUserAgents).toEqual(['okhttp/3.14.9', 'okhttp/3.14.9']);
  });
});
