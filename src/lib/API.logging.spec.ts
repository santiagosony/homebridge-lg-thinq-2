import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { format } from 'node:util';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { Logger } from 'homebridge';
import { API } from './API.js';
import { Auth } from './Auth.js';
import { Gateway } from './Gateway.js';
import { requestClient } from './request.js';
import { TokenExpiredError } from '../errors/index.js';

const REFRESH_TOKEN = 'refresh-token-that-must-not-be-logged';
const originalAdapter = requestClient.defaults.adapter;

describe('API logging', () => {
  afterEach(() => {
    requestClient.defaults.adapter = originalAdapter;
    jest.restoreAllMocks();
  });

  test('does not log the refresh token when refreshing the access token fails', async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(format(...args));
    };
    const logger = { error: capture, warn: capture, info: capture, debug: capture } as unknown as Logger;

    // Every request fails like an LG error response. The error carries the request
    // configuration, including the body with the refresh token.
    requestClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config, undefined, {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: { error: { code: 'LG.0400', message: 'invalid refresh token' } },
      });
    };

    const gateway = new Gateway({
      empTermsUri: 'https://emp.example.com',
      empSpxUri: 'https://spx.example.com/spx',
      thinq2Uri: 'https://thinq2.example.com/v1',
      thinq1Uri: 'https://thinq1.example.com/api',
      countryCode: 'US',
      languageCode: 'en-US',
    });
    const api = new API('US', 'en-US', logger);
    Object.assign(api as unknown as Record<string, unknown>, { _gateway: gateway, auth: new Auth(gateway, logger) });
    api.setRefreshToken(REFRESH_TOKEN);
    // The first API call finds the access token expired, so the client refreshes it.
    jest.spyOn(api.httpClient, 'request').mockRejectedValueOnce(new TokenExpiredError('expired'));

    await expect(api.getRequest('service/homes')).resolves.toEqual({});

    const refreshError = lines.find(line => line.startsWith('refresh new token error'));
    expect(refreshError).toContain('HTTP 400');
    expect(refreshError).toContain('invalid refresh token');
    expect(lines.join('\n')).not.toContain(REFRESH_TOKEN);
  });
});
