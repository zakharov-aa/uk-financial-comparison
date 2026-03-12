# Smart Fill Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a natural-language "Smart Fill" panel to the Recommendations page that calls Gemini to extract and pre-fill form fields, with green AI-filled visual indicators and graceful fallback when quota is exceeded.

**Architecture:** New `GET /extract-fields` Lambda route calls a new `handleExtractFields` handler that uses a new `buildExtractionPrompt` function to ask Gemini for a JSON blob, converts the amount to GBP via the existing FX service if needed, and returns `{ category, amount, incomeEntries, situation }`. The React frontend gains a Smart Fill textarea panel above the form and tracks which fields were AI-filled vs. user-edited.

**Tech Stack:** Node.js 20 (Lambda), Jest 29, React 18 (create-react-app), `@google/generative-ai` SDK (already installed)

**Spec:** `docs/superpowers/specs/2026-03-12-smart-fill-design.md`

---

## Chunk 1: Backend

### Task 1: `buildExtractionPrompt` + gemini.test.js fixes

**Files:**
- Modify: `backend/src/services/gemini.js`
- Modify: `backend/tests/services/gemini.test.js`

---

- [ ] **Step 1: Add `buildExtractionPrompt` describe block to gemini.test.js**

Append after the existing `jest.mock('@google/generative-ai', ...)` call and before the existing `getAIAnalysis` describe block:

```javascript
describe('buildExtractionPrompt', () => {
  test("includes the user's text in the returned prompt string", () => {
    const prompt = buildExtractionPrompt('senior engineer in Colorado');
    expect(prompt).toContain('senior engineer in Colorado');
  });

  test('contains the word "JSON" to instruct Gemini to return JSON only', () => {
    const prompt = buildExtractionPrompt('test');
    expect(prompt).toContain('JSON');
  });

  test('contains "mortgages" and "savings" as the valid category values', () => {
    const prompt = buildExtractionPrompt('test');
    expect(prompt).toContain('mortgages');
    expect(prompt).toContain('savings');
  });

  test('contains "amountCurrency" to ensure the currency field is requested', () => {
    const prompt = buildExtractionPrompt('test');
    expect(prompt).toContain('amountCurrency');
  });
});
```

Also update the `require` at the top of the file:

```javascript
const { buildMortgagePrompt, buildExtractionPrompt, getAIAnalysis } = require('../../src/services/gemini');
```

- [ ] **Step 2: Replace the `getAIAnalysis` describe block with a version that uses save/restore and adds the error-propagation test**

Replace the existing `describe('getAIAnalysis', ...)` block with:

```javascript
describe('getAIAnalysis', () => {
  let originalKey;
  beforeEach(() => { originalKey = process.env.GEMINI_API_KEY; });
  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  test('throws when GEMINI_API_KEY is not set', async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(getAIAnalysis('test prompt')).rejects.toThrow('GEMINI_API_KEY not set');
  });

  test('returns AI text when API key is set', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const result = await getAIAnalysis('test prompt');
    expect(result).toBe('AI analysis result');
  });

  test('rejects with the error thrown by generateContent', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const mockError = new Error('network failure');
    GoogleGenerativeAI.mockImplementationOnce(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: jest.fn().mockRejectedValue(mockError),
      }),
    }));
    await expect(getAIAnalysis('test prompt')).rejects.toBe(mockError);
  });
});
```

- [ ] **Step 3: Run tests — new `buildExtractionPrompt` tests and the new error-propagation test should fail**

```bash
cd backend && npm test -- --testPathPattern=gemini
```

Expected: 4 failures (`buildExtractionPrompt` × 4). The `rejects with error` test may already pass because the current `getAIAnalysis` does not catch errors from `generateContent` — this is fine. Existing tests still pass.

- [ ] **Step 4: Implement `buildExtractionPrompt` in `backend/src/services/gemini.js`**

Add the function before `getAIAnalysis`, then update `module.exports`:

```javascript
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
```

Update the last line of the file:

```javascript
module.exports = { buildMortgagePrompt, buildExtractionPrompt, getAIAnalysis };
```

