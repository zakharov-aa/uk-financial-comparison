const { buildBasicRecommendation } = require('../../src/services/basicRecommendation');

const BASE_RATE_DATA = {
  current: { twoYear: 4.5, threeYear: 4.3, fiveYear: 4.1 },
  history: [
    { date: '2025-09-30', twoYear: 4.8, fiveYear: 4.5 },
    { date: '2025-10-31', twoYear: 4.7, fiveYear: 4.4 },
    { date: '2025-11-30', twoYear: 4.6, fiveYear: 4.3 },
    { date: '2025-12-31', twoYear: 4.5, fiveYear: 4.2 },
    { date: '2026-01-31', twoYear: 4.4, fiveYear: 4.1 },
    { date: '2026-02-28', twoYear: 4.3, fiveYear: 4.0 },
  ],
};

const RISING_HISTORY = [
  { date: '2025-09-30', twoYear: 4.0, fiveYear: 3.8 },
  { date: '2026-02-28', twoYear: 4.6, fiveYear: 4.3 },
];

describe('buildBasicRecommendation - affordability', () => {
  test('notes affordability when income is within limit', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 200000, 60000, 0);
    expect(result).toContain('within standard affordability limits');
  });

  test('flags affordability exceeded when loan > income x 4.5', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 400000, 60000, 0);
    expect(result).toContain('exceeds the standard affordability limit');
  });

  test('skips affordability check when annualIncome is 0', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 400000, 0, 0);
    expect(result).not.toContain('affordability');
  });
});

describe('buildBasicRecommendation - LTV brackets', () => {
  test('LTV <= 60%: quotes twoYear rate', () => {
    // amount=100000, bankAmount=67000 => ltv = 100000/167000 = 59.9%
    const result = buildBasicRecommendation(BASE_RATE_DATA, 100000, 0, 67000);
    expect(result).toContain('4.5');
    expect(result).toContain('≤60%');
  });

  test('LTV <= 75%: quotes threeYear rate', () => {
    // amount=100000, bankAmount=35000 => ltv = 100000/135000 = 74.1%
    const result = buildBasicRecommendation(BASE_RATE_DATA, 100000, 0, 35000);
    expect(result).toContain('4.3');
    expect(result).toContain('≤75%');
  });

  test('LTV <= 85%: quotes fiveYear rate', () => {
    // amount=100000, bankAmount=18000 => ltv = 100000/118000 = 84.7%
    const result = buildBasicRecommendation(BASE_RATE_DATA, 100000, 0, 18000);
    expect(result).toContain('4.1');
    expect(result).toContain('≤85%');
  });

  test('LTV > 85%: quotes fiveYear rate and includes warning', () => {
    // amount=100000, bankAmount=5000 => ltv = 100000/105000 = 95.2%
    const result = buildBasicRecommendation(BASE_RATE_DATA, 100000, 0, 5000);
    expect(result).toContain('4.1');
    expect(result).toContain('LTV above 85%');
  });

  test('skips LTV section when bankAmount is 0', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 200000, 0, 0);
    expect(result).not.toContain('LTV');
  });
});

describe('buildBasicRecommendation - rate trend', () => {
  test('recommends 2-year fix when rates are falling', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 200000, 0, 0);
    expect(result).toContain('2-year fixed');
  });

  test('recommends 5-year fix when rates are rising', () => {
    const rateData = { current: BASE_RATE_DATA.current, history: RISING_HISTORY };
    const result = buildBasicRecommendation(rateData, 200000, 0, 0);
    expect(result).toContain('5-year fixed');
  });

  test('recommends 5-year fix when history has fewer than 2 entries', () => {
    const rateData = { current: BASE_RATE_DATA.current, history: [] };
    const result = buildBasicRecommendation(rateData, 200000, 0, 0);
    expect(result).toContain('5-year fixed');
  });
});

describe('buildBasicRecommendation - output structure', () => {
  test('always contains all four sections', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 200000, 0, 0);
    expect(result).toContain('1. Recommendation');
    expect(result).toContain('2. Key Supporting Factors');
    expect(result).toContain('3. Main Risks');
    expect(result).toContain('4. Summary');
  });

  test('returns a string', () => {
    const result = buildBasicRecommendation(BASE_RATE_DATA, 200000, 50000, 80000);
    expect(typeof result).toBe('string');
  });
});
