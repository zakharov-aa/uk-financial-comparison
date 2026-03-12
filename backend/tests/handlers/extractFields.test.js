jest.mock('../../src/services/gemini', () => ({
  buildExtractionPrompt: jest.fn(text => `extract: ${text}`),
  getAIAnalysis: jest.fn(),
}));

jest.mock('../../src/services/exchangeRates', () => ({
  fetchExchangeRates: jest.fn(),
}));

const { handleExtractFields } = require('../../src/handlers/extractFields');
const { getAIAnalysis } = require('../../src/services/gemini');
const { fetchExchangeRates } = require('../../src/services/exchangeRates');

beforeEach(() => { jest.clearAllMocks(); });

const FX = { base: 'GBP', date: '2024-01-01', rates: { USD: 1.27, EUR: 1.16, JPY: 189 }, stale: false };

const gbpResponse = JSON.stringify({
  category: 'mortgages',
  amount: 200000,
  amountCurrency: 'GBP',
  incomeEntries: [{ amount: 60000, currency: 'GBP' }],
  situation: 'Senior engineer buying a first home',
});

describe('handleExtractFields', () => {
  test('valid prompt returns correct shape', async () => {
    getAIAnalysis.mockResolvedValue(gbpResponse);
    const result = await handleExtractFields({ prompt: 'I want to buy a house' });
    expect(result).toEqual({
      category: 'mortgages',
      amount: 200000,
      incomeEntries: [{ amount: 60000, currency: 'GBP' }],
      situation: 'Senior engineer buying a first home',
    });
  });

  test('amount in USD: fetchExchangeRates called once, amount converted to GBP', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 254000, amountCurrency: 'USD',
      incomeEntries: [], situation: 'test',
    }));
    fetchExchangeRates.mockResolvedValue(FX);
    const result = await handleExtractFields({ prompt: 'test' });
    expect(fetchExchangeRates).toHaveBeenCalledTimes(1);
    expect(result.amount).toBeCloseTo(254000 / 1.27);
  });

  test('amount already in GBP: fetchExchangeRates NOT called', async () => {
    getAIAnalysis.mockResolvedValue(gbpResponse);
    await handleExtractFields({ prompt: 'test' });
    expect(fetchExchangeRates).not.toHaveBeenCalled();
  });

  test('missing prompt param throws 400', async () => {
    await expect(handleExtractFields({}))
      .rejects.toMatchObject({ statusCode: 400, message: 'prompt is required' });
  });

  test('empty string prompt throws 400', async () => {
    await expect(handleExtractFields({ prompt: '' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'prompt is required' });
  });

  test('prompt longer than 1000 characters throws 400', async () => {
    await expect(handleExtractFields({ prompt: 'a'.repeat(1001) }))
      .rejects.toMatchObject({ statusCode: 400, message: 'prompt too long' });
  });

  test('non-numeric amount throws 422', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: null, amountCurrency: 'GBP',
      incomeEntries: [], situation: 'test',
    }));
    await expect(handleExtractFields({ prompt: 'test' }))
      .rejects.toMatchObject({ statusCode: 422, message: 'extraction_failed' });
  });

  test('Gemini returns malformed JSON throws 422', async () => {
    getAIAnalysis.mockResolvedValue('not json at all');
    await expect(handleExtractFields({ prompt: 'test' }))
      .rejects.toMatchObject({ statusCode: 422, message: 'extraction_failed' });
  });

  test('Gemini throws 429: error propagates', async () => {
    const err = { status: 429, message: 'Quota exceeded' };
    getAIAnalysis.mockRejectedValue(err);
    await expect(handleExtractFields({ prompt: 'test' })).rejects.toBe(err);
  });

  test('amountCurrency absent from Gemini response defaults to GBP, no FX call', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 200000,
      incomeEntries: [], situation: 'test',
    }));
    const result = await handleExtractFields({ prompt: 'test' });
    expect(fetchExchangeRates).not.toHaveBeenCalled();
    expect(result.amount).toBe(200000);
  });

  test('incomeEntries absent from Gemini response defaults to []', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 200000, amountCurrency: 'GBP', situation: 'test',
    }));
    const result = await handleExtractFields({ prompt: 'test' });
    expect(result.incomeEntries).toEqual([]);
  });

  test('incomeEntries present but not an array defaults to []', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 200000, amountCurrency: 'GBP',
      incomeEntries: 'single source', situation: 'test',
    }));
    const result = await handleExtractFields({ prompt: 'test' });
    expect(result.incomeEntries).toEqual([]);
  });

  test('incomeEntries with non-GBP currency: passed through unchanged, no FX call', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 200000, amountCurrency: 'GBP',
      incomeEntries: [{ amount: 150000, currency: 'USD' }], situation: 'test',
    }));
    const result = await handleExtractFields({ prompt: 'test' });
    expect(fetchExchangeRates).not.toHaveBeenCalled();
    expect(result.incomeEntries).toEqual([{ amount: 150000, currency: 'USD' }]);
  });

  test('amountCurrency present but unsupported (e.g. AUD) throws 422', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 500000, amountCurrency: 'AUD',
      incomeEntries: [], situation: 'test',
    }));
    fetchExchangeRates.mockResolvedValue(FX);
    await expect(handleExtractFields({ prompt: 'test' }))
      .rejects.toMatchObject({ statusCode: 422, message: 'extraction_failed' });
  });

  test('FX API throws: error propagates', async () => {
    getAIAnalysis.mockResolvedValue(JSON.stringify({
      category: 'mortgages', amount: 254000, amountCurrency: 'USD',
      incomeEntries: [], situation: 'test',
    }));
    const err = new Error('FX API down');
    fetchExchangeRates.mockRejectedValue(err);
    await expect(handleExtractFields({ prompt: 'test' })).rejects.toBe(err);
  });
});
