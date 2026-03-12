# Smart Fill — Natural Language Form Auto-Fill Design

**Date:** 2026-03-12
**Feature:** Natural language input that uses Gemini to extract and pre-fill Recommendations form fields

---

## Goal

Allow users to describe their situation in plain English (e.g. "I'm a senior engineer in the US and want to buy a home in Colorado") and have Gemini automatically fill in the Recommendations form fields. If Gemini is unavailable or quota-exceeded, the user fills the form manually as before.

---

## Architecture

```
User types prompt
      │
      ▼
Frontend: GET /extract-fields?prompt=...
      │
      ▼
extractFields handler
  ├── validate prompt (non-empty)
  ├── buildExtractionPrompt(text)      ← new, in gemini.js
  ├── getAIAnalysis(extractionPrompt)  ← existing
  ├── JSON.parse(response)
  ├── if amountCurrency !== 'GBP':
  │     fetchExchangeRates()           ← from services/exchangeRates.js
  │     convert amount to GBP
  └── return { category, amount, incomeEntries, situation }
      │
      ▼
Frontend populates form fields
  └── AI-filled fields: green left-border + "✦ AI" badge next to label
  └── User edits a field → badge + border removed from that field only
  └── Page scrolls to first field whose value changed (excluding category)
```

---

## Backend

### `buildExtractionPrompt(text)` — new function in `backend/src/services/gemini.js`

Constructs a prompt instructing Gemini to return **only** a JSON object — no markdown fences, no prose — with this exact shape:

```json
{
  "category": "mortgages",
  "amount": 320000,
  "amountCurrency": "USD",
  "incomeEntries": [{ "amount": 150000, "currency": "USD" }],
  "situation": "Senior software engineer in Colorado buying a first home"
}
```

Rules embedded in the prompt:
- `category` must be exactly `"mortgages"` or `"savings"` — infer from context, default to `"mortgages"`
- `amount` is the loan or savings amount; use explicit number if stated, otherwise estimate realistically for the described location/property type
- `amountCurrency` is the natural currency for the described location (e.g. `"USD"` for US, `"GBP"` for UK, `"EUR"` for Eurozone); default to `"GBP"` if unclear
- `incomeEntries` is an array of `{ amount, currency }` — one per income source mentioned; estimate realistically for role/location if not stated; use the location's natural currency
- `situation` is a clean one-sentence summary of the user's description for later use in the AI recommendation
- Return **only** valid JSON — no markdown, no explanation

### New: `backend/src/handlers/extractFields.js`

1. Validate `prompt` param is non-empty — if missing or empty, throw `{ statusCode: 400, message: 'prompt is required' }`
2. Call `getAIAnalysis(buildExtractionPrompt(prompt))` — i.e. pass the return value of `buildExtractionPrompt` as the argument to `getAIAnalysis`
3. `JSON.parse` the response — if parsing fails, throw `{ statusCode: 422, message: 'extraction_failed' }`
4. If `amountCurrency` is missing, default it to `'GBP'`
5. If `amountCurrency !== 'GBP'`: import `fetchExchangeRates` from `../services/exchangeRates` and convert `amount` to GBP using `amount / rates[amountCurrency]`
6. If `incomeEntries` is missing or not an array, default to `[]` — income entries are **left in their original currency** (the Recommendations handler already converts them server-side)
7. Return:

```json
{
  "category": "mortgages",
  "amount": 258000,
  "incomeEntries": [{ "amount": 150000, "currency": "USD" }],
  "situation": "Senior software engineer in Colorado buying a first home"
}
```

### Error handling

All errors are **thrown** (not returned directly) so the existing centralised handler in `index.js` catches and formats them consistently:

| Scenario | Throw |
|----------|-------|
| Missing/empty `prompt` | `{ statusCode: 400, message: 'prompt is required' }` |
| Gemini 429 | Re-throw as-is — `index.js` catches `err.status === 429` and returns `"AI service quota exceeded"` |
| JSON parse failure | `{ statusCode: 422, message: 'extraction_failed' }` |
| Other Gemini/network error | Re-throw as-is — `index.js` returns 500 |