- [ ] **Step 5: Run tests — all should pass**

```bash
cd backend && npm test -- --testPathPattern=gemini
```

Expected: all pass (previously 5 failures now resolved).

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/services/gemini.js tests/services/gemini.test.js && git commit -m "feat: add buildExtractionPrompt to gemini service"
```

---

### Task 2: `extractFields` handler + tests

**Files:**
- Create: `backend/src/handlers/extractFields.js`
- Create: `backend/tests/handlers/extractFields.test.js`

---

- [ ] **Step 1: Create `backend/tests/handlers/extractFields.test.js`**

```javascript
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
```

- [ ] **Step 2: Run tests — all 12 should fail (handler not yet created)**

```bash
cd backend && npm test -- --testPathPattern=extractFields
```

Expected: 12 failures with "Cannot find module '../../src/handlers/extractFields'".

- [ ] **Step 3: Create `backend/src/handlers/extractFields.js`**

```javascript
const { buildExtractionPrompt, getAIAnalysis } = require('../services/gemini');
const { fetchExchangeRates } = require('../services/exchangeRates');

async function handleExtractFields(params) {
  const { prompt } = params;
  if (!prompt || prompt.trim() === '') {
    throw { statusCode: 400, message: 'prompt is required' };
  }

  const rawResponse = await getAIAnalysis(buildExtractionPrompt(prompt));

  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (e) {
    throw { statusCode: 422, message: 'extraction_failed' };
  }

  let { category, amount, amountCurrency, incomeEntries, situation } = parsed;

  if (!amountCurrency) amountCurrency = 'GBP';

  if (amountCurrency !== 'GBP') {
    const fxData = await fetchExchangeRates();
    const rate = fxData.rates[amountCurrency];
    if (rate === undefined) {
      throw { statusCode: 422, message: 'extraction_failed' };
    }
    amount = amount / rate;
  }

  if (!Array.isArray(incomeEntries)) incomeEntries = [];

  return { category, amount, incomeEntries, situation };
}

