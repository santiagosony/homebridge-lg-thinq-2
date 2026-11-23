/* eslint-disable dot-notation */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Logger } from 'homebridge';
import { API } from './API.js';
import type { Auth } from './Auth.js';
import { Gateway } from './Gateway.js';
import { Session } from './Session.js';
import { requestClient } from './request.js';
import { GATEWAY_URL } from './constants.js';
import { MonitorError, NotConnectedError } from '../errors/index.js';

// Made-up LG servers. No test talks to the real ones (see test/blockNetwork.ts).
const GATEWAY_DATA = {
  empTermsUri: 'https://emp.example.com',
  empSpxUri: 'https://spx.example.com/spx',
  thinq2Uri: 'https://thinq2.example.com/v1',
  thinq1Uri: 'https://thinq1.example.com/api',
  countryCode: 'US',
  languageCode: 'en-US',
};
const THINQ2 = 'https://thinq2.example.com/v1/';
const THINQ1 = 'https://thinq1.example.com/api/';

const originalAdapter = requestClient.defaults.adapter;

// Session expiry times are in seconds.
const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

type FakeRequest = { method: string, url: string, headers: Record<string, unknown>, data: unknown };
type FakeReply = { status?: number, data: unknown };

/**
 * Answers every request of the shared HTTP client with `reply` and records the
 * requests. A reply with a status of 400 or more is returned as an HTTP error, as
 * LG returns it, so the error handling of request.ts runs as it does in use.
 */
function fakeLg(reply: (request: FakeRequest) => FakeReply) {
  const requests: FakeRequest[] = [];
  requestClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const request = {
      method: config.method ?? 'get',
      url: new URL(config.url ?? '', config.baseURL).href,
      headers: { ...config.headers } as Record<string, unknown>,
      data: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
    };
    requests.push(request);
    const { status = 200, data } = reply(request);
    const response = { data, status, statusText: String(status), headers: {}, config };
    if (status >= 400) {
      throw new AxiosError('Request failed with status code ' + status, 'ERR_BAD_REQUEST', config, undefined, response);
    }
    return response;
  };
  return requests;
}

function createLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger & Record<'debug' | 'info' | 'warn' | 'error', jest.Mock>;
}

function fakeAuth(overrides: Partial<Record<keyof Auth, unknown>> = {}) {
  return {
    login: jest.fn(async () => new Session('login-access', 'login-refresh', 0)),
    refreshNewToken: jest.fn(async (session: Session) => new Session('fresh-access', session.refreshToken, inOneHour())),
    getJSessionId: jest.fn(async () => 'jsession'),
    getUserNumber: jest.fn(async () => 'user-number'),
    handleNewTerm: jest.fn(async () => ['A:T1:en']),
    ...overrides,
  };
}

