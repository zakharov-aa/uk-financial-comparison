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
  ├── buildExtractionPrompt(text)
  ├── getAIAnalysis(prompt)         ← existing function
  ├── JSON.parse(response)
  ├── fetchExchangeRates() if amount not in GBP
  └── return { category, amount, incomeEntries, situation }
      │
      ▼
Frontend populates form fields
  └── AI-filled fields show green left-border + "✦ AI" badge
  └── User edits → badge removed from that field
```

---

## Backend

### New: `buildExtractionPrompt(text)` in `gemini.js`

Constructs a prompt instructing Gemini to return **only** a JSON object (no markdown, no explanation) with this shape:

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
- Use explicit numbers from the text if present; otherwise estimate realistically for the described role/location
- `category` must be `"mortgages"` or `"savings"`
- `amountCurrency` is the natural currency for the described location (e.g. `"USD"` for US, `"GBP"` for UK)
- `incomeEntries` is an array — one entry per income source mentioned
- `situation` is a clean summary of the user's description for use in the AI recommendation later
- Return **only** valid JSON — no prose, no markdown fences

### New: `backend/src/handlers/extractFields.js`

1. Call `buildExtractionPrompt(prompt)` → `getAIAnalysis(prompt)`
2. `JSON.parse` the response — if parsing fails, throw a clean `extraction_failed` error
3. If `amountCurrency` is not `"GBP"`: call `fetchExchangeRates()` and convert `amount` to GBP
4. Return:

```json
{
  "category": "mortgages",
  "amount": 258000,
  "incomeEntries": [{ "amount": 150000, "currency": "USD" }],
  "situation": "Senior software engineer in Colorado buying a first home"
}
```

### Error handling in handler

| Error | Response |
|-------|----------|
| Gemini 429 | `{ "error": "quota_exceeded" }` with status 429 |
| JSON parse failure | `{ "error": "extraction_failed" }` with status 422 |
| Other Gemini error | `{ "error": "extraction_failed" }` with status 500 |

### New route in `index.js`

```
GET /extract-fields?prompt=<text>
```

### Tests (`backend/tests/handlers/extractFields.test.js`)

- Valid prompt → returns correctly shaped object with all fields
- Amount in USD → `fetchExchangeRates` called once, amount converted to GBP
- Amount already in GBP → `fetchExchangeRates` NOT called
- Gemini returns malformed JSON → returns `extraction_failed` error
- Gemini throws 429 → returns `quota_exceeded` error
- `buildExtractionPrompt` includes the user's text in the returned string

---

## Frontend

### Smart Fill panel (top of `Recommendations.jsx`)

A panel above the form with a textarea and "Fill Form" button. Always visible regardless of AI mode toggle.

**States:**

| State | UI |
|-------|----|
| Idle | Textarea + "Fill Form" button |
| Loading | Button shows spinner, button disabled |
| Quota exceeded | Amber message: "AI quota exceeded — please fill in the fields manually" |
| Other error | Amber message: "Smart fill unavailable — please fill in the fields manually" |
| Success | Form fields populated, panel stays visible for re-use |

### AI-filled field indicators

When a field is populated by smart fill:
- Green left-border on the input/select
- Small `✦ AI` badge next to the field label

When the user manually edits an AI-filled field:
- Badge and green border are removed from that field only
- Other AI-filled fields retain their indicators

### Form scroll behaviour

On successful fill, the page scrolls down to the first populated field so the user immediately sees the result.

### State shape

```javascript
// Track which fields were AI-filled
const [aiFilledFields, setAiFilledFields] = useState(new Set());

// Clear AI indicator when user edits a field
function handleFieldChange(fieldName, value) {
  setAiFilledFields(prev => { const next = new Set(prev); next.delete(fieldName); return next; });
  // ... update field value
}
```

---

## Affected Files

| File | Change |
|------|--------|
| `backend/src/services/gemini.js` | Add `buildExtractionPrompt` |
| `backend/src/handlers/extractFields.js` | New handler |
| `backend/src/index.js` | Add `GET /extract-fields` route |
| `backend/tests/handlers/extractFields.test.js` | New test file |
| `backend/tests/services/gemini.test.js` | Add `buildExtractionPrompt` tests |
| `frontend/src/pages/Recommendations.jsx` | Add smart fill panel + AI field indicators |

---

## Out of Scope

- Bank amount is NOT filled by smart fill (too personal to estimate)
- No caching of extraction results
- No multi-turn conversation