module.exports = { handleExtractFields };
```

- [ ] **Step 4: Run tests — all 12 should pass**

```bash
cd backend && npm test -- --testPathPattern=extractFields
```

Expected: 12 passing.

- [ ] **Step 5: Run full test suite to check coverage thresholds are still met**

```bash
cd backend && npm test
```

Expected: all tests pass, coverage thresholds met.

- [ ] **Step 6: Commit**

```bash
cd backend && git add src/handlers/extractFields.js tests/handlers/extractFields.test.js && git commit -m "feat: add extractFields handler"
```

---

### Task 3: Route wiring (`index.js` + `template.yaml`)

**Files:**
- Modify: `backend/src/index.js`
- Modify: `template.yaml`

---

- [ ] **Step 1: Add the `handleExtractFields` require and route to `backend/src/index.js`**

Add the require at the top (after the existing requires):

```javascript
const { handleExtractFields } = require('./handlers/extractFields');
```

Add the route inside the `try` block, after the `/recommendations` branch. The snippet must continue the `else if` chain — replace the closing of the `/recommendations` branch with:

```javascript
    } else if (method === 'GET' && path === '/recommendations') {
      response = await handleRecommendations(event.queryStringParameters || {});
    } else if (method === 'GET' && path === '/extract-fields') {
      response = await handleExtractFields(event.queryStringParameters || {});
    } else {
```

(The `} else {` continuation is required — it connects to the existing 404 fallback block that follows.)

- [ ] **Step 2: Add the two new API events to `template.yaml`**

Inside `FinancialApiFunction.Properties.Events`, add after `OptionsRecommendations`:

```yaml
        ExtractFieldsApi:
          Type: Api
          Properties:
            Path: /extract-fields
            Method: GET
        OptionsExtractFields:
          Type: Api
          Properties:
            Path: /extract-fields
            Method: OPTIONS
```

- [ ] **Step 3: Run full test suite**

```bash
cd backend && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.js template.yaml && git commit -m "feat: wire GET /extract-fields route"
```

---

## Chunk 2: Frontend

### Task 4: Smart Fill panel + AI field indicators (`Recommendations.jsx`)

**Files:**
- Modify: `frontend/src/pages/Recommendations.jsx`

**Context:** The file currently has ~200 lines. `useState` is already imported. We are adding `useRef`, four new state variables, a ref, two new functions, a Smart Fill panel above the form, AI indicators on four fields, and wiring `onChange` handlers to clear indicators on user edits.

---

- [ ] **Step 1: Update the React import to include `useRef`**

Change:

```javascript
import { useState } from 'react';
```

To:

```javascript
import { useState, useRef } from 'react';
```

- [ ] **Step 2: Add new state variables and `amountRef` after the existing state declarations**

After the `const [bankAmountCurrency, setBankAmountCurrency] = useState('GBP');` line, add:

```javascript
  const [aiFilledFields, setAiFilledFields] = useState(new Set());
  const [smartFillPrompt, setSmartFillPrompt] = useState('');
  const [smartFillLoading, setSmartFillLoading] = useState(false);
  const [smartFillError, setSmartFillError] = useState(null);
  const amountRef = useRef(null);
```

- [ ] **Step 3: Add `markUserEdited` helper function**

Add after the `amountRef` declaration:

```javascript
  function markUserEdited(fieldName) {
    setAiFilledFields(prev => {
      const next = new Set(prev);
      next.delete(fieldName);
      return next;
    });
  }
```

- [ ] **Step 4: Add `handleSmartFill` async function**

Add after `markUserEdited`:

```javascript
  const handleSmartFill = async () => {
    setSmartFillLoading(true);
    setSmartFillError(null);
    try {
      const res = await fetch(`${API_BASE}/extract-fields?prompt=${encodeURIComponent(smartFillPrompt)}`);
      const data = await res.json();
      if (!res.ok) {
        setSmartFillError(
          res.status === 429
            ? 'AI quota exceeded — please fill in the fields manually'
            : 'Smart fill unavailable — please fill in the fields manually'
        );
        return;
      }
      const filled = new Set();
      const prevAmount = amount;
      if (data.category) { setCategory(data.category); filled.add('category'); }
      if (data.amount != null) { setAmount(String(Math.round(data.amount))); filled.add('amount'); }
      if (Array.isArray(data.incomeEntries) && data.incomeEntries.length > 0) {
        setIncomeEntries(data.incomeEntries.map(e => ({ amount: String(e.amount), currency: e.currency })));
        filled.add('incomeEntries');
      }
      if (data.situation) { setSituation(data.situation); filled.add('situation'); }
      setAiFilledFields(filled);
      if (data.amount != null && String(Math.round(data.amount)) !== prevAmount) {
        amountRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    } catch {
      setSmartFillError('Smart fill unavailable — please fill in the fields manually');
    } finally {
      setSmartFillLoading(false);
    }
  };
```

- [ ] **Step 5: Update `updateEntry`, `removeEntry`, and `addEntry` to call `markUserEdited`**

Replace:

```javascript
  function updateEntry(index, field, value) {
    const updated = [...incomeEntries];
    updated[index] = { ...updated[index], [field]: value };
    setIncomeEntries(updated);
  }

  function removeEntry(index) {
    setIncomeEntries(incomeEntries.filter((_, i) => i !== index));
  }

  function addEntry() {
    setIncomeEntries([...incomeEntries, { amount: '', currency: 'GBP' }]);
  }
```

With:

```javascript
  function updateEntry(index, field, value) {
    const updated = [...incomeEntries];
    updated[index] = { ...updated[index], [field]: value };
    setIncomeEntries(updated);
    markUserEdited('incomeEntries');
  }

  function removeEntry(index) {
    setIncomeEntries(incomeEntries.filter((_, i) => i !== index));
    markUserEdited('incomeEntries');
  }

  function addEntry() {
    setIncomeEntries([...incomeEntries, { amount: '', currency: 'GBP' }]);
    markUserEdited('incomeEntries');
  }
```

- [ ] **Step 6: Add the Smart Fill panel JSX — insert above `<div className="card">` (the form card)**

```jsx
      {/* Smart Fill panel */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <label style={{ marginBottom: '0.5rem', display: 'block', fontWeight: 600 }}>Smart Fill</label>
        <textarea
          rows={3}
          placeholder='Describe your situation in plain English, e.g. "I am a senior engineer in the US and want to buy a home in Colorado"'
          value={smartFillPrompt}
          onChange={e => setSmartFillPrompt(e.target.value)}
          style={{ marginBottom: '0.75rem' }}
        />
        <button
          type="button"
          className="btn"
          onClick={handleSmartFill}
          disabled={smartFillLoading || !smartFillPrompt.trim()}
        >
          {smartFillLoading ? 'Filling…' : 'Fill Form'}
        </button>
        {smartFillError && (
          <div style={{ marginTop: '0.5rem', color: '#856404', background: '#fff3cd', border: '1px solid #ffeeba', borderRadius: '4px', padding: '0.5rem 0.75rem', fontSize: '0.875rem' }}>
            {smartFillError}
          </div>
        )}
      </div>
```

- [ ] **Step 7: Add AI indicator to the `category` field**

Replace:

```jsx
          <label>Product Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)}>
```

With:

```jsx
          <label>
            Product Category
            {aiFilledFields.has('category') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
          </label>
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); markUserEdited('category'); }}
            style={aiFilledFields.has('category') ? { borderLeft: '3px solid #27ae60' } : {}}
          >
