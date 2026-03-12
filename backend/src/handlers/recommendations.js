const { fetchMortgageRates } = require('../services/boe');
const { fetchExchangeRates } = require('../services/exchangeRates');
const { buildMortgagePrompt, buildSavingsPrompt, getAIAnalysis } = require('../services/gemini');
const { buildBasicRecommendation } = require('../services/basicRecommendation');

async function handleRecommendations({ category = 'mortgages', amount, situation = '', annualIncome, bankAmount, useAI = 'true' }) {
  const parsedAmount = parseInt(amount, 10) || 0;
  const parsedIncome = Math.max(0, parseFloat(annualIncome) || 0);
  const parsedBank = Math.max(0, parseFloat(bankAmount) || 0);

  if (category === 'exchange-rates') {
    const rateData = await fetchExchangeRates();
    const prompt = buildSavingsPrompt(rateData, parsedAmount);
    const recommendation = await getAIAnalysis(prompt);
    return {
      recommendation,
      currentRates: rateData,
      generatedAt: new Date().toISOString(),
      category,
      aiUsed: true,
    };
  }

  const rateData = await fetchMortgageRates();
  const aiRequested = useAI !== 'false';

  let recommendation;
  if (!aiRequested) {
    recommendation = buildBasicRecommendation(rateData, parsedAmount, parsedIncome, parsedBank);
  } else {
    const prompt = buildMortgagePrompt(rateData, parsedAmount, situation, parsedIncome, parsedBank);
    recommendation = await getAIAnalysis(prompt);
  }

  return {
    recommendation,
    currentRates: rateData.current,
    generatedAt: new Date().toISOString(),
    category,
    aiUsed: aiRequested,
  };
}

module.exports = { handleRecommendations };
