# UK Financial Products Comparison Platform

> Serverless AWS application comparing UK financial products with AI-powered recommendations.
> Built with Node.js Lambda, React, Bank of England API, and Gemini AI.

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
   └── GET /recommendations      → Gemini AI (no cache)
                                 → CloudWatch (logging)
```

## Setup

### Prerequisites
- AWS account + AWS CLI configured (`aws configure`)
- AWS SAM CLI installed
- Node.js 20.x
- Docker (for local testing with `sam local`)

### API Keys Required
1. **Gemini API** (free): https://aistudio.google.com/
2. **Exchange Rates API** (free): https://exchangerate.host/

### Local Development

```bash
# Install backend deps and run tests
cd backend && npm install && npm test

# Start API locally (requires Docker)
cd .. && sam build
sam local start-api --env-vars env.json
```

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
# Start React frontend (in a separate terminal)
cd frontend && npm start
# Set REACT_APP_API_URL=http://localhost:3000 in frontend/.env.local
```

### Deploy to AWS

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
Compare products with AI summary.

```bash
curl -X POST https://API_URL/compare \
  -H "Content-Type: application/json" \
  -d '{"category":"mortgages","criteria":{"amount":200000,"ltv":75}}'
```

### GET /recommendations
AI-powered recommendation based on your situation.

```bash
curl "https://API_URL/recommendations?category=mortgages&amount=200000&situation=Good+credit+75+LTV"
```

## CI/CD

Push to `main` triggers GitHub Actions:
1. Runs backend tests
2. SAM build + deploy
3. React build + S3 sync + CloudFront invalidation

**Required GitHub Secrets:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GEMINI_API_KEY`
- `EXCHANGE_RATES_API_KEY`
- `API_URL` (set after first manual deploy)

## Project Structure

```
uk-financial-comparison/
├── backend/
│   ├── src/
│   │   ├── index.js              # Lambda entry + router
│   │   ├── handlers/             # products, compare, recommendations
│   │   └── services/             # cache, boe, exchangeRates, gemini
│   └── tests/                    # Jest tests (42 passing)
├── frontend/
│   └── src/
│       ├── pages/                # Home, Products, Compare, Recommendations
│       └── components/           # RateChart
├── template.yaml                 # AWS SAM (Lambda + API GW + S3 + CloudFront)
└── .github/workflows/deploy.yml  # CI/CD
```
