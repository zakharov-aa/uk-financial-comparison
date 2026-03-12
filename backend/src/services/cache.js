const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({});

function isFresh(cachedAt, ttlSeconds) {
  const age = (Date.now() - new Date(cachedAt).getTime()) / 1000;
  return age < ttlSeconds;
}

async function getCached(key) {
  try {
    const result = await s3.send(new GetObjectCommand({
      Bucket: process.env.CACHE_BUCKET_NAME,
      Key: `cache/${key}.json`,
    }));
    const body = await result.Body.transformToString();
    return JSON.parse(body);
  } catch (err) {
    if (err.name === 'NoSuchKey') return null;
    console.warn('Cache read failed (treating as miss):', err.message);
    return null;
  }
}

async function setCached(key, data) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.CACHE_BUCKET_NAME,
      Key: `cache/${key}.json`,
      Body: JSON.stringify({ data, cachedAt: new Date().toISOString() }),
      ContentType: 'application/json',
    }));
  } catch (err) {
    console.warn('Cache write failed (continuing without cache):', err.message);
  }
}

module.exports = { getCached, setCached, isFresh };
