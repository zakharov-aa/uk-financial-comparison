const { handleProducts } = require('./handlers/products');
const { handleCompare } = require('./handlers/compare');
const { handleRecommendations } = require('./handlers/recommendations');
const { handleExtractFields } = require('./handlers/extractFields');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.path || '';

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    let response;

    if (method === 'GET' && path.startsWith('/products/')) {
      const category = path.split('/products/')[1];
      response = await handleProducts(category);
    } else if (method === 'POST' && path === '/compare') {
      const body = JSON.parse(event.body || '{}');
      response = await handleCompare(body);
    } else if (method === 'GET' && path === '/recommendations') {
      response = await handleRecommendations(event.queryStringParameters || {});
    } else if (method === 'GET' && path === '/extract-fields') {
      response = await handleExtractFields(event.queryStringParameters || {});
    } else {
      return {
        statusCode: 404,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Not found' }),
      };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(response),
    };
  } catch (err) {
    console.error('Unhandled error:', err);
    const statusCode = err.statusCode || (err.status >= 400 ? err.status : 500);
    const message = err.status === 429
      ? 'AI service quota exceeded. Please try again later.'
      : (err.statusCode ? err.message : 'Internal server error');
    return {
      statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: message }),
    };
  }
};
