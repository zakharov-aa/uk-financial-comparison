# UK Financial Products Comparison Platform

> Serverless AWS application comparing UK financial products with AI-powered recommendations.
> Built with Node.js Lambda, React, Bank of England API, and Gemini AI.

---

## Features

- **Mortgage rates** — live Bank of England data with 6-month history chart
- **Exchange rates** — GBP vs USD, EUR, JPY with a built-in currency converter
- **Compare** — side-by-side mortgage comparison with monthly payment calculations (AI summary when available)
- **Recommendations** — rule-based or AI-powered (Gemini) mortgage/savings advice with multi-currency income support

---

## Architecture

```
Browser
   |
CloudFront (HTTPS CDN)
   |
S3 (React static)          S3 (API cache)
                                 ^
API Gateway (REST)               |
   |                             |
Lambda (Node.js 20)  -----------+
   |── GET /products/{category}  → Bank of England API (TTL: 24hr)
   |── POST /compare             → Exchange Rates API  (TTL: 6hr)
   └── GET /recommendations      → Gemini AI (optional, no cache)
                                 → CloudWatch (logging)
```

---

## Setup

### Prerequisites
- AWS account + AWS CLI configured (`aws configure`)
- AWS SAM CLI installed
- Node.js 20.x
- Docker (for local testing with `sam local`)

Run the setup script to install all dependencies automatically:

```bash
bash setup.sh
```

### API Keys Required
1. **Gemini API** (free): https://aistudio.google.com/
2. **Exchange Rates API** (free): https://exchangerate.host/

### Local Development

Create `env.json` in the project root:
```json
{
  "FinancialApiFunction": {
    "GEMINI_API_KEY": "your_key",
    "EXCHANGE_RATES_API_KEY": "your_key",
    "CACHE_BUCKET_NAME": "local-test"
  }
}
```

```bash
# Install backend deps and run tests
cd backend && npm install && npm test

# Build and start API locally on port 3001 (requires Docker)
cd .. && sam build
sam local start-api --env-vars env.json --port 3001
```

```bash
# Start React frontend in a separate terminal
cd frontend
echo "REACT_APP_API_URL=http://localhost:3001" > .env.local
npm install && npm start
```

### Deploy to AWS

**Option A — GitHub Actions (recommended):**

Push to `main` automatically runs the full deploy pipeline. See [CI/CD](#cicd) section for required secrets.

**Option B — Manual:**

```bash
sam build
sam deploy --guided
# Stack name: uk-financial-comparison
# Region: eu-west-2
# Enter your GeminiApiKey and ExchangeRatesApiKey when prompted
```

After deploy, note the `ApiUrl` output, then deploy the frontend:

```bash
cd frontend
echo "REACT_APP_API_URL=https://YOUR_API_ID.execute-api.eu-west-2.amazonaws.com/Prod" > .env.production
npm run build
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name uk-financial-comparison \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue" \
  --output text)
aws s3 sync build/ s3://$BUCKET --delete
```

---

## API Reference

### GET /products/{category}
Returns current rate data. Categories: `mortgages` | `exchange-rates` | `savings`

```bash
curl https://API_URL/products/mortgages
```

```json
{
  "data": {
    "current": { "twoYear": 4.56, "threeYear": 4.52, "fiveYear": 4.48 },
    "history": [...]
  },
  "meta": { "category": "mortgages", "stale": false }
}
```

### POST /compare
Compare mortgage products. Returns comparison table with monthly payments. AI summary is included when Gemini is available, omitted gracefully if quota is exceeded.

```bash
curl -X POST https://API_URL/compare \
  -H "Content-Type: application/json" \
  -d '{"category":"mortgages","criteria":{"amount":200000,"ltv":75}}'
```

### GET /recommendations
Rule-based or AI-powered recommendation. Supports multi-currency income entries.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `category` | string | `mortgages` | `mortgages` or `savings` |
| `amount` | number | — | Loan/savings amount in GBP |
| `useAI` | boolean | `false` | `true` to use Gemini AI |
| `situation` | string | — | Free-text description (AI mode only) |
| `incomeEntries` | JSON string | `[]` | Array of `{amount, currency}` objects |
| `bankAmount` | number | — | Current savings/deposit amount |
| `bankAmountCurrency` | string | `GBP` | Currency of `bankAmount` |

```bash
# Rule-based (no AI)
curl "https://API_URL/recommendations?category=mortgages&amount=200000&useAI=false&incomeEntries=[{\"amount\":60000,\"currency\":\"GBP\"}]"

# AI-powered with multi-currency income
curl "https://API_URL/recommendations?category=mortgages&amount=200000&useAI=true&situation=Good+credit&incomeEntries=[{\"amount\":50000,\"currency\":\"GBP\"},{\"amount\":12700,\"currency\":\"USD\"}]&bankAmount=30000"
```

---

## CI/CD

Push to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`):
1. Runs backend tests (76 passing)
2. SAM build + deploy to AWS
3. React build + S3 sync + CloudFront invalidation

**Required GitHub Secrets** (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `EXCHANGE_RATES_API_KEY` | exchangerate.host API key |
| `API_URL` | API Gateway URL — add after first successful deploy |

---

## Project Structure

```
uk-financial-comparison/
├── backend/
│   ├── src/
│   │   ├── index.js              # Lambda entry + router
│   │   ├── handlers/             # products, compare, recommendations
│   │   └── services/             # cache, boe, exchangeRates, gemini, basicRecommendation
│   └── tests/                    # Jest tests (76 passing)
├── frontend/
│   └── src/
│       ├── pages/                # Home, Products (+ converter), Compare, Recommendations
│       └── components/           # RateChart
├── setup.sh                      # One-command local setup
├── template.yaml                 # AWS SAM (Lambda + API GW + S3 + CloudFront)
└── .github/workflows/deploy.yml  # CI/CD
```
