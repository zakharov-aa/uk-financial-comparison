const { buildExtractionPrompt, getAIAnalysis } = require('../services/gemini');
const { fetchExchangeRates } = require('../services/exchangeRates');

async function handleExtractFields(params) {
  const { prompt } = params;
  if (!prompt || prompt.trim() === '') {
    throw { statusCode: 400, message: 'prompt is required' };
  }

  const rawResponse = await getAIAnalysis(buildExtractionPrompt(prompt));

  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (e) {
    throw { statusCode: 422, message: 'extraction_failed' };
  }

  let { category, amount, amountCurrency, incomeEntries, situation } = parsed;

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

  return { category, amount, incomeEntries, situation };
}

module.exports = { handleExtractFields };
