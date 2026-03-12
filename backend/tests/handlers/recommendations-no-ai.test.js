/**
 * Integration tests for the recommendations handler running WITHOUT AI.
 * buildBasicRecommendation is NOT mocked — the real logic runs end-to-end.
 */

jest.mock('../../src/services/boe', () => ({
  fetchMortgageRates: jest.fn().mockResolvedValue({
    current: { twoYear: 4.5, threeYear: 4.3, fiveYear: 4.1 },
    history: [
      { date: '2025-09-30', twoYear: 4.8, fiveYear: 4.5 },
      { date: '2025-10-31', twoYear: 4.7, fiveYear: 4.4 },
      { date: '2025-11-30', twoYear: 4.6, fiveYear: 4.3 },
      { date: '2025-12-31', twoYear: 4.5, fiveYear: 4.2 },
      { date: '2026-01-31', twoYear: 4.4, fiveYear: 4.1 },
      { date: '2026-02-28', twoYear: 4.3, fiveYear: 4.0 },
    ],
  }),
}));

jest.mock('../../src/services/gemini', () => ({
  buildMortgagePrompt: jest.fn(),
  buildSavingsPrompt: jest.fn(),
  getAIAnalysis: jest.fn(),
}));

const { handleRecommendations } = require('../../src/handlers/recommendations');
const { getAIAnalysis } = require('../../src/services/gemini');

beforeEach(() => { jest.clearAllMocks(); });

describe('handleRecommendations without AI (integration)', () => {
  test('returns a structured recommendation without calling Gemini', async () => {
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '300000',
      useAI: 'false',
    });

    expect(getAIAnalysis).not.toHaveBeenCalled();
    expect(result.recommendation).toContain('1. Recommendation');
    expect(result.recommendation).toContain('2. Key Supporting Factors');
    expect(result.recommendation).toContain('3. Main Risks');
    expect(result.recommendation).toContain('4. Summary');
    expect(result.aiUsed).toBe(false);
    expect(result.currentRates).toBeDefined();
    expect(result.generatedAt).toBeDefined();
  });

  test('recommends 2-year fix when rates are falling', async () => {
    // History has oldest=4.8, newest=4.3 → diff=0.5 > 0.1 → falling
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      useAI: 'false',
    });
    expect(result.recommendation).toContain('2-year fixed');
  });

  test('includes affordability analysis when annualIncome provided', async () => {
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      annualIncome: '60000',
      useAI: 'false',
    });
    // 200000 < 60000 * 4.5 = 270000 → within limits
    expect(result.recommendation).toContain('within standard affordability limits');
  });

  test('flags affordability exceeded when loan is too large', async () => {
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '500000',
      annualIncome: '60000',
      useAI: 'false',
    });
    // 500000 > 60000 * 4.5 = 270000 → exceeded
    expect(result.recommendation).toContain('exceeds the standard affordability limit');
  });

  test('includes LTV analysis when bankAmount provided', async () => {
    // amount=200000, bankAmount=200000 → ltv=50% → ≤60% bracket
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      bankAmount: '200000',
      useAI: 'false',
    });
    expect(result.recommendation).toContain('≤60%');
  });

  test('flags LTV above 85% risk', async () => {
    // amount=200000, bankAmount=10000 → ltv=95.2% → >85%
    const result = await handleRecommendations({
      category: 'mortgages',
      amount: '200000',
      bankAmount: '10000',
      useAI: 'false',
    });
    expect(result.recommendation).toContain('LTV above 85%');
  });

  test('savings category also uses rule-based when useAI is false', async () => {
    const result = await handleRecommendations({
      category: 'savings',
      amount: '50000',
      useAI: 'false',
    });
    expect(getAIAnalysis).not.toHaveBeenCalled();
    expect(result.aiUsed).toBe(false);
    expect(result.recommendation).toBeDefined();
  });
});