describe('API', () => {
  let api: API;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger();
    api = new API('US', 'en-US', logger);
    // Most tests start after the gateway lookup, as the plugin does once it is running.
    api['_gateway'] = new Gateway(GATEWAY_DATA);
  });

  afterEach(() => {
    requestClient.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  describe('setup', () => {
    test('starts without a client id and with the shared HTTP client', () => {
      expect(api.client_id).toBeUndefined();
      expect(api.httpClient).toBe(requestClient);
    });

    test('can be constructed by JavaScript callers without a logger', async () => {
      const apiWithoutLogger = new API('US', 'en-US');

      await expect(apiWithoutLogger.getRequest('')).rejects.toThrow('Invalid URI');
    });

    test('stores the username and password', () => {
      api.setUsernamePassword('test@example.com', 'test-password');

      expect(api['username']).toBe('test@example.com');
      expect(api['password']).toBe('test-password');
    });

    test('stores the refresh token, and refuses an empty one', () => {
      api.setRefreshToken('test-refresh-token');

      expect(api['session'].refreshToken).toBe('test-refresh-token');
      expect(() => api.setRefreshToken('  ')).toThrow('Invalid refreshToken');
    });
  });

  describe('gateway', () => {
    test('asks LG for the servers of the account country once, and reuses the answer', async () => {
      api['_gateway'] = undefined;
      const requests = fakeLg(() => ({ data: { result: GATEWAY_DATA } }));

      const gateway = await api.gateway();
      await api.gateway();

      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(GATEWAY_URL);
      expect(requests[0].headers['x-country-code']).toBe('US');
      expect(requests[0].headers['x-language-code']).toBe('en-US');
      expect(gateway.thinq2_url).toBe(THINQ2);
      expect(gateway.thinq1_url).toBe(THINQ1);
    });
  });

  describe('ready', () => {
    test('signs in with the username and password, then gets the session details', async () => {
      const auth = fakeAuth();
      api['auth'] = auth as unknown as Auth;
      api.setUsernamePassword('test@example.com', 'test-password');

      await api.ready();

      expect(auth.login).toHaveBeenCalledWith('test@example.com', 'test-password');
      expect(auth.refreshNewToken).toHaveBeenCalledTimes(1);
      expect(api['session'].accessToken).toBe('fresh-access');
      expect(api['jsessionId']).toBe('jsession');
      expect(api['userNumber']).toBe('user-number');
      expect(api.client_id).toMatch(/^[0-9a-f]{64}$/);
    });

    test('with a refresh token, gets a new access token without signing in', async () => {
      const auth = fakeAuth();
      api['auth'] = auth as unknown as Auth;
      api.setRefreshToken('test-refresh-token');

      await api.ready();

      expect(auth.login).not.toHaveBeenCalled();
      expect(auth.refreshNewToken).toHaveBeenCalledWith(expect.objectContaining({ refreshToken: 'test-refresh-token' }));
      expect(api['session'].accessToken).toBe('fresh-access');
    });

    test('keeps a valid access token and an existing client id', async () => {
      const auth = fakeAuth();
      api['auth'] = auth as unknown as Auth;
      api['session'] = new Session('valid-access', 'test-refresh-token', inOneHour());
      api.client_id = 'existing-client-id';

      await api.ready();

      expect(auth.refreshNewToken).not.toHaveBeenCalled();
      expect(api['session'].accessToken).toBe('valid-access');
      expect(api.client_id).toBe('existing-client-id');
    });
  });

  describe('requests', () => {
    test('sends ThinQ2 requests to the gateway server with the session headers', async () => {
      api['session'] = new Session('access-token', 'refresh-token', inOneHour());
      api['userNumber'] = 'user-number';
      api.client_id = 'client-id';
      const requests = fakeLg(() => ({ data: { resultCode: '0000', result: { ok: true } } }));

      const response = await api.getRequest('service/homes');

      expect(response).toEqual({ resultCode: '0000', result: { ok: true } });
      expect(requests[0].url).toBe(THINQ2 + 'service/homes');
      expect(requests[0].headers).toEqual(expect.objectContaining({
        'x-emp-token': 'access-token',
        'x-user-no': 'user-number',
        'x-client-id': 'client-id',
        'x-country-code': 'US',
        'x-language-code': 'en-US',
      }));
    });

    test('lists the devices of every home', async () => {
      const requests = fakeLg(({ url }) => {
        if (url === THINQ2 + 'service/homes') {
          return { data: { result: { item: [{ homeId: 'home-1' }, { homeId: 'home-2' }] } } };
        }
        const homeId = url.split('/').pop();
        return { data: { result: { devices: [{ deviceId: homeId + '-washer' }] } } };
      });

      const devices = await api.getListDevices();
      // The homes are kept, so a second call only asks for the devices.
      await api.getListDevices();

      expect(devices).toEqual([{ deviceId: 'home-1-washer' }, { deviceId: 'home-2-washer' }]);
      expect(requests.map(request => request.url)).toEqual([
        THINQ2 + 'service/homes',
        THINQ2 + 'service/homes/home-1',
        THINQ2 + 'service/homes/home-2',
        THINQ2 + 'service/homes/home-1',
        THINQ2 + 'service/homes/home-2',
      ]);
    });

    test('gets a single device', async () => {
      fakeLg(() => ({ data: { result: { deviceId: 'dev-washer' } } }));

      await expect(api.getSingleDevice('dev-washer')).resolves.toEqual({ deviceId: 'dev-washer' });
    });

    test('sends a device command', async () => {
      const requests = fakeLg(() => ({ data: { resultCode: '0000' } }));

      const result = await api.sendCommandToDevice('dev-ac', { dataKey: 'airState.opMode', dataValue: 1 }, 'Set');

      expect(result).toEqual({ resultCode: '0000' });
      expect(requests[0]).toEqual(expect.objectContaining({
        method: 'post',
        url: THINQ2 + 'service/devices/dev-ac/control-sync',
        data: { ctrlKey: 'basicCtrl', command: 'Set', dataKey: 'airState.opMode', dataValue: 1 },
      }));
    });

    test('refuses device commands with a missing device or an unknown command', async () => {
      const requests = fakeLg(() => ({ data: {} }));

      await expect(api.sendCommandToDevice(' ', {}, 'Set')).rejects.toThrow('Invalid device_id');
      await expect(api.sendCommandToDevice('dev-ac', {}, 'Reboot' as 'Set')).rejects.toThrow('Invalid command');
      expect(requests).toHaveLength(0);
    });
  });

  describe('LG error answers', () => {
    test('gets a new access token and repeats the request once when the token expired', async () => {
      const auth = fakeAuth();
      api['auth'] = auth as unknown as Auth;
      api.setRefreshToken('test-refresh-token');
      const requests = fakeLg(({ headers }) => headers['x-emp-token'] === 'fresh-access'
        ? { data: { result: 'after refresh' } }
        : { status: 400, data: { resultCode: '0102' } });

      await expect(api.getRequest('service/homes')).resolves.toEqual({ result: 'after refresh' });
      expect(auth.refreshNewToken).toHaveBeenCalledTimes(1);
      expect(requests).toHaveLength(2);
    });

    test('accepts new LG terms and repeats the request once', async () => {
      const auth = fakeAuth();
      api['auth'] = auth as unknown as Auth;
      let calls = 0;
      fakeLg(() => (++calls === 1 ? { status: 400, data: { resultCode: '0110' } } : { data: { result: 'after terms' } }));

      await expect(api.getRequest('service/homes')).resolves.toEqual({ result: 'after terms' });
      expect(auth.handleNewTerm).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Accepted new LG terms on behalf of your account'));
    });

    test('gives up after one retry when LG keeps asking for new terms', async () => {
      const auth = fakeAuth({ handleNewTerm: jest.fn(async () => []) });
      api['auth'] = auth as unknown as Auth;
      const requests = fakeLg(() => ({ status: 400, data: { resultCode: '0110' } }));

      await expect(api.getRequest('service/homes')).resolves.toEqual({});
      expect(requests).toHaveLength(2);
      expect(logger.warn).toHaveBeenCalledWith('LG asked for new terms, but none were pending for your account.');
    });

    test('logs a failed terms update without the request data', async () => {
      const auth = fakeAuth({ handleNewTerm: jest.fn(async () => {
        throw new Error('terms update failed');
      }) });
      api['auth'] = auth as unknown as Auth;
      fakeLg(() => ({ status: 400, data: { resultCode: '0110' } }));

      await expect(api.getRequest('service/homes')).resolves.toEqual({});
      expect(logger.error).toHaveBeenCalledWith('Error: terms update failed');
    });

    test('reports a device that is not connected to the caller', async () => {
      fakeLg(() => ({ status: 400, data: { resultCode: '9999' } }));

      await expect(api.getRequest('service/devices/dev-ac')).rejects.toThrow(NotConnectedError);
    });

    test('logs commands a device does not support at debug level only', async () => {
      fakeLg(() => ({ status: 400, data: { resultCode: '0101', result: '' } }));

      const result = await api.postRequest('service/devices/dev-ac/control-sync', { command: 'Set' });

      expect(result).toEqual({});
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('resultCode 0101'),
        expect.objectContaining({ resultCode: '0101' }),
        { command: 'Set' },
      );
    });

    test('logs other LG errors at error level', async () => {
      fakeLg(() => ({ status: 400, data: { resultCode: '0001', result: '' } }));

      const result = await api.postRequest('service/devices/dev-ac/control-sync', { command: 'Set' });

      expect(result).toEqual({});
      expect(logger.error).toHaveBeenCalledWith(
        'axios request error: ',
        expect.objectContaining({ resultCode: '0001' }),
        { command: 'Set' },
      );
    });

    test('logs errors that are not HTTP errors', async () => {
      jest.spyOn(api.httpClient, 'request').mockRejectedValueOnce(new Error('unexpected'));

      await expect(api.getRequest('service/homes')).resolves.toEqual({});
      expect(logger.error).toHaveBeenCalledWith('request error: ', 'Error: unexpected');
    });
  });

  describe('ThinQ1 monitoring', () => {
    test('starts monitoring with the ThinQ1 headers', async () => {
      api['session'] = new Session('access-token', 'refresh-token', inOneHour());
      api['jsessionId'] = 'jsession';
      const requests = fakeLg(() => ({ data: { lgedmRoot: { returnCd: '0000', workId: 'work-1' } } }));

      const result = await api.sendMonitorCommand('dev-old', 'Start', 'work-1' as never);

      expect(result).toEqual({ returnCd: '0000', workId: 'work-1' });
      expect(requests[0].url).toBe(THINQ1 + 'rti/rtiMon');
      expect(requests[0].data).toEqual({ lgedmRoot: { cmd: 'Mon', cmdOpt: 'Start', deviceId: 'dev-old', workId: 'work-1' } });
      expect(requests[0].headers).toEqual(expect.objectContaining({
        'x-thinq-token': 'access-token',
        'x-thinq-jsessionId': 'jsession',
      }));
    });

    test('refuses monitor commands with a missing device or option', async () => {
      await expect(api.sendMonitorCommand('', 'Start', 'work-1' as never)).rejects.toThrow('Invalid deviceId');
      await expect(api.sendMonitorCommand('dev-old', ' ', 'work-1' as never)).rejects.toThrow('Invalid cmdOpt');
      await expect(api.getMonitorResult('', 'work-1')).rejects.toThrow('Invalid device_id');
      await expect(api.getMonitorResult('dev-old', '')).rejects.toThrow('Invalid work_id');
    });

    test('returns the monitor data as bytes', async () => {
      fakeLg(() => ({ data: { lgedmRoot: { returnCd: '0000', workList: { returnCode: '0000', returnData: Buffer.from('state').toString('base64') } } } }));

      const result = await api.getMonitorResult('dev-old', 'work-1');

      expect(result?.toString()).toBe('state');
    });

    test('returns nothing while the monitor data is not ready', async () => {
      fakeLg(() => ({ data: { lgedmRoot: { returnCd: '0000', workList: { returnCode: '0000' } } } }));
      await expect(api.getMonitorResult('dev-old', 'work-1')).resolves.toBeNull();

      fakeLg(() => ({ data: { lgedmRoot: { returnCd: '0000' } } }));
      await expect(api.getMonitorResult('dev-old', 'work-1')).resolves.toBeNull();
    });

    test('reports a failed monitor result', async () => {
      fakeLg(() => ({ data: { lgedmRoot: { returnCd: '0000', workList: { returnCode: '0100' } } } }));

      await expect(api.getMonitorResult('dev-old', 'work-1')).rejects.toThrow(MonitorError);
    });

    test('reports a device that is not connected', async () => {
      fakeLg(() => ({ data: { lgedmRoot: { returnCd: '0106', returnMsg: 'not connected' } } }));

      await expect(api.sendMonitorCommand('dev-old', 'Start', 'work-1' as never)).rejects.toThrow(NotConnectedError);
    });
  });
});
