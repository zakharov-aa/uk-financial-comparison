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
    throw err;
  }
}

async function setCached(key, data) {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.CACHE_BUCKET_NAME,
    Key: `cache/${key}.json`,
    Body: JSON.stringify({ data, cachedAt: new Date().toISOString() }),
    ContentType: 'application/json',
  }));
}

module.exports = { getCached, setCached, isFresh };
