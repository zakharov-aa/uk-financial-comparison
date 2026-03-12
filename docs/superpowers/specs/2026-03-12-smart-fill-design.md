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
  └── Page scrolls to the amount field if its value changed
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
- `incomeEntries` is an array of `{ amount, currency }` — one per income source mentioned; estimate realistically for role/location if not stated; currency must be one of `GBP`, `USD`, `EUR`, `JPY` (the only currencies the FX service supports) — use the closest supported currency for the described location. Despite this instruction, Gemini may occasionally return an unsupported currency (e.g. `"CHF"`); in that case `extractFields` passes it through unchanged — no validation or rejection at this stage — the existing `convertToGBP` guard in the Recommendations handler will throw if the currency is unsupported when the user submits for a recommendation, and the existing Recommendations error path covers this (no new frontend handling required)
- `situation` is a clean one-sentence summary of the user's description for later use in the AI recommendation
- Return **only** valid JSON — no markdown, no explanation

### New: `backend/src/handlers/extractFields.js`

1. Validate `prompt` param is non-empty — if missing or empty, throw `{ statusCode: 400, message: 'prompt is required' }`
2. Call `getAIAnalysis(buildExtractionPrompt(prompt))` — i.e. pass the return value of `buildExtractionPrompt` as the argument to `getAIAnalysis`
3. `JSON.parse` the response — if parsing fails, throw `{ statusCode: 422, message: 'extraction_failed' }`
4. If `amountCurrency` is missing, default it to `'GBP'`
5. If `amountCurrency !== 'GBP'`: import `fetchExchangeRates` from `../services/exchangeRates`, call it, and convert using `amount / fxData.rates[amountCurrency]`. The `fetchExchangeRates` return shape is `{ base, date, rates: { USD, EUR, JPY }, stale }` — access `fxData.rates`, not the top-level object. Rate direction: `fxData.rates.USD = 1.27` means £1 = $1.27 (foreign units per GBP), so dividing a foreign amount by the rate converts it to GBP. If `fxData.rates[amountCurrency]` is `undefined` (unsupported currency such as `"AUD"`), throw `{ statusCode: 422, message: 'extraction_failed' }`. If `fetchExchangeRates` throws (FX API down, no stale cache), re-throw as-is — `index.js` returns 500 to the client
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
| `amountCurrency` present but not in `fxData.rates` (e.g. `"AUD"`) | `{ statusCode: 422, message: 'extraction_failed' }` |
| FX API down (fetchExchangeRates throws) | Re-throw as-is — `index.js` returns 500 |
| Other Gemini/network error | Re-throw as-is — `index.js` returns 500 |

The frontend treats any non-200 response as a smart fill failure and shows the appropriate message (see Frontend section).

### New route in `index.js`

```javascript
const { handleExtractFields } = require('./handlers/extractFields');

// ...

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

When a field is populated by smart fill: green left-border + `✦ AI` badge next to label. `category` is a button-toggle control — apply the green left-border and badge to its section label (same treatment as other fields).

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

Declare `const amountRef = useRef(null)` in `Recommendations.jsx` and attach it to the amount `<input>` via `ref={amountRef}`. On successful fill, compare the extracted `amount` to `formState.amount` *before* calling the state update — if the values differ, call `amountRef.current?.scrollIntoView({ behavior: 'smooth' })` **synchronously in the same block immediately after the `setState` call** (no `useEffect` needed — the amount input DOM node is already mounted and never unmounts). If `amount` is unchanged or absent, do not scroll. There is no fallback scroll target — if `amount` did not change, no scroll occurs.

---

## Affected Files

| File | Change |
|------|--------|
| `backend/src/services/gemini.js` | Add `buildExtractionPrompt`; update `module.exports` from `{ buildMortgagePrompt, getAIAnalysis }` to `{ buildMortgagePrompt, buildExtractionPrompt, getAIAnalysis }` (additive — no existing imports break) |
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
- `incomeEntries` present but not an array (e.g. a string) → defaults to `[]`
- `incomeEntries` present with non-GBP currency (e.g. USD) → currencies passed through unchanged, no FX call made in `extractFields`
- `amountCurrency` present but unsupported (e.g. `"AUD"`) → throws 422 `extraction_failed`
- FX API throws → error propagates (not swallowed)

### `backend/tests/services/gemini.test.js` additions

**New `buildExtractionPrompt` describe block:**
- Includes the user's text in the returned prompt string
- Contains the word `"JSON"` (instructs Gemini to return JSON only)
- Contains `"mortgages"` and `"savings"` (documents the valid category values)
- Contains `"amountCurrency"` (ensures the currency field is requested)

**Fixes to existing `getAIAnalysis` describe block:**
- Add save/restore cleanup: `let originalKey; beforeEach(() => { originalKey = process.env.GEMINI_API_KEY; }); afterEach(() => { if (originalKey === undefined) { delete process.env.GEMINI_API_KEY; } else { process.env.GEMINI_API_KEY = originalKey; } })` — the second test leaves the key set after it runs, which can cause ordering-dependent failures in other test files; save/restore handles both clean environments and environments where the key is legitimately pre-set
- Add test: `generateContent` throws an error → `getAIAnalysis` rejects with that error (currently not tested, leaving the error propagation path uncovered)

---

## Out of Scope

- Bank amount is NOT filled by smart fill (too personal to estimate)
- No caching of extraction results
- No multi-turn conversation
- No frontend unit tests (the smart fill panel is thin UI logic; covered by the backend tests + manual verification)
- No prompt length validation — the only validation on the textarea is non-empty; extremely long prompts are passed through to Gemini as-is (Gemini will handle or reject them)
- No validation of `fetchExchangeRates` return shape — tests mock `fetchExchangeRates` to return the documented shape `{ rates: { USD, EUR, JPY } }`; malformed responses from the FX service are out of scope for these unit tests
