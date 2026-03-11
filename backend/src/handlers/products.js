const { fetchMortgageRates } = require('../services/boe');
const { fetchExchangeRates } = require('../services/exchangeRates');

const VALID_CATEGORIES = ['mortgages', 'savings', 'exchange-rates'];

async function handleProducts(category) {
  if (!VALID_CATEGORIES.includes(category)) {
    const err = new Error(`Unknown category: ${category}`);
    err.statusCode = 400;
    throw err;
  }

  let data;
  if (category === 'mortgages') {
    data = await fetchMortgageRates();
  } else if (category === 'exchange-rates') {
    data = await fetchExchangeRates();
  } else {
    // savings — use BoE base rate data as proxy
    data = await fetchMortgageRates();
  }

  return {
    data,
    meta: {
      category,
      cachedAt: data.cachedAt || new Date().toISOString(),
      stale: data.stale || false,
    },
  };
}

module.exports = { handleProducts };
