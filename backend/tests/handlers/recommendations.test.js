jest.mock('../../src/services/boe', () => ({
  fetchMortgageRates: jest.fn().mockResolvedValue({
    current: { twoYear: 4.5, threeYear: 4.3, fiveYear: 4.1 },
    history: [],
  }),
}));

jest.mock('../../src/services/exchangeRates', () => ({
  fetchExchangeRates: jest.fn().mockResolvedValue({
    base: 'GBP', rates: { USD: 1.27, EUR: 1.18, JPY: 190 },
  }),
}));

jest.mock('../../src/services/gemini', () => ({
  buildMortgagePrompt: jest.fn().mockReturnValue('prompt'),
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

  test('clamps negative bankAmount to 0', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', bankAmount: '-10000',
    });
    const args = buildBasicRecommendation.mock.calls[0];
    expect(args[3]).toBe(0); // parsedBank is 4th arg
  });

  test('passes converted income and bankAmount to buildMortgagePrompt when useAI is true', async () => {
    const { buildMortgagePrompt } = require('../../src/services/gemini');
    const entries = JSON.stringify([{ amount: '75000', currency: 'GBP' }]);
    await handleRecommendations({
      category: 'mortgages', amount: '200000', situation: 'test',
      incomeEntries: entries, bankAmount: '50000', useAI: 'true',
    });
    const args = buildMortgagePrompt.mock.calls[0];
    expect(args[3]).toBe(75000); // parsedIncome
    expect(args[4]).toBe(50000); // parsedBank
  });

  // --- incomeEntries conversion tests ---

  test('all GBP income entries — does not call fetchExchangeRates, sums correctly', async () => {
    const { fetchExchangeRates } = require('../../src/services/exchangeRates');
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    const entries = JSON.stringify([
      { amount: '30000', currency: 'GBP' },
      { amount: '20000', currency: 'GBP' },
    ]);
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', incomeEntries: entries,
    });
    expect(fetchExchangeRates).not.toHaveBeenCalled();
    expect(buildBasicRecommendation.mock.calls[0][2]).toBe(50000); // parsedIncome = 30000+20000
  });

  test('single USD income entry — calls fetchExchangeRates once, converts correctly', async () => {
    const { fetchExchangeRates } = require('../../src/services/exchangeRates');
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    const entries = JSON.stringify([{ amount: '12700', currency: 'USD' }]);
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', incomeEntries: entries,
    });
    expect(fetchExchangeRates).toHaveBeenCalledTimes(1);
    // 12700 / 1.27 = 10000 GBP
    expect(buildBasicRecommendation.mock.calls[0][2]).toBeCloseTo(10000, 2);
  });

  test('multiple entries mixed currencies — fetchExchangeRates called exactly once, sum correct', async () => {
    const { fetchExchangeRates } = require('../../src/services/exchangeRates');
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    const entries = JSON.stringify([
      { amount: '12700', currency: 'USD' }, // 10000 GBP
      { amount: '10000', currency: 'GBP' }, // 10000 GBP
    ]);
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', incomeEntries: entries,
    });
    expect(fetchExchangeRates).toHaveBeenCalledTimes(1);
    expect(buildBasicRecommendation.mock.calls[0][2]).toBeCloseTo(20000, 2);
  });

  test('bank amount in EUR — converts correctly', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false',
      bankAmount: '11800', bankAmountCurrency: 'EUR',
    });
    // 11800 / 1.18 = 10000 GBP
    expect(buildBasicRecommendation.mock.calls[0][3]).toBeCloseTo(10000, 2);
  });

  test('both non-GBP income and non-GBP bank — fetchExchangeRates called exactly once', async () => {
    const { fetchExchangeRates } = require('../../src/services/exchangeRates');
    const entries = JSON.stringify([{ amount: '12700', currency: 'USD' }]);
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false',
      incomeEntries: entries, bankAmount: '11800', bankAmountCurrency: 'EUR',
    });
    expect(fetchExchangeRates).toHaveBeenCalledTimes(1);
  });

  test('malformed incomeEntries JSON — falls back to empty array, no crash', async () => {
    const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');
    const result = await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false',
      incomeEntries: 'not-valid-json',
    });
    expect(result.recommendation).toBeDefined();
    expect(buildBasicRecommendation.mock.calls[0][2]).toBe(0); // parsedIncome = 0
  });

  test('zero-amount entry with non-GBP currency — fetchExchangeRates NOT called', async () => {
    const { fetchExchangeRates } = require('../../src/services/exchangeRates');
    const entries = JSON.stringify([{ amount: '0', currency: 'USD' }]);
    await handleRecommendations({
      category: 'mortgages', amount: '200000', useAI: 'false', incomeEntries: entries,
    });
    expect(fetchExchangeRates).not.toHaveBeenCalled();
  });
});
