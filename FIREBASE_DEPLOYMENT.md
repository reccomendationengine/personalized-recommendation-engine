# Firebase Deployment Guide

## ✅ Current Status

**Frontend (Static Files)**: ✅ Deployed to Firebase Hosting
- **URL**: https://personalizedreceng.web.app
- **Status**: Live and accessible

**Backend (API Server)**: ⚠️ Needs deployment to Cloud Run

## 📋 Prerequisites

1. **Firebase CLI** (already installed) ✅
2. **Google Cloud SDK** (needs installation) ⚠️
   - Download from: https://cloud.google.com/sdk/docs/install
   - Or install via Homebrew: `brew install google-cloud-sdk`

## 🚀 Deployment Steps

### Step 1: Install Google Cloud SDK

**macOS (Homebrew):**
```bash
brew install google-cloud-sdk
```

**Or download installer:**
- Visit: https://cloud.google.com/sdk/docs/install
- Follow the installation instructions for your OS

### Step 2: Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project personalizedreceng
```

### Step 3: Deploy Backend to Cloud Run

```bash
# Make the deployment script executable (if not already)
chmod +x deploy-backend.sh

# Run the deployment script
./deploy-backend.sh
```

**Or manually:**

```bash
# Set variables
export PROJECT_ID=personalizedreceng
export SERVICE_NAME=recommendation-api
export REGION=us-central1

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and deploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,GEMINI_API_KEY=your-gemini-api-key-here"
```

### Step 4: Update Frontend API Configuration

After deploying the backend, you'll get a Cloud Run URL (e.g., `https://recommendation-api-xxxxx.run.app`).

Update the frontend to use this URL:

1. Create a config file: `public/config.js`
2. Update API calls in your frontend JavaScript to use the Cloud Run URL

### Step 5: Update Firebase Hosting Rewrites (Optional)

If you want to proxy API calls through Firebase Hosting:

1. Update `firebase.json` to include Cloud Run rewrites
2. Redeploy: `firebase deploy --only hosting`

## 🔧 Environment Variables

Set these in Cloud Run:

```bash
gcloud run services update recommendation-api \
  --region us-central1 \
  --set-env-vars "GEMINI_API_KEY=your-key-here,NODE_ENV=production"
```

## 📝 Important Notes

### Database Storage
- **Current**: SQLite file in ephemeral storage (data is lost when container restarts)
- **Production**: Consider migrating to Cloud SQL or Firestore

### File Uploads
- **Current**: Files stored in `uploads/` directory (ephemeral)
- **Production**: Use Cloud Storage for persistent file storage

### Session Storage
- **Current**: In-memory sessions (lost on restart)
- **Production**: Use Redis (Cloud Memorystore) for distributed sessions

## 🔄 Redeploy Frontend

After making changes to frontend files:

```bash
firebase deploy --only hosting
```

## 🔄 Redeploy Backend

After making changes to backend code:

```bash
./deploy-backend.sh
```

Or manually:

```bash
gcloud builds submit --tag gcr.io/personalizedreceng/recommendation-api
gcloud run deploy recommendation-api \
  --image gcr.io/personalizedreceng/recommendation-api \
  --region us-central1
```

## 🌐 Access Your Application

- **Frontend**: https://personalizedreceng.web.app
- **Backend API**: (Will be shown after Cloud Run deployment)

## 🆘 Troubleshooting

### Build fails
- Check Dockerfile syntax
- Verify all dependencies in package.json
- Check build logs: `gcloud builds list`

### Deployment fails
- Verify you're authenticated: `gcloud auth list`
- Check project: `gcloud config get-value project`
- Verify APIs are enabled

### API not accessible
- Check Cloud Run service status: `gcloud run services list`
- Verify service is public: `gcloud run services describe recommendation-api --region us-central1`
- Check service logs: `gcloud run services logs read recommendation-api --region us-central1`

## 📚 Additional Resources

- [Firebase Hosting Docs](https://firebase.google.com/docs/hosting)
- [Cloud Run Docs](https://cloud.google.com/run/docs)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)

