const { buildMortgagePrompt, getAIAnalysis } = require('../../src/services/gemini');

describe('buildMortgagePrompt', () => {
  test('includes loan amount and situation in prompt', () => {
    const prompt = buildMortgagePrompt(
      { current: { twoYear: 4.5, fiveYear: 4.3 }, history: [] },
      200000,
      'Good credit, stable income, 75% LTV'
    );
    expect(prompt).toContain('£200,000');
    expect(prompt).toContain('Good credit, stable income, 75% LTV');
    expect(prompt).toContain('4.5');
  });

  test('includes recommendation structure request', () => {
    const prompt = buildMortgagePrompt({ current: {}, history: [] }, 100000, 'test');
    expect(prompt.toLowerCase()).toContain('recommend');
  });

  test('includes recent rate history in prompt', () => {
    const history = [
      { date: '2024-01-31', twoYear: 4.5, fiveYear: 4.3 },
      { date: '2024-02-29', twoYear: 4.6, fiveYear: 4.4 },
    ];
    const prompt = buildMortgagePrompt({ current: { twoYear: 4.5 }, history }, 100000, 'test');
    expect(prompt).toContain('2024-01-31');
  });

  test('handles undefined history gracefully', () => {
    const prompt = buildMortgagePrompt({ current: { twoYear: 4.5 }, history: undefined }, 100000, 'test');
    expect(prompt).toContain('4.5');
  });

  test('handles undefined amount gracefully', () => {
    const prompt = buildMortgagePrompt({ current: {}, history: [] }, undefined, 'test');
    expect(typeof prompt).toBe('string');
  });

  test('appends income and bank to USER SITUATION when both > 0', () => {
    const prompt = buildMortgagePrompt(
      { current: { twoYear: 4.5, fiveYear: 4.3 }, history: [] },
      200000, 'test situation', 75000, 50000
    );
    expect(prompt).toContain('Annual income after taxes');
    expect(prompt).toContain('£75,000');
    expect(prompt).toContain('£50,000');
  });

  test('omits income and bank lines when both are 0', () => {
    const prompt = buildMortgagePrompt(
      { current: { twoYear: 4.5, fiveYear: 4.3 }, history: [] },
      200000, 'test situation', 0, 0
    );
    expect(prompt).not.toContain('Annual income after taxes');
  });
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'AI analysis result' },
      }),
    }),
  })),
}));

describe('getAIAnalysis', () => {
  test('throws when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(getAIAnalysis('test prompt')).rejects.toThrow('GEMINI_API_KEY not set');
  });

  test('returns AI text when API key is set', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const result = await getAIAnalysis('test prompt');
    expect(result).toBe('AI analysis result');
  });
});
