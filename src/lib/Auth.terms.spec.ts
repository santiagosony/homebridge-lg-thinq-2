import { afterEach, describe, expect, test } from '@jest/globals';
import type { InternalAxiosRequestConfig } from 'axios';
import { Auth } from './Auth.js';
import { Gateway } from './Gateway.js';
import { requestClient } from './request.js';

const originalAdapter = requestClient.defaults.adapter;

function gatewayFor(countryCode: string, languageCode: string) {
  return new Gateway({
    empTermsUri: 'https://emp.example.com',
    empSpxUri: 'https://spx.example.com/spx',
    thinq2Uri: 'https://thinq2.example.com/v1',
    thinq1Uri: 'https://thinq1.example.com/api',
    countryCode,
    languageCode,
  });
}

// Answers the LG terms endpoints and records every request.
function fakeLgTerms(acceptedIds: string[], availableTerms: { termsType: string, termsID: string, defaultLang: string }[]) {
  const requests: { method?: string, url: string, data?: unknown }[] = [];
  requestClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(config.url ?? '');
    requests.push({ method: config.method, url: url.href, data: config.data });
    const respond = (data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config });

    if (url.pathname.endsWith('/common/showTerms')) {
      return respond('<script>var signature : "sig"; var tStamp : "123";</script>');
    }
    if (url.pathname === '/emp/v2.0/account/user/terms' && config.method === 'get') {
      return respond({ account: { terms: acceptedIds.map(termsID => ({ termsID })) } });
    }
    if (url.pathname === '/emp/v2.0/info/terms') {
      return respond({ info: { terms: availableTerms } });
    }
    return respond({});
  };
  return requests;
}

describe('Auth.handleNewTerm', () => {
  afterEach(() => {
    requestClient.defaults.adapter = originalAdapter;
  });

  test('loads the terms of the account country and language, and returns the accepted terms', async () => {
    const requests = fakeLgTerms(['T1'], [
      { termsType: 'A', termsID: 'T1', defaultLang: 'es' },
      { termsType: 'B', termsID: 'T2', defaultLang: 'es' },
    ]);

    const accepted = await new Auth(gatewayFor('ES', 'es-ES')).handleNewTerm('access-token');

    expect(accepted).toEqual(['B:T2:es']);
    const showTerms = new URL(requests[0].url);
    expect(showTerms.searchParams.get('country')).toBe('ES');
    expect(showTerms.searchParams.get('language')).toBe('es-ES');
    const update = requests.find(request => request.method === 'post');
    expect(update?.data).toBe('terms=B%3AT2%3Aes');
  });

  test('accepts nothing when every term is already accepted', async () => {
    const requests = fakeLgTerms(['T1'], [{ termsType: 'A', termsID: 'T1', defaultLang: 'en' }]);

    const accepted = await new Auth(gatewayFor('US', 'en-US')).handleNewTerm('access-token');

    expect(accepted).toEqual([]);
    expect(requests.some(request => request.method === 'post')).toBe(false);
  });
});
