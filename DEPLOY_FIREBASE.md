# Firebase Deployment Guide

This guide will help you deploy the Personalized Recommendation Engine to Firebase.

## Prerequisites

1. Firebase CLI installed: `npm install -g firebase-tools`
2. Google Cloud SDK installed (for Cloud Run)
3. Firebase project created: `personalizedreceng`

## Deployment Steps

### Step 1: Deploy Static Files to Firebase Hosting

```bash
# Make sure you're in the project directory
cd personalized-recommendation-engine-demoThree-fresh

# Deploy static files
firebase deploy --only hosting
```

### Step 2: Deploy Backend to Cloud Run

Since the app uses SQLite and file uploads, we'll deploy the backend to Cloud Run:

```bash
# Set your project ID
export PROJECT_ID=personalizedreceng
export SERVICE_NAME=recommendation-api
export REGION=us-central1

# Build and deploy to Cloud Run
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=your-gemini-api-key" \
  --memory 1Gi \
  --cpu 1
```

### Step 3: Update Firebase Hosting Rewrites

After deploying to Cloud Run, update the service URL in `firebase.json` if needed, then redeploy:

```bash
firebase deploy --only hosting
```

## Alternative: Deploy Everything to Cloud Run

If you prefer to deploy everything (frontend + backend) to Cloud Run:

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/recommendation-engine
gcloud run deploy recommendation-engine \
  --image gcr.io/$PROJECT_ID/recommendation-engine \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=your-gemini-api-key" \
  --memory 1Gi \
  --cpu 1
```

## Environment Variables

Make sure to set these environment variables in Cloud Run:
- `GEMINI_API_KEY`: Your Gemini API key
- `PORT`: 3000 (usually set automatically)
- `NODE_ENV`: production

## Important Notes

1. **SQLite Database**: The database file will be stored in Cloud Run's ephemeral storage. For production, consider migrating to Cloud SQL or Firestore.

2. **File Uploads**: Uploaded files are stored in the `uploads/` directory. For production, consider using Cloud Storage.

3. **Session Storage**: Sessions are stored in memory. For production with multiple instances, use Redis or Cloud Memorystore.

4. **Security**: Update the session secret in production:
   ```javascript
   secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production-12345'
   ```

## Quick Deploy Script

Create a `deploy.sh` script:

```bash
#!/bin/bash
PROJECT_ID=personalizedreceng
SERVICE_NAME=recommendation-api
REGION=us-central1

# Deploy static files
echo "Deploying static files to Firebase Hosting..."
firebase deploy --only hosting

# Deploy backend to Cloud Run
echo "Deploying backend to Cloud Run..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars "GEMINI_API_KEY=$GEMINI_API_KEY" \
  --memory 1Gi \
  --cpu 1

echo "Deployment complete!"
```

Make it executable: `chmod +x deploy.sh`

## Troubleshooting

- **Build fails**: Check that all dependencies are in `package.json`
- **Deployment fails**: Verify you're logged in: `gcloud auth login` and `firebase login`
- **API not accessible**: Check Cloud Run service URL and update Firebase rewrites
- **Database errors**: Ensure Cloud Run has write permissions for the `data/` directory

