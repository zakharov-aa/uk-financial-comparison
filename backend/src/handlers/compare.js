const { fetchMortgageRates } = require('../services/boe');
const { fetchExchangeRates } = require('../services/exchangeRates');
const { buildMortgagePrompt, getAIAnalysis } = require('../services/gemini');

function calculateMonthlyPayment(principal, annualRate, years = 25) {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

async function handleCompare({ category, criteria = {} }) {
  if (!category) {
    const err = new Error('category is required');
    err.statusCode = 400;
    throw err;
  }

  const amount = criteria.amount || 0;

  if (category === 'mortgages') {
    const rateData = await fetchMortgageRates();
    const { current } = rateData;

    const comparison = [
      { label: '2-Year Fixed', rate: current.twoYear, term: 2 },
      { label: '3-Year Fixed', rate: current.threeYear, term: 3 },
      { label: '5-Year Fixed', rate: current.fiveYear, term: 5 },
    ].map(option => ({
      ...option,
      monthlyPayment: amount ? Math.round(calculateMonthlyPayment(amount, option.rate)) : null,
      totalCost: amount ? Math.round(calculateMonthlyPayment(amount, option.rate) * 300) : null,
    }));

    const prompt = buildMortgagePrompt(rateData, amount, JSON.stringify(criteria));
    const aiSummary = await getAIAnalysis(prompt);

    return { comparison, aiSummary, meta: { category, criteria } };
  }

  const rateData = await fetchExchangeRates();
  return {
    comparison: Object.entries(rateData.rates).map(([currency, rate]) => ({
      label: `GBP/${currency}`, rate, currency,
    })),
    aiSummary: null,
    meta: { category, criteria },
  };
}

module.exports = { handleCompare };
