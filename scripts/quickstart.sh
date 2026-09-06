#!/bin/bash
# CashNet Quick Start Script
# Trains models, starts services, and runs tests

set -e

echo "=========================================="
echo "  CashNet Quick Start Setup"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Change to project root
cd "$(dirname "$0")/.."

echo -e "${YELLOW}Step 1: Creating directories...${NC}"
mkdir -p models artifacts/api-server/dist artifacts/cashnet/dist

echo -e "${YELLOW}Step 2: Training models...${NC}"
python scripts/train_and_package_models.py

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Models trained successfully${NC}"
else
    echo -e "${RED}✗ Model training failed${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 3: Building backend...${NC}"
cd artifacts/api-server
npm install
npm run build
cd ../..

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend built successfully${NC}"
else
    echo -e "${RED}✗ Backend build failed${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 4: Building frontend...${NC}"
cd artifacts/cashnet
npm install
npm run build
cd ../..

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Frontend built successfully${NC}"
else
    echo -e "${RED}✗ Frontend build failed${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 5: Installing Python dependencies...${NC}"
pip install -r requirements.txt
pip install flask flask-cors

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Python dependencies installed${NC}"
else
    echo -e "${RED}✗ Python dependencies installation failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=========================================="
echo "  Setup Complete! ✓"
echo "==========================================${NC}"
echo ""

echo "Next steps:"
echo ""
echo "Option 1: Run with Docker Compose"
echo "  docker-compose up"
echo ""
echo "Option 2: Run services individually"
echo "  Terminal 1: npm start (from artifacts/api-server)"
echo "  Terminal 2: npm start (from artifacts/cashnet)"
echo "  Terminal 3: python scripts/model_server.py"
echo ""
echo "After services start:"
echo "  • API: http://localhost:3000/api"
echo "  • Models: http://localhost:5000"
echo "  • Frontend: http://localhost:3000"
echo ""
echo "For deployment on Render:"
echo "  1. Push to GitHub: git push origin main"
echo "  2. Follow DEPLOYMENT_GUIDE.md"
echo ""
