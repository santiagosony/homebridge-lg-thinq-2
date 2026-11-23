import axios, { AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import {
  ManualProcessNeeded,
  ManualProcessNeededErrorCode,
  MonitorError,
  NotConnectedError,
  TokenExpiredErrorCode,
  TokenExpiredError,
  NotConnectedErrorCodes,
} from '../errors/index.js';

const MAX_REQUESTS_COUNT = 1;
const INTERVAL_MS = 10;
let PENDING_REQUESTS = 0;

const releaseRequestSlot = () => {
  PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function responseErrorMessage(err: any, fallback: string): string {
  return stringValue(err.response?.data?.error?.message)
    || stringValue(err.response?.data?.message)
    || stringValue(err.response?.data?.returnMsg)
    || stringValue(err.message)
    || fallback;
}

function errorWithCause<T extends Error>(error: T, cause: unknown): T {
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

/**
 * User-Agent sent with every request unless the caller sets its own.
 *
 * LG's account servers reject requests that identify as axios (the default
 * "axios/<version>" User-Agent) with HTTP 403, for example on POST /spx/preLogin,
 * which made login fail. A browser User-Agent is accepted.
 * See nVuln/homebridge-lg-thinq#402 and nVuln/homebridge-lg-thinq#400.
 */
export const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36 Edg/93.0.961.44';

const client = axios.create({
  headers: {
    'User-Agent': BROWSER_USER_AGENT,
  },
});
client.defaults.timeout = 60000; // 60s timeout

client.interceptors.request.use((config) => {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (PENDING_REQUESTS < MAX_REQUESTS_COUNT) {
        PENDING_REQUESTS++;
        clearInterval(interval);
        resolve(config);
      }
    }, INTERVAL_MS);
  });
});

client.interceptors.response.use((response) => {
  releaseRequestSlot();
  return response;
}, (err) => {
  releaseRequestSlot();
  return Promise.reject(err);
});

/**
 * Retries of failed requests: up to 2 more tries, after 2 and then 4 seconds, when
 * the connection failed or the server answered with a server error (HTTP 500-504).
 * Each try gets the full timeout. The delay can be changed by tests.
 */
export const requestRetry = {
  retries: 2,
  delayMs: (retryCount: number) => retryCount * 2000,
};

const RETRY_STATUSES = new Set([500, 501, 502, 503, 504]);

export function isRetryableRequestError(err: any): boolean {
  if (typeof err?.code === 'string' && err.code.startsWith('ECONN')) {
    return true;
  }
  return err?.response !== undefined && RETRY_STATUSES.has(err.response.status);
}

type RetryRequestConfig = InternalAxiosRequestConfig & { lgRetryCount?: number };

client.interceptors.response.use(undefined, async (err) => {
  const config = err?.config as RetryRequestConfig | undefined;
  if (!config || !isRetryableRequestError(err)) {
    throw err;
  }
  const retryCount = (config.lgRetryCount ?? 0) + 1;
  if (retryCount > requestRetry.retries) {
    throw err;
  }
  config.lgRetryCount = retryCount;
  await new Promise(resolve => setTimeout(resolve, requestRetry.delayMs(retryCount)));
  return client.request(config);
});

client.interceptors.response.use((response) => {
  // thinq1 response
  if (typeof response.data === 'object' && 'lgedmRoot' in response.data && 'returnCd' in response.data.lgedmRoot) {
    const data = response.data.lgedmRoot;
    const code = data.returnCd as string;
    if (NotConnectedErrorCodes.includes(code)) {
      throw new NotConnectedError(data.returnMsg || '');
    } else if (code === TokenExpiredErrorCode) {
      throw new TokenExpiredError(data.returnMsg);
    } else if (code !== '0000') {
      throw new MonitorError(data.returnMsg ? code + ' - ' + data.returnMsg : code);
    }
  }

  return response;
}, (err) => {
  // Errors of a retried request were already translated when that request failed.
  if (err instanceof NotConnectedError || err instanceof TokenExpiredError
    || err instanceof ManualProcessNeeded || err instanceof MonitorError) {
    throw err;
  }
  if (!err.response) {
    throw errorWithCause(new NotConnectedError(responseErrorMessage(err, 'Network request failed.')), err);
  } else if (err.response.data?.resultCode === '9999') {
    throw errorWithCause(new NotConnectedError(responseErrorMessage(err, 'ThinQ service is not connected.')), err);
  } else if (err.response.data?.resultCode === TokenExpiredErrorCode) {
    throw errorWithCause(new TokenExpiredError(responseErrorMessage(err, 'ThinQ token expired.')), err);
  } else if (err.response.data?.resultCode === ManualProcessNeededErrorCode) {
    throw errorWithCause(
      new ManualProcessNeeded('Please open the native LG App and sign in to your account to see what happened, ' +
        'maybe new agreement need your accept. Then try restarting Homebridge.'),
      err,
    );
  }
  return Promise.reject(err);
});

export const requestClient = client as AxiosInstance;
