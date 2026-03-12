#!/usr/bin/env bash
# =============================================================================
# UK Financial Comparison Platform — Setup Script
# Run this once on a new machine to install all dependencies and configure
# the project. Works on Windows (Git Bash / MINGW64), macOS, and Linux.
# =============================================================================

set -e  # exit on first error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Colour

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# =============================================================================
# 1. DETECT OS
# =============================================================================
detect_os() {
  case "$(uname -s)" in
    Darwin*)  OS="mac";;
    Linux*)   OS="linux";;
    MINGW*|MSYS*|CYGWIN*) OS="windows";;
    *)        OS="unknown";;
  esac
  info "Detected OS: $OS"
}

# =============================================================================
# 2. INSTALL SYSTEM DEPENDENCIES
# =============================================================================

install_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node --version)
    success "Node.js already installed: $NODE_VER"
    # Warn if below v20
    MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
    if [ "$MAJOR" -lt 20 ]; then
      warn "Node.js $NODE_VER detected — v20+ recommended. Upgrade if you see issues."
    fi
    return
  fi

  info "Installing Node.js 20 LTS..."
  case $OS in
    mac)
      command -v brew &>/dev/null || error "Homebrew not found. Install it from https://brew.sh then re-run this script."
      brew install node@20
      brew link node@20 --force --overwrite
      ;;
    linux)
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
      ;;
    windows)
      if command -v winget &>/dev/null; then
        winget install OpenJS.NodeJS.LTS --silent
        warn "Node.js installed. You may need to restart your terminal for PATH to update."
      else
        error "winget not found. Please install Node.js 20 manually from https://nodejs.org then re-run this script."
      fi
      ;;
  esac
  success "Node.js installed."
}

install_aws_cli() {
  if command -v aws &>/dev/null; then
    success "AWS CLI already installed: $(aws --version 2>&1 | head -1)"
    return
  fi

  info "Installing AWS CLI..."
  case $OS in
    mac)
      brew install awscli
      ;;
    linux)
      curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
      unzip -q /tmp/awscliv2.zip -d /tmp/
      sudo /tmp/aws/install
      rm -rf /tmp/awscliv2.zip /tmp/aws
      ;;
    windows)
      if command -v winget &>/dev/null; then
        winget install Amazon.AWSCLI --silent
        warn "AWS CLI installed. Restart your terminal, then re-run setup."
      else
        error "Please install AWS CLI manually: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-windows.html"
      fi
      ;;
  esac
  success "AWS CLI installed."
}

install_sam_cli() {
  if command -v sam &>/dev/null; then
    success "AWS SAM CLI already installed: $(sam --version)"
    return
  fi

  # On Windows/Git Bash, sam.exe may be installed but not on the bash PATH
  if [ "$OS" = "windows" ] && [ -f "/c/Program Files/Amazon/AWSSAMCLI/runtime/Scripts/sam.exe" ]; then
    success "AWS SAM CLI already installed."
    warn "SAM CLI is not on your Git Bash PATH. Use PowerShell or Windows Terminal to run sam commands:"
    warn "  powershell.exe -Command \"sam build\""
    warn "  powershell.exe -Command \"sam local start-api --env-vars env.json\""
    return
  fi

  info "Installing AWS SAM CLI..."
  case $OS in
    mac)
      brew install aws-sam-cli
      ;;
    linux)
      curl -Lo /tmp/aws-sam-cli-linux-x86_64.zip \
        "https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip"
      unzip -q /tmp/aws-sam-cli-linux-x86_64.zip -d /tmp/sam-installation
      sudo /tmp/sam-installation/install
      rm -rf /tmp/aws-sam-cli-linux-x86_64.zip /tmp/sam-installation
      ;;
    windows)
      if command -v winget &>/dev/null; then
        # winget exits 43 (no upgrade available) or 0 (installed) — both are success
        winget install Amazon.SAM-CLI --silent || true
        warn "SAM CLI installed. Open a new PowerShell/Windows Terminal window to use it."
        warn "From Git Bash, prefix sam commands with: powershell.exe -Command \"sam ...\""
      else
        error "Please install SAM CLI manually: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html"
      fi
      ;;
  esac
  success "AWS SAM CLI installed."
}

check_docker() {
  if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    success "Docker is running."
  else
    warn "Docker not found or not running."
    warn "Docker is required for 'sam local start-api' (local testing only)."
    warn "Install Docker Desktop from: https://www.docker.com/products/docker-desktop/"
    warn "Skipping — you can still deploy to AWS without Docker."
  fi
}

