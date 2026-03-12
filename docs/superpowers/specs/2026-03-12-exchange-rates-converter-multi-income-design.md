# Design: Exchange Rates Converter, Multi-Currency Income, AI Mode Banner

**Date:** 2026-03-12
**Status:** Approved

---

## Overview

Three coordinated changes:
1. Add a manual currency converter to the exchange rates Products page.
2. Overhaul the Recommendations form: prominent AI mode banner at top, dynamic multi-entry income list with per-entry currency, bank amount currency selector.
3. Backend: accept multi-entry income, convert all non-GBP values to GBP using live exchange rates, remove the dead exchange-rates recommendation branch and `buildSavingsPrompt`.

---

## Frontend — `Products.jsx`

### Currency Converter Card
Rendered only when `category === 'exchange-rates'`, below the existing rates table.

**State (local to the converter):**
- `fromCurrency` — string, default `'GBP'`
- `toCurrency` — string, default `'USD'`
- `convertAmount` — string, number input value
- `converted` — number | null, computed live

**Currencies available:** GBP, USD, EUR, JPY (matching the three rates already fetched).

**Conversion logic (frontend, no extra API call):**
Rates on the page are GBP-based (`rates.USD`, `rates.EUR`, `rates.JPY`). GBP rate is implicitly `1`.

```
toGBP(amount, currency) = currency === 'GBP' ? amount : amount / rates[currency]
convert(amount, from, to) = toGBP(amount, from) * (to === 'GBP' ? 1 : rates[to])
```

**UI:** Two `<select>` dropdowns (From / To) + amount input. Result displayed live below as `X [FROM] = Y [TO]`, formatted to 4 decimal places. No submit button — recalculates on every input change.

---

## Frontend — `Recommendations.jsx`

### AI Mode Banner
Rendered at the very top of the page, above the form card.

- **AI on:** Green pill — "✓ Using AI (Gemini)"
- **AI off:** Grey pill — "Rule-based only"
- Clicking the banner toggles `useAI`. No separate checkbox inside the form.

### Income Entries
Replaces the single `annualIncome` + `annualIncomeCurrency` fields.

**State:** `incomeEntries` — array of `{ amount: string, currency: string }`, starts as `[{ amount: '', currency: 'GBP' }]`.

**UI per row:** number input + currency dropdown (GBP/USD/EUR/JPY) + "×" remove button (hidden on the last remaining row). Below the list: "+ Add income source" button appends `{ amount: '', currency: 'GBP' }`.

### Bank Amount
Single field with a currency dropdown next to it (GBP/USD/EUR/JPY, default GBP). State: `bankAmount` (string) + `bankAmountCurrency` (string, default `'GBP'`).

### Situation Textarea
Only rendered when `useAI` is true, unchanged otherwise.

### Category Dropdown
Remove `<option value="exchange-rates">Exchange Rates</option>`.

### Query Params Sent
```
category, amount, useAI
incomeEntries = JSON.stringify(incomeEntries.filter(e => e.amount !== ''))
bankAmount (if non-empty), bankAmountCurrency
situation (if useAI and non-empty)
```

### Button & Result heading
Unchanged from previous design — button label and result heading reflect `useAI` state.

---

## Backend — `handlers/recommendations.js`

### Removed
Delete the `if (category === 'exchange-rates')` branch entirely.

### New Parameters
```
incomeEntries  — JSON string, array of { amount, currency }; default '[]'
bankAmount     — string; default '0'
bankAmountCurrency — string; default 'GBP'
```
`annualIncome` and `annualIncomeCurrency` params removed.

### Currency Conversion Logic
```
parseIncomeEntries(raw):
  entries = JSON.parse(raw) or []
  return entries.map(e => ({ amount: Math.max(0, parseFloat(e.amount) || 0), currency: e.currency || 'GBP' }))

needsConversion(entries, bankCurrency):
  return entries.some(e => e.currency !== 'GBP') || bankCurrency !== 'GBP'

convertToGBP(amount, currency, rates):
  if currency === 'GBP': return amount
  return amount / rates[currency]  // rates are GBP→X so inverse is X→GBP

totalIncomeGBP(entries, rates):
  sum of convertToGBP(e.amount, e.currency, rates) for each entry
```

If `needsConversion` is true: call `fetchExchangeRates()` **once**. Otherwise skip it entirely.

### Handler flow
```
entries = parseIncomeEntries(incomeEntries)
parsedBank = Math.max(0, parseFloat(bankAmount) || 0)

if needsConversion(entries, bankAmountCurrency):
  fxData = await fetchExchangeRates()
  rates = fxData.rates  // { USD, EUR, JPY }
  parsedIncome = totalIncomeGBP(entries, rates)
  parsedBank = convertToGBP(parsedBank, bankAmountCurrency, rates)
else:
  parsedIncome = sum of entry.amount for each entry (all GBP)

// rest of handler unchanged — passes parsedIncome, parsedBank to AI/rule-based
```

---

## Backend — `services/gemini.js`

Delete `buildSavingsPrompt` function and its export. No other changes.

---

## Tests

### `tests/handlers/recommendations.test.js` — update
- Remove the `'returns recommendation for exchange-rates category'` test
- Remove `buildSavingsPrompt` from the gemini mock
- Add: `incomeEntries` JSON string parsed and summed (all GBP, no fx fetch)
- Add: single non-GBP income entry triggers fx fetch and converts correctly
- Add: multiple entries mixed currencies — fx fetched once, sum correct
- Add: bank amount in non-GBP converts correctly
- Add: both income and bank non-GBP — fx fetched exactly once
- Add: all GBP — `fetchExchangeRates` not called

### `tests/handlers/recommendations-no-ai.test.js` — update
- Replace `annualIncome` param with `incomeEntries` JSON string in all tests
- Verify rule-based path still receives correct converted GBP total

### `tests/services/gemini.test.js` — update
- Remove `buildSavingsPrompt` describe block entirely

---

## What Is Not Changing
- `services/exchangeRates.js` — no changes
- `services/basicRecommendation.js` — no changes (receives already-converted GBP values)
- `services/gemini.js` `buildMortgagePrompt` — no changes
- `services/boe.js` — no changes
- All other pages (Home, Compare)
- API route, response shape, HTTP status codes
