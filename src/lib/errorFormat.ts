import axios from 'axios';
import { types } from 'node:util';

const MAX_CAUSE_DEPTH = 3;

type DescribeOptions = {
  /** Include the stack trace of the error and its causes. Stack traces hold no request data. */
  stack?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

function urlWithoutQuery(url: string | undefined, baseURL: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url, baseURL);
    return parsed.origin + parsed.pathname;
  } catch {
    return url.split('?')[0];
  }
}

function lgResponseDetails(data: unknown): string[] {
  if (!isRecord(data)) {
    return [];
  }
  const error = isRecord(data.error) ? data.error : undefined;
  const details: string[] = [];
  const resultCode = stringValue(data.resultCode) ?? stringValue(error?.code);
  const message = stringValue(error?.message)
    ?? stringValue(data.message)
    ?? stringValue(data.error_description)
    ?? stringValue(data.returnMsg);
  if (resultCode) {
    details.push('LG code ' + resultCode);
  }
  if (message) {
    details.push('LG message "' + message + '"');
  }
  return details;
}

// Also true for errors made in another JavaScript realm (for example Node.js errors
// seen from a vm context, as in Jest), where `instanceof Error` is false.
function isError(value: unknown): value is Error {
  return value instanceof Error || types.isNativeError(value);
}

// The plugin's own error classes do not set `name`, so fall back to the class name.
function errorName(err: Error): string {
  return err.name !== 'Error' ? err.name : (err.constructor?.name || 'Error');
}

function describeOne(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const details: string[] = [];
    if (err.response?.status) {
      details.push('HTTP ' + err.response.status);
    }
    if (err.code) {
      details.push(err.code);
    }
    details.push(...lgResponseDetails(err.response?.data));
    const url = urlWithoutQuery(err.config?.url, err.config?.baseURL);
    if (url) {
      details.push((err.config?.method ?? 'get').toUpperCase() + ' ' + url);
    }
    return `${err.name}: ${err.message}` + (details.length ? ` (${details.join(', ')})` : '');
  }

  if (isError(err)) {
    return `${errorName(err)}: ${err.message}`;
  }

  if (typeof err === 'string') {
    return err;
  }

  return 'Non-error value: ' + Object.prototype.toString.call(err);
}

/**
 * Describes an error for logging, without the data of the request that failed.
 *
 * axios errors carry the whole request configuration: headers with the LG access
 * token, and bodies with the refresh token or the password hash. Logging the error
 * object (or an error whose `cause` is one) prints all of that, and users share
 * Homebridge logs in public issues. Log this description instead.
 */
export function describeError(err: unknown, options: DescribeOptions = {}): string {
  const lines: string[] = [];
  let current: unknown = err;

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth++) {
    const prefix = depth === 0 ? '' : 'Caused by: ';
    lines.push(prefix + describeOne(current));

    if (options.stack && isError(current) && current.stack) {
      const frames = current.stack.split('\n').filter(line => line.trimStart().startsWith('at '));
      lines.push(...frames);
    }

    current = isError(current) ? (current as Error & { cause?: unknown }).cause : undefined;
  }

  return lines.join('\n');
}
