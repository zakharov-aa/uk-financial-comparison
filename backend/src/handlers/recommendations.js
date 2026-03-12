const { fetchMortgageRates } = require('../services/boe');
const { fetchExchangeRates } = require('../services/exchangeRates');
const { buildMortgagePrompt, getAIAnalysis } = require('../services/gemini');
const { buildBasicRecommendation } = require('../services/basicRecommendation');

function parseIncomeEntries(raw) {
  try {
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries.map(e => ({
      amount: Math.max(0, parseFloat(e.amount) || 0),
      currency: (typeof e.currency === 'string' && e.currency) ? e.currency : 'GBP',
    }));
  } catch {
    return [];
  }
}

function needsConversion(entries, bankAmount, bankCurrency) {
  return (bankAmount > 0 && bankCurrency !== 'GBP')
    || entries.some(e => e.amount > 0 && e.currency !== 'GBP');
}

function convertToGBP(amount, currency, rates) {
  if (currency === 'GBP') return amount;
  return amount / rates[currency];
}

function totalIncomeGBP(entries, rates) {
  return entries
    .filter(e => e.amount > 0)
    .reduce((sum, e) => sum + convertToGBP(e.amount, e.currency, rates), 0);
}

async function handleRecommendations({
  category = 'mortgages',
  amount,
  situation = '',
  incomeEntries = '[]',
  bankAmount,
  bankAmountCurrency = 'GBP',
  useAI = 'true',
}) {
  const parsedAmount = parseInt(amount, 10) || 0;
  const entries = parseIncomeEntries(incomeEntries);
  let parsedBank = Math.max(0, parseFloat(bankAmount) || 0);
  const parsedBankCurrency = bankAmountCurrency || 'GBP';

  let parsedIncome;
  if (needsConversion(entries, parsedBank, parsedBankCurrency)) {
    const fxData = await fetchExchangeRates();
    const rates = fxData.rates;
    parsedIncome = totalIncomeGBP(entries, rates);
    parsedBank = convertToGBP(parsedBank, parsedBankCurrency, rates);
  } else {
    parsedIncome = entries
      .filter(e => e.amount > 0)
      .reduce((sum, e) => sum + e.amount, 0);
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
