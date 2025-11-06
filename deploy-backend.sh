#!/bin/bash

# Configuration
PROJECT_ID="personalizedreceng"
SERVICE_NAME="recommendation-api"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Starting backend deployment to Cloud Run..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed. Please install it first."
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set the project
echo "📋 Setting GCP project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build the Docker image
echo "🏗️  Building Docker image..."
gcloud builds submit --tag ${IMAGE_NAME}

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
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

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')

echo ""
echo "✅ Backend deployed successfully!"
echo "📍 Service URL: ${SERVICE_URL}"
echo ""
echo "⚠️  Next steps:"
echo "1. Update your frontend API calls to use: ${SERVICE_URL}"
echo "2. Set environment variables in Cloud Run (GEMINI_API_KEY, etc.)"
echo "3. Update firebase.json rewrites to point to this service"
echo ""
echo "To set environment variables, run:"
echo "gcloud run services update ${SERVICE_NAME} --region ${REGION} --set-env-vars GEMINI_API_KEY=your-key-here"

