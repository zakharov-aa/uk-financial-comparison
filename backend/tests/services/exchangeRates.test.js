const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { normalizeRates, fetchExchangeRates } = require('../../src/services/exchangeRates');

const s3Mock = mockClient(S3Client);

const SAMPLE_API_RESPONSE = {
  success: true,
  base: 'GBP',
  date: '2026-03-11',
  rates: { USD: 1.27, EUR: 1.18, JPY: 190.5 },
};

beforeEach(() => {
  s3Mock.reset();
  process.env.CACHE_BUCKET_NAME = 'test-bucket';
  process.env.EXCHANGE_RATES_API_KEY = 'test-key';
  global.fetch = undefined;
});

describe('normalizeRates', () => {
  test('extracts GBP rates for USD, EUR, JPY', () => {
    const result = normalizeRates(SAMPLE_API_RESPONSE);
    expect(result).toMatchObject({
      base: 'GBP',
      date: '2026-03-11',
      rates: { USD: 1.27, EUR: 1.18, JPY: 190.5 },
    });
  });

  test('handles missing currency gracefully', () => {
    const result = normalizeRates({ ...SAMPLE_API_RESPONSE, rates: { USD: 1.27 } });
    expect(result.rates.EUR).toBeUndefined();
  });
});

describe('fetchExchangeRates', () => {
  test('returns fresh cached data without calling API', async () => {
    const cachedData = {
      data: { base: 'GBP', date: '2026-03-11', rates: { USD: 1.27 } },
      cachedAt: new Date().toISOString(),
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(cachedData) },
    });

    const result = await fetchExchangeRates();
    expect(result.base).toBe('GBP');
    expect(result.stale).toBe(false);
  });

  test('fetches from API when cache is stale', async () => {
    const staleData = {
      data: { base: 'GBP', rates: { USD: 1.20 } },
      cachedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), // 7hr ago
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(staleData) },
    });
    s3Mock.on(PutObjectCommand).resolves({});

    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        quotes: { GBPUSD: 1.27, GBPEUR: 1.18, GBPJPY: 190.5 },
        date: '2026-03-11',
      }),
    });

    const result = await fetchExchangeRates();
    expect(result.rates.USD).toBe(1.27);
    expect(result.stale).toBe(false);
  });

  test('returns stale cached data when API fails', async () => {
    const staleData = {
      data: { base: 'GBP', rates: { USD: 1.20 } },
      cachedAt: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(staleData) },
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchExchangeRates();
    expect(result.stale).toBe(true);
  });

  test('throws when cache miss and API fails', async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(fetchExchangeRates()).rejects.toThrow('Network error');
  });
});
