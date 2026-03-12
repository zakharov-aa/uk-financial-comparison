const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { parseBoeCSV, normalizeMortgageRates, fetchMortgageRates } = require('../../src/services/boe');

const s3Mock = mockClient(S3Client);

const SAMPLE_CSV = `Date,IUMBV34,IUMBV37,IUMBV42
2024-01-31,4.56,4.52,4.48
2024-02-29,4.61,4.57,4.53
2024-03-31,4.58,4.54,4.50`;

beforeEach(() => {
  s3Mock.reset();
  process.env.CACHE_BUCKET_NAME = 'test-bucket';
  global.fetch = undefined;
});

describe('parseBoeCSV', () => {
  test('parses CSV into array of objects', async () => {
    const result = await parseBoeCSV(SAMPLE_CSV);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      date: '2024-01-31',
      twoYear: 4.56,
      threeYear: 4.52,
      fiveYear: 4.48,
    });
  });

  test('filters out rows with missing twoYear value', async () => {
    const csvWithMissing = `Date,IUMBV34,IUMBV37,IUMBV42\n2024-01-31,,4.52,4.48\n2024-02-29,4.61,4.57,4.53`;
    const result = await parseBoeCSV(csvWithMissing);
    expect(result).toHaveLength(1);
    expect(result[0].twoYear).toBe(4.61);
  });
});

describe('normalizeMortgageRates', () => {
  test('returns current rates as latest entry', async () => {
    const parsed = await parseBoeCSV(SAMPLE_CSV);
    const result = normalizeMortgageRates(parsed);
    expect(result.current).toMatchObject({
      twoYear: 4.58,
      threeYear: 4.54,
      fiveYear: 4.50,
    });
    expect(result.history).toHaveLength(3);
  });
});

describe('fetchMortgageRates', () => {
  test('returns fresh cached data without calling API', async () => {
    const cachedData = {
      data: { current: { twoYear: 4.5 }, history: [] },
      cachedAt: new Date().toISOString(),
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(cachedData) },
    });

    const result = await fetchMortgageRates();
    expect(result.current.twoYear).toBe(4.5);
    expect(result.stale).toBe(false);
  });

  test('fetches from API when cache is stale and caches result', async () => {
    const staleData = {
      data: { current: { twoYear: 4.0 }, history: [] },
      cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25hr ago
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(staleData) },
    });
    s3Mock.on(PutObjectCommand).resolves({});

    global.fetch = jest.fn().mockResolvedValue({
      text: async () => SAMPLE_CSV,
    });

    const result = await fetchMortgageRates();
    expect(result.current.twoYear).toBe(4.58);
    expect(result.stale).toBe(false);
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(1);
  });

  test('returns stale cached data when API fails', async () => {
    const staleData = {
      data: { current: { twoYear: 4.0 }, history: [] },
      cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(staleData) },
    });

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchMortgageRates();
    expect(result.current.twoYear).toBe(4.0);
    expect(result.stale).toBe(true);
  });

  test('throws when cache miss and API fails', async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    await expect(fetchMortgageRates()).rejects.toThrow('Network error');
  });

  test('calls fetch with an abort signal for timeout protection', async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });
    s3Mock.on(PutObjectCommand).resolves({});
    global.fetch = jest.fn().mockResolvedValue({ text: async () => SAMPLE_CSV });
    await fetchMortgageRates();
    const [, options] = global.fetch.mock.calls[0];
    expect(options?.signal).toBeDefined();
  });

  test('returns stale data when fetch is aborted and cache is available', async () => {
    const staleData = {
      data: { current: { twoYear: 4.0 }, history: [] },
      cachedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(staleData) },
    });
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);
    const result = await fetchMortgageRates();
    expect(result.stale).toBe(true);
    expect(result.current.twoYear).toBe(4.0);
  });

  test('throws when fetch is aborted and no cache available', async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError);
    await expect(fetchMortgageRates()).rejects.toThrow('The operation was aborted');
  });
});
