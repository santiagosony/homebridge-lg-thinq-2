import { describe, expect, test } from '@jest/globals';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { NotConnectedError } from '../errors/index.js';
import { describeError } from './errorFormat.js';

const SECRETS = ['refresh-token-secret', 'access-token-secret', 'password-hash-secret', 'signed-query-secret'];

function axiosErrorWithSecrets(status = 401): AxiosError {
  const config = {
    method: 'post',
    url: 'https://us.lgeapi.com/oauth/1.0/oauth2/token?sig=signed-query-secret',
    headers: new AxiosHeaders({ 'x-emp-token': 'access-token-secret' }),
    data: 'grant_type=refresh_token&refresh_token=refresh-token-secret&user_auth2=password-hash-secret',
  } as InternalAxiosRequestConfig;
  return new AxiosError('Request failed with status code ' + status, 'ERR_BAD_REQUEST', config, {}, {
    status,
    statusText: 'Unauthorized',
    headers: {},
    config,
    data: { error: { code: 'LG.0001', message: 'Invalid token' } },
  });
}

describe('describeError', () => {
  test('describes axios errors without request headers, body or query string', () => {
    const description = describeError(axiosErrorWithSecrets(), { stack: true });

    expect(description).toContain('AxiosError: Request failed with status code 401');
    expect(description).toContain('HTTP 401');
    expect(description).toContain('LG code LG.0001');
    expect(description).toContain('LG message "Invalid token"');
    expect(description).toContain('POST https://us.lgeapi.com/oauth/1.0/oauth2/token');
    for (const secret of SECRETS) {
      expect(description).not.toContain(secret);
    }
  });

  test('describes the cause chain without leaking the axios cause', () => {
    const error = new NotConnectedError('Network request failed.');
    (error as Error & { cause?: unknown }).cause = axiosErrorWithSecrets(503);

    const description = describeError(error);

    expect(description).toBe([
      'NotConnectedError: Network request failed.',
      'Caused by: AxiosError: Request failed with status code 503 (HTTP 503, ERR_BAD_REQUEST, LG code LG.0001, '
        + 'LG message "Invalid token", POST https://us.lgeapi.com/oauth/1.0/oauth2/token)',
    ].join('\n'));
  });

  test('adds stack frames only when asked', () => {
    const error = new Error('boom');

    expect(describeError(error)).toBe('Error: boom');
    expect(describeError(error, { stack: true })).toMatch(/^Error: boom\n\s+at /);
  });

  test('handles values that are not errors', () => {
    expect(describeError('plain message')).toBe('plain message');
    expect(describeError({ token: 'access-token-secret' })).toBe('Non-error value: [object Object]');
    expect(describeError(undefined)).toBe('');
  });
});
