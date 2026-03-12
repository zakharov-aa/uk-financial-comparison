# Design: Recommendations Extended Fields & Rule-Based Fallback

**Date:** 2026-03-12
**Status:** Approved

---

## Overview

Extend the AI Recommendations feature with two optional financial input fields and a rule-based recommendation mode. The new fields and a "Use AI" toggle appear only after an error occurs and remain visible permanently once shown. When AI is disabled, the backend produces a rule-based recommendation using standard UK mortgage guidelines instead of calling Gemini.

---

## Frontend — `Recommendations.jsx`

### New State
- `hasError` — boolean, starts `false`, set to `true` on first error, never reset
- `useAI` — boolean, starts `true`
- `annualIncome` — string, number input value
- `bankAmount` — string, number input value

### Conditional UI (renders when `hasError === true`)
Shown below the error message and stays visible permanently:

1. **Annual Income After Taxes (£)** — `<input type="number">`, optional
2. **Current Amount in the Bank (£)** — `<input type="number">`, optional
3. **Use AI Recommendation** — `<input type="checkbox">`, checked by default

### Query Params Sent
All four new values appended to the existing `/recommendations` request:
- `annualIncome` (if non-empty)
- `bankAmount` (if non-empty)
- `useAI` — `"true"` or `"false"`

### Error Handling
Existing `res.ok` check already in place. On any error: set `hasError(true)`, display the error message. New fields appear alongside or below the error.

---

## Backend — `handlers/recommendations.js`

### New Parameters
`handleRecommendations` destructures two new optional query params:
- `annualIncome` — parsed with `parseFloat`, defaults to `0`
- `bankAmount` — parsed with `parseFloat`, defaults to `0`
- `useAI` — string, defaults to `"true"`

### Routing Logic
```
if useAI === "false":
    recommendation = buildBasicRecommendation(rateData, parsedAmount, parsedIncome, parsedBank)
else:
    prompt = buildMortgagePrompt(rateData, parsedAmount, situation, parsedIncome, parsedBank)
    recommendation = await getAIAnalysis(prompt)
```

Response shape is unchanged — `{ recommendation, currentRates, generatedAt, category }`.

---

## Backend — `services/gemini.js`

### `buildMortgagePrompt` update
When `annualIncome` or `bankAmount` are provided (> 0), append to the `USER SITUATION` block:
```
- Annual income after taxes: £{annualIncome}
- Current savings / bank balance: £{bankAmount}
```
No change to the rest of the prompt or the Gemini model call.

---

## Backend — `services/basicRecommendation.js` (new file)

### `buildBasicRecommendation(rateData, amount, annualIncome, bankAmount)`

**Affordability check**
- Max borrowing = `annualIncome × 4.5` (standard UK lender multiplier)
- Flag if `amount > maxBorrowing`

**LTV calculation** (when `bankAmount > 0`)
- Property value estimate = `amount + bankAmount` (treating bank balance as deposit)
- LTV = `amount / propertyValue × 100`
- LTV brackets → rate selection:
  - ≤ 60% → best available rate (typically lowest)
  - ≤ 75% → standard rate
  - ≤ 85% → higher rate
  - > 85% → highest rate, flag additional risk

**Rate trend analysis**
- Compare oldest and newest entries in `rateData.history` (last 6 months)
- Falling trend (diff > 0.1%) → lean toward 2-year fix
- Rising/stable trend → lean toward 5-year fix

**Output**
Returns a plain-English string structured as:
1. Recommendation (fix type and term)
2. Key supporting factors (affordability, LTV, trend)
3. Main risks
4. Plain-English summary (2–3 sentences)

Same format as Gemini output so the frontend renders identically.

---

## Tests

- `tests/services/basicRecommendation.test.js` — unit tests for:
  - Affordability within limit
  - Affordability exceeded
  - LTV brackets (each of four)
  - Rate trend (falling vs rising)
  - Missing income/bankAmount (graceful defaults)
- `tests/handlers/recommendations.test.js` — add cases for:
  - `useAI=false` routes to basic recommendation
  - `useAI=true` (default) still calls Gemini
  - `annualIncome`/`bankAmount` included in prompt when provided

---

## What Is Not Changing

- API route, response shape, and HTTP status codes
- Gemini model or prompt structure (only USER SITUATION block extended)
- All other pages and services
- Error handling in `index.js`
