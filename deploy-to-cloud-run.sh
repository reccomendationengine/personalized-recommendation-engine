#!/bin/bash

# Deployment script for Cloud Run
# This script will authenticate, build, and deploy the backend to Cloud Run

set -e  # Exit on error

# Configuration
PROJECT_ID="personalizedreceng"
SERVICE_NAME="recommendation-api"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting deployment to Cloud Run...${NC}"
echo ""

# Add gcloud to PATH if needed
export PATH=/opt/homebrew/bin:$PATH

# Step 1: Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed.${NC}"
    echo "Please install it first:"
    echo "  brew install google-cloud-sdk"
    exit 1
fi

echo -e "${GREEN}✅ gcloud CLI found${NC}"

# Step 2: Check authentication
echo ""
echo -e "${YELLOW}📋 Checking authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${YELLOW}⚠️  Not authenticated. Please authenticate now...${NC}"
    echo ""
    echo "A browser window will open for authentication."
    echo "If it doesn't open, visit the URL shown below."
    echo ""
    gcloud auth login
else
    echo -e "${GREEN}✅ Already authenticated${NC}"
    gcloud auth list --filter=status:ACTIVE --format="table(account,status)"
fi

# Step 3: Set project
echo ""
echo -e "${YELLOW}📋 Setting GCP project to ${PROJECT_ID}...${NC}"
gcloud config set project ${PROJECT_ID}
echo -e "${GREEN}✅ Project set${NC}"

# Step 4: Enable required APIs
echo ""
echo -e "${YELLOW}🔧 Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
echo -e "${GREEN}✅ APIs enabled${NC}"

# Step 5: Build the Docker image
echo ""
echo -e "${YELLOW}🏗️  Building Docker image...${NC}"
echo "This may take a few minutes..."
gcloud builds submit --tag ${IMAGE_NAME}

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
else
    echo -e "${RED}❌ Docker build failed${NC}"
    exit 1
fi

# Step 6: Deploy to Cloud Run
echo ""
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production" \
  --port 3000

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment successful!${NC}"
    echo ""
    
    # Get the service URL
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')
    
    echo -e "${GREEN}📍 Service URL: ${SERVICE_URL}${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Next steps:${NC}"
    echo "1. Update public/config.js with the Cloud Run URL:"
    echo "   CLOUD_RUN_API_URL = '${SERVICE_URL}'"
    echo ""
    echo "2. Set environment variables (if needed):"
    echo "   gcloud run services update ${SERVICE_NAME} --region ${REGION} --set-env-vars GEMINI_API_KEY=your-key-here"
    echo ""
    echo "3. Update firebase.json to add Cloud Run rewrites (optional)"
    echo ""
    echo "4. Redeploy frontend:"
    echo "   firebase deploy --only hosting"
    echo ""
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi

