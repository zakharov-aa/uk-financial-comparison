jest.mock('../../src/services/boe', () => ({
  fetchMortgageRates: jest.fn().mockResolvedValue({
    current: { twoYear: 4.5, threeYear: 4.3, fiveYear: 4.1 },
    history: [],
  }),
}));

jest.mock('../../src/services/exchangeRates', () => ({
  fetchExchangeRates: jest.fn().mockResolvedValue({
    base: 'GBP', rates: { USD: 1.27, EUR: 1.18 },
  }),
}));

jest.mock('../../src/services/gemini', () => ({
  buildMortgagePrompt: jest.fn().mockReturnValue('test prompt'),
  getAIAnalysis: jest.fn().mockResolvedValue('AI says: fix for 2 years'),
}));

const { handleCompare } = require('../../src/handlers/compare');

describe('handleCompare', () => {
  test('returns comparison table and AI summary', async () => {
    const result = await handleCompare({
      category: 'mortgages',
      criteria: { amount: 200000, ltv: 75 },
    });
    expect(result.comparison).toBeDefined();
    expect(result.aiSummary).toBe('AI says: fix for 2 years');
  });

  test('calculates monthly payment for each rate option', async () => {
    const result = await handleCompare({
      category: 'mortgages',
      criteria: { amount: 200000, ltv: 75 },
    });
    expect(result.comparison[0].monthlyPayment).toBeDefined();
  });

  test('returns exchange rate comparison for exchange-rates category', async () => {
    const result = await handleCompare({
      category: 'exchange-rates',
      criteria: {},
    });
    expect(result.comparison[0].label).toContain('GBP/');
    expect(result.aiSummary).toBeNull();
  });

  test('handles zero amount (no monthly payment)', async () => {
    const result = await handleCompare({ category: 'mortgages', criteria: {} });
    expect(result.comparison[0].monthlyPayment).toBeNull();
  });

  test('throws 400 when category is missing', async () => {
    await expect(handleCompare({ criteria: {} })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
