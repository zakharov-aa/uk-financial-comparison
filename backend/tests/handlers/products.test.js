jest.mock('../../src/services/boe', () => ({
  fetchMortgageRates: jest.fn().mockResolvedValue({
    current: { twoYear: 4.5, threeYear: 4.3, fiveYear: 4.1 },
    history: [],
    stale: false,
  }),
}));

jest.mock('../../src/services/exchangeRates', () => ({
  fetchExchangeRates: jest.fn().mockResolvedValue({
    base: 'GBP', rates: { USD: 1.27 }, stale: false,
  }),
}));

const { handleProducts } = require('../../src/handlers/products');

describe('handleProducts', () => {
  test('returns mortgage data for mortgages category', async () => {
    const result = await handleProducts('mortgages');
    expect(result.data).toBeDefined();
    expect(result.data.current.twoYear).toBe(4.5);
    expect(result.meta.category).toBe('mortgages');
  });

  test('returns exchange rate data for exchange-rates category', async () => {
    const result = await handleProducts('exchange-rates');
    expect(result.data.base).toBe('GBP');
  });

  test('returns mortgage data for savings category', async () => {
    const result = await handleProducts('savings');
    expect(result.meta.category).toBe('savings');
  });

  test('throws 400 for unknown category', async () => {
    await expect(handleProducts('unknown')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
