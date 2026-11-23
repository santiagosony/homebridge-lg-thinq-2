/* eslint-disable dot-notation */
/* eslint-disable @typescript-eslint/no-require-imports */
import { Auth, authErrorCode, authErrorMessage, isSignInUnlockRequired, SIGN_IN_UNLOCK_MESSAGE } from './Auth.js';
import { Gateway } from './Gateway.js';
import { Session } from './Session.js';
import { Logger } from 'homebridge';
import { describe, test, beforeEach, expect, jest } from '@jest/globals';
import { AuthenticationError } from '../errors/index.js';

describe('Auth', () => {
  let auth: Auth;
  let mockGateway: Gateway;
  let mockLogger: Logger;

  beforeEach(() => {
    jest.restoreAllMocks();

    mockGateway = new Gateway({
      empTermsUri: 'https://example.com/emp',
      empSpxUri: 'https://example.com/spx',
      thinq2Uri: 'https://example.com/thinq2',
      thinq1Uri: 'https://example.com/thinq1',
      countryCode: 'US',
      languageCode: 'en-US',
    });

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as Logger;

    auth = new Auth(mockGateway, mockLogger);
  });

  test('should initialize with correct API URL', () => {
    expect(auth.lgeapi_url).toBe('https://us.lgeapi.com/');
  });

  test('can be constructed by JavaScript callers without a logger', () => {
    const authWithoutLogger = new Auth(mockGateway);

    expect(authWithoutLogger.lgeapi_url).toBe('https://us.lgeapi.com/');
    expect(() => authWithoutLogger.logger.debug('debug')).not.toThrow();
  });

  test('should generate default EMP headers', () => {
    const headers = auth.defaultEmpHeaders;
    expect(headers['X-Device-Country']).toBe('US');
    expect(headers['X-Device-Language']).toBe('en-US');
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded;charset=UTF-8');
  });

  test('should login and return a session', async () => {
    const mockSession = new Session('accessToken', 'refreshToken', Date.now() + 3600 * 1000);
    jest.spyOn(auth, 'loginStep2').mockResolvedValueOnce(mockSession);

    const session = await auth.login('testUser', 'testPassword');
    expect(session).toBe(mockSession);
    expect(auth.loginStep2).toHaveBeenCalledWith('testUser', expect.any(String));
  });

  test('extracts LG auth error details from response payloads', () => {
    const err = {
      response: {
        data: {
          error: {
            code: 'MS.001.03',
            message: 'Account already registered.',
          },
        },
      },
    };

    expect(authErrorCode(err)).toBe('MS.001.03');
    expect(authErrorMessage(err, 'fallback')).toBe('Account already registered.');
    expect(authErrorMessage(new Error('Network down'), 'fallback')).toBe('Network down');
    expect(authErrorMessage({ cause: new Error('Socket closed') }, 'fallback')).toBe('Socket closed');
    expect(authErrorMessage({}, 'fallback')).toBe('fallback');
  });

  test('should handle loginStep2 and return a session', async () => {
    const mockPreLoginResponse = {
      signature: 'mockSignature',
      tStamp: 'mockTimestamp',
      encrypted_pw: 'mockEncryptedPassword',
    };
    const mockAccountResponse = {
      account: {
        userIDType: 'EMP',
        country: 'US',
        userID: 'testUser',
        loginSessionID: 'session123',
      },
    };
    // Made-up base64 signature from LG's sign-in service.
    const mockSignature = 'c2lnbmF0dXJlLWZyb20tbGc=';
    const mockAuthorizeResponse = {
      status: 1,
      redirect_uri: 'https://example.com/oauth?code=mockCode',
    };
    const mockTokenResponse = {
      access_token: 'accessToken',
      refresh_token: 'refreshToken',
      expires_in: 3600,
      oauth2_backend_url: 'https://example.com/oauth',
    };

    jest.spyOn(auth['gateway'], 'emp_base_url', 'get').mockReturnValue('https://example.com/emp/');
    jest.spyOn(auth['gateway'], 'login_base_url', 'get').mockReturnValue('https://example.com/spx/');
    jest.spyOn(auth['gateway'], 'country_code', 'get').mockReturnValue('US');
    jest.spyOn(auth['gateway'], 'language_code', 'get').mockReturnValue('en-US');

    // jest.spyOn(auth['defaultEmpHeaders'], 'toString').mockReturnValueOnce('');

    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'post')
      .mockResolvedValueOnce({ data: mockPreLoginResponse }) // Mock preLogin response
      .mockResolvedValueOnce({ data: mockAccountResponse }) // Mock account response
      .mockResolvedValueOnce({ data: mockTokenResponse }); // Mock token response

    const getSpy = jest.spyOn(requestClient, 'get')
      .mockResolvedValueOnce({ data: `${mockSignature}\n` }) // Mock LG signature service response
      .mockResolvedValueOnce({ data: mockAuthorizeResponse }); // Mock authorize response

    const session = await auth.loginStep2('testUser', 'mockEncryptedPassword');

    // The EMP session request is signed by LG's sign-in service, not with a secret fetched by the client.
    const signatureUrl = new URL(getSpy.mock.calls[0][0] as string);
    expect(signatureUrl.origin + signatureUrl.pathname).toBe('https://example.com/spx/signature');
    expect(signatureUrl.searchParams.get('kind')).toBe('oauth2');
    expect(signatureUrl.searchParams.get('key_name')).toBe('OAUTH_SECRETKEY');
    expect(signatureUrl.searchParams.get('sever_type')).toBe('OP');
    expect(signatureUrl.searchParams.get('timestamp')).toMatch(/^\/emp\/oauth2\/authorize\/empsession\?.+\n.+ \+0000$/);
    const authorizeOptions = getSpy.mock.calls[1][1] as { headers: Record<string, string> };
    expect(authorizeOptions.headers['lgemp-x-signature']).toBe(mockSignature);
    expect(String(getSpy.mock.calls[1][0])).toContain('/emp/oauth2/authorize/empsession?');

    expect(session).toBeInstanceOf(Session);
    expect(session.accessToken).toBe('accessToken');
    expect(session.refreshToken).toBe('refreshToken');
    expect(session.hasValidToken()).toBe(true);
  });

  test('rejects a response from the LG signature service that is not a signature', async () => {
    jest.spyOn(auth['gateway'], 'login_base_url', 'get').mockReturnValue('https://example.com/spx/');
    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'get').mockResolvedValueOnce({ data: '<html><body>Service Unavailable</body></html>' });

    await expect(auth.requestEmpSignature('/emp/oauth2/authorize/empsession?a=1\nMon, 23 Nov 2026 00:00:00 GMT'))
      .rejects.toThrow('LG OAuth signature request failed: unexpected response from the LG sign-in service.');
  });

  test('reports a failed request to the LG signature service', async () => {
    jest.spyOn(auth['gateway'], 'login_base_url', 'get').mockReturnValue('https://example.com/spx/');
    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'get').mockRejectedValueOnce({ response: { status: 404, data: {} }, message: 'Request failed with status code 404' });

    await expect(auth.requestEmpSignature('message')).rejects.toThrow(AuthenticationError);
    await expect(auth.requestEmpSignature('message')).rejects.toThrow('LG OAuth signature request failed');
  });

  test('should refresh tokens using expires_in as a duration', async () => {
    const requestClient = require('./request').requestClient;
    const session = new Session('oldAccessToken', 'refreshToken', 0);

    jest.spyOn(requestClient, 'post')
      .mockResolvedValueOnce({ data: { lgedmRoot: { oauthUri: 'https://oauth.example.com' } } })
      .mockResolvedValueOnce({ data: { access_token: 'newAccessToken', expires_in: '3600' } });

    const refreshed = await auth.refreshNewToken(session);

    expect(refreshed).toBe(session);
    expect(refreshed.accessToken).toBe('newAccessToken');
    expect(refreshed.hasValidToken()).toBe(true);
  });

  test('should throw AuthenticationError for invalid login', async () => {
    const mockErrorResponse = {
      response: {
        data: {
          error: {
            code: 'MS.001.03',
            message: 'Account already registered.',
          },
        },
      },
    };
    const mockPreLoginResponse = {
      signature: 'mockSignature',
      tStamp: 'mockTimestamp',
      encrypted_pw: 'mockEncryptedPassword',
    };
    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'post')
      .mockResolvedValueOnce({ data: mockPreLoginResponse }) // Mock preLogin response
      .mockRejectedValueOnce(mockErrorResponse);

    await expect(auth.loginStep2('testUser', 'mockEncryptedPassword')).rejects.toThrow(AuthenticationError);
  });

  test('explains how to unlock an account when LG locks sign-in', async () => {
    // Made-up account, in the format LG uses: "Need Sign-In Unlock:<code>:<masked account id>:<flag>".
    const maskedAccount = 'tes*****@example.com';
    const lockedAccountResponse = {
      response: {
        status: 400,
        data: {
          error: {
            message: `Need Sign-In Unlock:420:${maskedAccount}:Y`,
          },
        },
      },
    };
    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'post')
      .mockResolvedValueOnce({ data: { signature: 'sig', tStamp: '1', encrypted_pw: 'pw' } }) // preLogin
      .mockRejectedValueOnce(lockedAccountResponse);

    const error = await auth.loginStep2('test@example.com', 'hash').catch(err => err);

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe(SIGN_IN_UNLOCK_MESSAGE);
    // The account identifier that LG sends must not reach the UI or the log.
    expect(error.message).not.toContain(maskedAccount);
    expect(error.message).not.toContain('@');
  });

  test('recognizes LG sign-in unlock messages by their prefix', () => {
    expect(isSignInUnlockRequired('Need Sign-In Unlock:420:tes*****@example.com:Y')).toBe(true);
    expect(isSignInUnlockRequired('Need Sign-In Unlock')).toBe(true);
    expect(isSignInUnlockRequired('need signin unlock:1:x:N')).toBe(true);
    expect(isSignInUnlockRequired('  Need Sign In Unlock: 420')).toBe(true);
  });

  test('does not treat other LG messages as a sign-in lock', () => {
    expect(isSignInUnlockRequired('Wrong User ID')).toBe(false);
    expect(isSignInUnlockRequired('Your account needs sign-in unlock soon')).toBe(false);
    expect(isSignInUnlockRequired('Need Sign-In Unlocked:420')).toBe(false);
    expect(isSignInUnlockRequired('')).toBe(false);
    expect(isSignInUnlockRequired(null)).toBe(false);
    expect(isSignInUnlockRequired(undefined)).toBe(false);
  });

  test('should wrap login request failures without response data', async () => {
    const mockPreLoginResponse = {
      signature: 'mockSignature',
      tStamp: 'mockTimestamp',
      encrypted_pw: 'mockEncryptedPassword',
    };
    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'post')
      .mockResolvedValueOnce({ data: mockPreLoginResponse })
      .mockRejectedValueOnce(new Error('Network down'));

    const promise = auth.loginStep2('testUser', 'mockEncryptedPassword');

    await expect(promise).rejects.toThrow(AuthenticationError);
    await expect(promise).rejects.toThrow('Network down');
  });

  test('should keep pre-login context when pre-login fails', async () => {
    const requestClient = require('./request').requestClient;
    jest.spyOn(requestClient, 'post')
      .mockRejectedValueOnce(new Error('Socket closed'));

    const promise = auth.loginStep2('testUser', 'mockEncryptedPassword');

    await expect(promise).rejects.toThrow(AuthenticationError);
    await expect(promise).rejects.toThrow('LG pre-login failed');
  });

});
