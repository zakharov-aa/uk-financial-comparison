const { GoogleGenerativeAI } = require('@google/generative-ai');

function buildMortgagePrompt(rateData, amount, situation, annualIncome = 0, bankAmount = 0) {
  const { current, history } = rateData;
  const recentHistory = (history || []).slice(-6).map(h =>
    `${h.date}: 2yr=${h.twoYear}%, 5yr=${h.fiveYear}%`
  ).join('\n');

  return `You are a UK mortgage advisor. Analyze current market conditions and provide a recommendation.

CURRENT UK MORTGAGE RATES (Bank of England data):
- 2-year fixed: ${current.twoYear}%
- 3-year fixed: ${current.threeYear}%
- 5-year fixed: ${current.fiveYear}%

RECENT RATE HISTORY (last 6 months):
${recentHistory}

USER SITUATION:
- Loan amount: £${amount?.toLocaleString('en-GB')}
- Financial profile: ${situation}
${annualIncome > 0 ? `- Annual income after taxes: £${annualIncome.toLocaleString('en-GB')}\n` : ''}${bankAmount > 0 ? `- Current savings / bank balance: £${bankAmount.toLocaleString('en-GB')}\n` : ''}
Please provide:
1. A clear recommendation (fix or variable, which term)
2. Key factors that support this recommendation
3. Main risks to consider
4. A plain-English summary (2-3 sentences)

Be specific and practical. Base your answer on the actual rate data provided.`;
}

function buildExtractionPrompt(text) {
  return `You are a financial data extractor. Extract structured data from the following user description and return ONLY a valid JSON object — no markdown, no code fences, no explanation.

Return this exact JSON shape:
{
  "category": "mortgages",
  "amount": 320000,
  "amountCurrency": "USD",
  "incomeEntries": [{ "amount": 150000, "currency": "USD" }],
  "situation": "one-sentence summary"
}

Rules:
- "category" must be exactly "mortgages" or "savings" — infer from context, default to "mortgages"
- "amount" is the loan or savings amount; use explicit number if stated, otherwise estimate realistically for the described location/property type
- "amountCurrency" is the natural currency for the described location (e.g. "USD" for US, "GBP" for UK, "EUR" for Eurozone); default to "GBP" if unclear
- "incomeEntries" is an array of { amount, currency } — one per income source mentioned; estimate realistically for role/location if not stated; currency must be one of GBP, USD, EUR, JPY (use the closest supported currency for the described location)
- "situation" is a clean one-sentence summary of the user's description
- Return ONLY valid JSON — no markdown, no explanation

User description:
${text}`;
}

async function getAIAnalysis(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { buildMortgagePrompt, buildExtractionPrompt, getAIAnalysis };
