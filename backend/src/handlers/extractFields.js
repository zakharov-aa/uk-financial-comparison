const { buildExtractionPrompt, getAIAnalysis } = require('../services/gemini');
const { fetchExchangeRates } = require('../services/exchangeRates');

async function handleExtractFields(params) {
  const { prompt } = params;
  if (!prompt || prompt.trim() === '') {
    throw { statusCode: 400, message: 'prompt is required' };
  }
  if (prompt.length > 1000) {
    throw { statusCode: 400, message: 'prompt too long' };
  }

  const rawResponse = await getAIAnalysis(buildExtractionPrompt(prompt));

  let parsed;
  try {
    const cleaned = rawResponse.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw { statusCode: 422, message: 'extraction_failed' };
  }

  let { category, amount, amountCurrency, incomeEntries, situation } = parsed;

  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    throw { statusCode: 422, message: 'extraction_failed' };
  }

  if (!amountCurrency) amountCurrency = 'GBP';

  if (amountCurrency !== 'GBP') {
    const fxData = await fetchExchangeRates();
    const rate = fxData.rates[amountCurrency];
    if (rate === undefined) {
      throw { statusCode: 422, message: 'extraction_failed' };
    }
    amount = amount / rate;
  }

  if (!Array.isArray(incomeEntries)) incomeEntries = [];
  // incomeEntries are forwarded with their original currencies;
  // handleRecommendations performs the GBP conversion for income.

  return { category, amount, incomeEntries, situation };
}

module.exports = { handleExtractFields };
