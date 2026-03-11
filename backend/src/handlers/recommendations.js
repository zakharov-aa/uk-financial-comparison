const { fetchMortgageRates } = require('../services/boe');
const { fetchExchangeRates } = require('../services/exchangeRates');
const { buildMortgagePrompt, buildSavingsPrompt, getAIAnalysis } = require('../services/gemini');

async function handleRecommendations({ category = 'mortgages', amount, situation = '' }) {
  const parsedAmount = parseInt(amount, 10) || 0;

  if (category === 'exchange-rates') {
    const rateData = await fetchExchangeRates();
    const prompt = buildSavingsPrompt(rateData, parsedAmount);
    const recommendation = await getAIAnalysis(prompt);
    return {
      recommendation,
      currentRates: rateData,
      generatedAt: new Date().toISOString(),
      category,
    };
  }

  // mortgages (default) and savings both use BoE rate data
  const rateData = await fetchMortgageRates();
  const prompt = buildMortgagePrompt(rateData, parsedAmount, situation);
  const recommendation = await getAIAnalysis(prompt);

  return {
    recommendation,
    currentRates: rateData.current,
    generatedAt: new Date().toISOString(),
    category,
  };
}

module.exports = { handleRecommendations };