The frontend treats any non-200 response as a smart fill failure and shows the appropriate message (see Frontend section).

### New route in `index.js`

```javascript
} else if (method === 'GET' && path === '/extract-fields') {
  response = await handleExtractFields(event.queryStringParameters || {});
}
```

---

## Frontend

### Smart Fill panel (`Recommendations.jsx`)

A panel above the form, always visible regardless of AI mode toggle. Contains a textarea and "Fill Form" button.

**UI states:**

| State | UI |
|-------|----|
| Idle | Textarea + enabled "Fill Form" button |
| Loading | Button shows "Filling…" and is disabled |
| Quota exceeded (HTTP 429) | Amber message: "AI quota exceeded — please fill in the fields manually" |
| Other error (non-200) | Amber message: "Smart fill unavailable — please fill in the fields manually" |
| Success | Form fields populated; panel stays visible for re-use |

### AI-filled field indicators

**State shape:**
```javascript
const [aiFilledFields, setAiFilledFields] = useState(new Set());
// Keys: 'category', 'amount', 'incomeEntries', 'situation'
// incomeEntries is tracked as a single key for the whole array
```

When a field is populated by smart fill: green left-border + `✦ AI` badge next to label.

When user manually edits a field:
```javascript
function markUserEdited(fieldName) {
  setAiFilledFields(prev => {
    const next = new Set(prev);
    next.delete(fieldName);
    return next;
  });
}
```

The `incomeEntries` indicator (border + badge on the section label) clears as soon as the user adds, removes, or edits any income row.

### Scroll behaviour

On successful fill, scroll to the `amount` input (first meaningfully-changed numeric field), not `category` (which defaults to mortgages and may not have changed).

---

## Affected Files

| File | Change |
|------|--------|
| `backend/src/services/gemini.js` | Add `buildExtractionPrompt`; export it |
| `backend/src/handlers/extractFields.js` | New handler |
| `backend/src/index.js` | Add `GET /extract-fields` route |
| `backend/tests/handlers/extractFields.test.js` | New test file (see below) |
| `backend/tests/services/gemini.test.js` | Add `buildExtractionPrompt` tests + fix existing gaps (see below) |
| `frontend/src/pages/Recommendations.jsx` | Add smart fill panel + AI field indicators |

---

## Tests

### `backend/tests/handlers/extractFields.test.js` (new)

- Valid prompt → returns `{ category, amount, incomeEntries, situation }` with correct shape
- Amount in USD → `fetchExchangeRates` called once, `amount` converted to GBP correctly
- Amount already in GBP → `fetchExchangeRates` NOT called
- Missing `prompt` param → throws 400 `prompt is required`
- Empty string `prompt` → throws 400 `prompt is required`
- Gemini returns malformed JSON → throws 422 `extraction_failed`
- Gemini throws 429 → error propagates (not swallowed)
- `amountCurrency` absent from Gemini response → defaults to `'GBP'`, no FX call
- `incomeEntries` absent from Gemini response → defaults to `[]`

### `backend/tests/services/gemini.test.js` additions

**New `buildExtractionPrompt` describe block:**
- Includes the user's text in the returned prompt string
- Contains the word `"JSON"` (instructs Gemini to return JSON only)
- Contains `"mortgages"` and `"savings"` (documents the valid category values)
- Contains `"amountCurrency"` (ensures the currency field is requested)

**Fixes to existing `getAIAnalysis` describe block:**
- Add `afterEach(() => { delete process.env.GEMINI_API_KEY; })` — current tests delete the key but don't restore it, which can cause ordering-dependent failures
- Add test: `generateContent` throws an error → `getAIAnalysis` rejects with that error (currently not tested, leaving the error propagation path uncovered)

---

## Out of Scope

- Bank amount is NOT filled by smart fill (too personal to estimate)
- No caching of extraction results
- No multi-turn conversation
- No frontend unit tests (the smart fill panel is thin UI logic; covered by the backend tests + manual verification)
