const { mockClient } = require('aws-sdk-client-mock');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getCached, setCached, isFresh } = require('../../src/services/cache');

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
  process.env.CACHE_BUCKET_NAME = 'test-bucket';
});

describe('isFresh', () => {
  test('returns true when cachedAt is within TTL', () => {
    const now = Date.now();
    const cachedAt = new Date(now - 30 * 60 * 1000).toISOString(); // 30 min ago
    expect(isFresh(cachedAt, 3600)).toBe(true); // 1hr TTL
  });

  test('returns false when cachedAt is past TTL', () => {
    const now = Date.now();
    const cachedAt = new Date(now - 2 * 60 * 60 * 1000).toISOString(); // 2hr ago
    expect(isFresh(cachedAt, 3600)).toBe(false); // 1hr TTL
  });
});

describe('getCached', () => {
  test('returns parsed data when cache hit', async () => {
    const cachedData = { data: { rate: 4.5 }, cachedAt: new Date().toISOString() };
    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => JSON.stringify(cachedData) },
    });

    const result = await getCached('boe/mortgage-rates');
    expect(result).toEqual(cachedData);
  });

  test('returns null on cache miss', async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: 'NoSuchKey' });
    const result = await getCached('boe/mortgage-rates');
    expect(result).toBeNull();
  });

  test('returns null on unexpected S3 error (treats as cache miss)', async () => {
    s3Mock.on(GetObjectCommand).rejects({ name: 'AccessDenied', message: 'Access denied' });
    const result = await getCached('boe/mortgage-rates');
    expect(result).toBeNull();
  });
});

describe('setCached', () => {
  test('writes JSON with cachedAt timestamp to S3', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await setCached('boe/mortgage-rates', { rate: 4.5 });

    const putCall = s3Mock.commandCalls(PutObjectCommand)[0];
    const body = JSON.parse(putCall.args[0].input.Body);
    expect(body.data).toEqual({ rate: 4.5 });
    expect(body.cachedAt).toBeDefined();
  });
});
