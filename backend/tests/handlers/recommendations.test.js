jest.mock('../../src/services/boe', () => ({
  fetchMortgageRates: jest.fn().mockResolvedValue({
    current: { twoYear: 4.5, threeYear: 4.3, fiveYear: 4.1 },
    history: [],
  }),
}));

jest.mock('../../src/services/exchangeRates', () => ({
  fetchExchangeRates: jest.fn().mockResolvedValue({
    base: 'GBP', rates: { USD: 1.27 },
  }),
}));

jest.mock('../../src/services/gemini', () => ({
  buildMortgagePrompt: jest.fn().mockReturnValue('prompt'),
  buildSavingsPrompt: jest.fn().mockReturnValue('prompt'),
  getAIAnalysis: jest.fn().mockResolvedValue('Recommendation: Fix for 2 years'),
}));

const { handleRecommendations } = require('../../src/handlers/recommendations');

describe('handleRecommendations', () => {
  test('returns AI recommendation for mortgages', async () => {
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      situation: 'Good credit, stable income',
    });
    expect(result.recommendation).toBe('Recommendation: Fix for 2 years');
    expect(result.currentRates).toBeDefined();
  });

  test('defaults to mortgages when no category provided', async () => {
    const result = await handleRecommendations({ amount: '100000', situation: 'test' });
    expect(result.currentRates).toBeDefined();
  });

  test('returns recommendation for exchange-rates category', async () => {
    const result = await handleRecommendations({
      category: 'exchange-rates',
      amount: '50000',
      situation: 'planning to buy abroad',
    });
    expect(result.recommendation).toBeDefined();
  });

  test('handles missing amount gracefully', async () => {
    const result = await handleRecommendations({ category: 'mortgages', situation: 'test' });
    expect(result.recommendation).toBeDefined();
  });
});
