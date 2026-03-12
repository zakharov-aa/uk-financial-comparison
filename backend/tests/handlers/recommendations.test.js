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

jest.mock('../../src/services/basicRecommendation', () => ({
  buildBasicRecommendation: jest.fn().mockReturnValue('Rule-based recommendation'),
}));

const { handleRecommendations } = require('../../src/handlers/recommendations');

beforeEach(() => { jest.clearAllMocks(); });

describe('handleRecommendations', () => {
  test('returns AI recommendation for mortgages', async () => {
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      situation: 'Good credit, stable income',
    });
    expect(result.recommendation).toBe('Recommendation: Fix for 2 years');
    expect(result.currentRates).toBeDefined();
    expect(result.aiUsed).toBe(true);
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

  test('routes to buildBasicRecommendation when useAI is false', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    const { getAIAnalysis } = require('../../src/services/gemini');
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      situation: 'test',
      useAI: 'false',
    });
    expect(buildBasicRecommendation).toHaveBeenCalled();
    expect(getAIAnalysis).not.toHaveBeenCalled();
    expect(result.recommendation).toBe('Rule-based recommendation');
    expect(result.aiUsed).toBe(false);
  });

  test('still uses AI for exchange-rates even when useAI is false', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    const { getAIAnalysis } = require('../../src/services/gemini');
    await handleRecommendations({
      category: 'exchange-rates',
      amount: '50000',
      useAI: 'false',
    });
    expect(getAIAnalysis).toHaveBeenCalled();
    expect(buildBasicRecommendation).not.toHaveBeenCalled();
  });

  test('clamps negative annualIncome to 0', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', annualIncome: '-50000',
    });
    const args = buildBasicRecommendation.mock.calls[0];
    expect(args[2]).toBe(0); // parsedIncome is 3rd arg
  });

  test('clamps negative bankAmount to 0', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', bankAmount: '-10000',
    });
    const args = buildBasicRecommendation.mock.calls[0];
    expect(args[3]).toBe(0); // parsedBank is 4th arg
  });

  test('passes annualIncome and bankAmount to buildMortgagePrompt when useAI is true', async () => {
    const { buildMortgagePrompt } = require('../../src/services/gemini');
    await handleRecommendations({
      category: 'mortgages', amount: '200000', situation: 'test',
      annualIncome: '75000', bankAmount: '50000', useAI: 'true',
    });
    const args = buildMortgagePrompt.mock.calls[0];
    expect(args[3]).toBe(75000); // parsedIncome
    expect(args[4]).toBe(50000); // parsedBank
  });
});
