const { getCached, setCached, isFresh } = require('./cache');

const EXCHANGE_TTL = 6 * 60 * 60; // 6 hours
const CURRENCIES = ['USD', 'EUR', 'JPY'];

function normalizeRates(apiResponse) {
  const { base, date, rates } = apiResponse;
  const filtered = {};
  CURRENCIES.forEach(c => { if (rates[c]) filtered[c] = rates[c]; });
  return { base, date, rates: filtered };
}

async function fetchExchangeRates() {
  const cacheKey = 'exchange-rates/gbp-rates';
  const cached = await getCached(cacheKey);

  if (cached && isFresh(cached.cachedAt, EXCHANGE_TTL)) {
    return { ...cached.data, stale: false };
  }

  try {
    const apiKey = process.env.EXCHANGE_RATES_API_KEY;
    const url = `https://api.exchangerate.host/live?access_key=${apiKey}&source=GBP&currencies=USD,EUR,JPY`;
    const response = await fetch(url);
    const json = await response.json();

    // exchangerate.host returns rates as GBPUSD, GBPEUR etc.
    const normalized = normalizeRates({
      base: 'GBP',
      date: json.date || new Date().toISOString().split('T')[0],
      rates: {
        USD: json.quotes?.GBPUSD,
        EUR: json.quotes?.GBPEUR,
        JPY: json.quotes?.GBPJPY,
      },
    });

    await setCached(cacheKey, normalized);
    return { ...normalized, stale: false };
  } catch (err) {
    console.error('Exchange Rates API error:', err.message);
    if (cached) return { ...cached.data, stale: true };
    throw err;
  }
}

module.exports = { normalizeRates, fetchExchangeRates };
