# Design: Recommendations Extended Fields & Rule-Based Fallback

**Date:** 2026-03-12
**Status:** Approved

---

## Overview

Extend the AI Recommendations feature with two optional financial input fields and a rule-based recommendation mode. The new fields and a "Use AI" toggle appear only after an error occurs and remain visible permanently once shown. When AI is disabled, the backend produces a rule-based recommendation using standard UK mortgage guidelines instead of calling Gemini.

The `useAI` toggle and rule-based path apply **only** to `category=mortgages` and `category=savings`. When `category=exchange-rates`, the `useAI` param is ignored and the AI path always runs.

---

## Frontend — `Recommendations.jsx`

### New State
- `hasError` — boolean, starts `false`, set to `true` on first error, never reset
- `useAI` — boolean, starts `true`
- `annualIncome` — string, number input value, starts `''`
- `bankAmount` — string, number input value, starts `''`

### Conditional UI (renders when `hasError === true`)
Shown below the error message and stays visible permanently:

1. **Annual Income After Taxes (£)** — `<input type="number" min="0">`, optional
2. **Current Amount in the Bank (£)** — `<input type="number" min="0">`, optional
3. **Use AI Recommendation** — `<input type="checkbox">`, **checked by default**

> UX note: the checkbox defaults to checked even when first revealed after an error, so the user can choose to retry with AI or uncheck to use the rule-based fallback. This is intentional.

### Query Params Sent
All four new values appended to the existing `/recommendations` request:
- `annualIncome` — only sent if non-empty
- `bankAmount` — only sent if non-empty
- `useAI` — always sent as `"true"` or `"false"`

### Error Handling
Existing `res.ok` check already in place. On any error: `setHasError(true)`, display the error message. New fields appear alongside or below the error.

---

## Backend — `handlers/recommendations.js`

### New Parameters
`handleRecommendations` destructures three new optional query params:
- `annualIncome` — parsed with `parseFloat`, clamped to `>= 0`, defaults to `0`
- `bankAmount` — parsed with `parseFloat`, clamped to `>= 0`, defaults to `0`
- `useAI` — string, defaults to `"true"`

Clamping rule: `const parsedIncome = Math.max(0, parseFloat(annualIncome) || 0)` (same for bankAmount).

### Routing Logic

```
// exchange-rates always uses AI regardless of useAI param
if category === 'exchange-rates':
    prompt = buildSavingsPrompt(rateData, parsedAmount)
    recommendation = await getAIAnalysis(prompt)

// mortgages and savings respect useAI
else if useAI === "false":
    recommendation = buildBasicRecommendation(rateData, parsedAmount, parsedIncome, parsedBank)
else:
    prompt = buildMortgagePrompt(rateData, parsedAmount, situation, parsedIncome, parsedBank)
    recommendation = await getAIAnalysis(prompt)
```

Note: `situation` (free-text field) is intentionally not passed to `buildBasicRecommendation`. The rule-based path uses only the numeric inputs; free text is an AI concern.

Response shape is unchanged — `{ recommendation, currentRates, generatedAt, category }`.

---

## Backend — `services/gemini.js`

### Updated `buildMortgagePrompt` signature
```js
function buildMortgagePrompt(rateData, amount, situation, annualIncome = 0, bankAmount = 0)
```

When `annualIncome > 0` or `bankAmount > 0`, append to the `USER SITUATION` block:
```
- Annual income after taxes: £{annualIncome.toLocaleString('en-GB')}
- Current savings / bank balance: £{bankAmount.toLocaleString('en-GB')}
```
If both are `0` (not provided), nothing is appended. No other change to the prompt or Gemini call.

---

## Backend — `services/basicRecommendation.js` (new file)

### `buildBasicRecommendation(rateData, amount, annualIncome, bankAmount)`

**1. Affordability check** — skipped entirely if `annualIncome === 0`
- `maxBorrowing = annualIncome × 4.5`
- If `amount > maxBorrowing`: flag as "exceeds standard affordability"

**2. LTV calculation** — skipped if `bankAmount === 0`
- Property value estimate = `amount + bankAmount` (treating bank balance as deposit)
- `ltv = (amount / propertyValue) × 100`
- LTV bracket → rate selection from `rateData.current`:

| LTV | Rate field used | Label |
|-----|----------------|-------|
| ≤ 60% | `rateData.current.twoYear` | best available |
| ≤ 75% | `rateData.current.threeYear` | standard |
| ≤ 85% | `rateData.current.fiveYear` | higher rate tier |
| > 85% | `rateData.current.fiveYear` | highest rate tier; output must include the sentence "Note: LTV above 85% — lenders may require a larger deposit or impose stricter affordability criteria." |

**3. Rate trend analysis**
- Uses `rateData.history` (last 6 entries via `.slice(-6)`)
- `diff = history[0].twoYear - history[history.length - 1].twoYear`
  (oldest entry minus newest entry; positive = rates have fallen)
- `diff > 0.1` → rates falling → lean toward 2-year fix (capture re-fix at lower rate sooner)
- `diff <= 0.1` → rates rising or stable → lean toward 5-year fix (lock in before further rises)

**4. Output**
Returns a plain-English string with four sections:
1. Recommendation (fix type and term)
2. Key supporting factors (affordability, LTV, trend — each omitted if data not provided)
3. Main risks
4. Plain-English summary (2–3 sentences)

Same narrative format as Gemini output so the frontend renders identically.

---

## Tests

**`tests/services/basicRecommendation.test.js`** (new)
- Affordability within limit
- Affordability exceeded
- Affordability skipped when `annualIncome === 0`
- LTV ≤ 60%: quotes twoYear rate
- LTV ≤ 75%: quotes threeYear rate
- LTV ≤ 85%: quotes fiveYear rate
- LTV > 85%: quotes fiveYear rate + output contains "LTV above 85%"
- LTV skipped when `bankAmount === 0`
- Rate trend falling (diff > 0.1): recommends 2-year fix
- Rate trend stable/rising: recommends 5-year fix

**`tests/services/gemini.test.js`** — add cases:
- `buildMortgagePrompt` includes income/bank lines when both > 0
- `buildMortgagePrompt` omits extra lines when both are 0

**`tests/handlers/recommendations.test.js`** — add cases:
- `useAI=false` routes to `buildBasicRecommendation` for mortgages
- `useAI=false` still calls Gemini for `exchange-rates`
- `useAI=true` (default) calls Gemini for mortgages
- Negative `annualIncome` clamped to 0
- Negative `bankAmount` clamped to 0

---

## What Is Not Changing

- API route, response shape, and HTTP status codes
- Gemini model or any other prompt logic
- All other pages and services
- Error handling in `index.js`
- `situation` free-text field behaviour for AI path