```

- [ ] **Step 8: Add AI indicator and `amountRef` to the `amount` field**

Replace:

```jsx
          <label>Amount (£)</label>
          <input
            type="number"
            placeholder="e.g. 200000 for a mortgage, 50000 for savings"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
```

With:

```jsx
          <label>
            Amount (£)
            {aiFilledFields.has('amount') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
          </label>
          <input
            ref={amountRef}
            type="number"
            placeholder="e.g. 200000 for a mortgage, 50000 for savings"
            value={amount}
            onChange={e => { setAmount(e.target.value); markUserEdited('amount'); }}
            required
            style={aiFilledFields.has('amount') ? { borderLeft: '3px solid #27ae60' } : {}}
          />
```

- [ ] **Step 9: Add AI indicator to the `incomeEntries` section label**

Replace:

```jsx
          <label>Annual Income After Taxes</label>
```

With:

```jsx
          <label>
            Annual Income After Taxes
            {aiFilledFields.has('incomeEntries') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
          </label>
```

Also add the AI border to the income input rows inside the `.map()`. Replace the income input's `style`:

```jsx
                style={{ flex: 1, minWidth: '140px' }}
```

With:

```jsx
                style={{ flex: 1, minWidth: '140px', ...(aiFilledFields.has('incomeEntries') ? { borderLeft: '3px solid #27ae60' } : {}) }}
```

- [ ] **Step 10: Add AI indicator to the `situation` field**

Replace:

```jsx
              <label>Your Financial Situation</label>
              <textarea
                rows={4}
                placeholder="Describe your situation: income, existing debts, credit score, savings, employment type, how long you plan to stay in the property, etc."
                value={situation}
                onChange={e => setSituation(e.target.value)}
              />
```

With:

```jsx
              <label>
                Your Financial Situation
                {aiFilledFields.has('situation') && <span style={{ color: '#27ae60', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✦ AI</span>}
              </label>
              <textarea
                rows={4}
                placeholder="Describe your situation: income, existing debts, credit score, savings, employment type, how long you plan to stay in the property, etc."
                value={situation}
                onChange={e => { setSituation(e.target.value); markUserEdited('situation'); }}
                style={aiFilledFields.has('situation') ? { borderLeft: '3px solid #27ae60' } : {}}
              />
```

- [ ] **Step 11: Run the backend test suite one final time to confirm nothing is broken**

```bash
cd backend && npm test
```

Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/pages/Recommendations.jsx && git commit -m "feat: add Smart Fill panel and AI field indicators to Recommendations"
```