# =============================================================================
# 3. CONFIGURE AWS CREDENTIALS
# =============================================================================

configure_aws() {
  if aws sts get-caller-identity &>/dev/null 2>&1; then
    success "AWS credentials already configured: $(aws sts get-caller-identity --query 'Account' --output text 2>/dev/null)"
    return
  fi

  echo ""
  warn "AWS credentials not configured."
  echo -e "You need an AWS account and IAM user with programmatic access."
  echo -e "Create credentials at: AWS Console → IAM → Users → Security credentials → Access keys"
  echo ""
  read -p "Do you want to configure AWS credentials now? [y/N] " CONFIGURE_AWS
  if [[ "$CONFIGURE_AWS" =~ ^[Yy]$ ]]; then
    aws configure
    success "AWS credentials configured."
  else
    warn "Skipping AWS configuration. Run 'aws configure' before deploying."
  fi
}

# =============================================================================
# 4. SET UP API KEYS (env.json)
# =============================================================================

setup_env() {
  ENV_FILE="$SCRIPT_DIR/env.json"

  if [ -f "$ENV_FILE" ]; then
    # Check if it still has placeholder values
    if grep -q "your_gemini_api_key_here\|your_exchange_rates_api_key_here" "$ENV_FILE" 2>/dev/null; then
      warn "env.json has placeholder values — let's fill them in."
    else
      success "env.json already configured."
      return
    fi
  fi

  echo ""
  info "Setting up API keys in env.json (used for local development only)..."
  echo ""
  echo -e "Get your ${BLUE}Gemini API key${NC} (free) from: https://aistudio.google.com/ → Get API key"
  read -p "Gemini API key: " GEMINI_KEY

  echo ""
  echo -e "Get your ${BLUE}Exchange Rates API key${NC} (free) from: https://exchangerate.host/ → Sign up"
  read -p "Exchange Rates API key: " EXCHANGE_KEY

  cat > "$ENV_FILE" <<EOF
{
  "FinancialApiFunction": {
    "GEMINI_API_KEY": "$GEMINI_KEY",
    "EXCHANGE_RATES_API_KEY": "$EXCHANGE_KEY",
    "CACHE_BUCKET_NAME": "local-test"
  }
}
EOF
  success "env.json created."
}

# =============================================================================
# 5. INSTALL NPM DEPENDENCIES
# =============================================================================

install_npm_deps() {
  info "Installing backend npm dependencies..."
  cd "$SCRIPT_DIR/backend"
  npm install
  success "Backend dependencies installed."

  info "Installing frontend npm dependencies..."
  cd "$SCRIPT_DIR/frontend"
  npm install
  success "Frontend dependencies installed."

  cd "$SCRIPT_DIR"
}

# =============================================================================
# 6. RUN BACKEND TESTS
# =============================================================================

run_tests() {
  info "Running backend tests..."
  cd "$SCRIPT_DIR/backend"
  if npm test; then
    success "All tests passed!"
  else
    error "Tests failed. Check the output above."
  fi
  cd "$SCRIPT_DIR"
}

# =============================================================================
# 7. SUMMARY
# =============================================================================

print_summary() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Setup complete!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  echo -e "${BLUE}Next steps:${NC}"
  echo ""
  echo -e "  ${YELLOW}Local development (requires Docker):${NC}"
  echo -e "    sam build"
  echo -e "    sam local start-api --env-vars env.json"
  echo -e "    # In another terminal:"
  echo -e "    cd frontend && npm start"
  echo ""
  echo -e "  ${YELLOW}Deploy to AWS (one-time guided setup):${NC}"
  echo -e "    sam build"
  echo -e "    sam deploy --guided"
  echo -e "    # Then follow prompts (stack: uk-financial-comparison, region: eu-west-2)"
  echo ""
  echo -e "  ${YELLOW}After deploying, build and upload the frontend:${NC}"
  echo -e "    cd frontend && npm run build"
  echo -e "    aws s3 sync build/ s3://\$(aws cloudformation describe-stacks \\"
  echo -e "      --stack-name uk-financial-comparison \\"
  echo -e "      --query \"Stacks[0].Outputs[?OutputKey=='FrontendBucketName'].OutputValue\" \\"
  echo -e "      --output text) --delete"
  echo ""
  echo -e "  See README.md for full documentation."
  echo ""
}

# =============================================================================
# MAIN
# =============================================================================

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  UK Financial Comparison — Setup Script${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

detect_os
install_node
install_aws_cli
install_sam_cli
check_docker
configure_aws
setup_env
install_npm_deps
run_tests
print_summary
