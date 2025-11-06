# Enable Billing for Google Cloud Project

## ⚠️ Billing Required

To deploy to Cloud Run, you need to enable billing for your Google Cloud project.

## Steps to Enable Billing

1. **Go to Google Cloud Console:**
   - Visit: https://console.cloud.google.com/billing
   - Or go to: https://console.cloud.google.com → Billing

2. **Link a Billing Account:**
   - If you don't have a billing account, create one
   - Link your billing account to the project `personalizedreceng`
   - You'll need a credit card (Google provides free credits for new accounts)

3. **Verify Billing is Enabled:**
   ```bash
   gcloud billing projects describe personalizedreceng
   ```

4. **After Billing is Enabled:**
   Run the deployment script again:
   ```bash
   ./deploy-to-cloud-run.sh
   ```

## Free Tier Information

- **Cloud Run**: Free tier includes 2 million requests per month
- **Cloud Build**: Free tier includes 120 build-minutes per day
- **Container Registry**: Free tier includes 0.5 GB storage per month

For most small applications, you'll stay within the free tier limits.

## Alternative: Use Firebase Functions (No Billing Required)

If you prefer not to enable billing, you can:
1. Use Firebase Functions instead of Cloud Run
2. Deploy the backend as a Firebase Function
3. This requires restructuring the code but doesn't need billing

## Current Status

✅ **Authentication**: Complete (logged in as sayedtmim2013@gmail.com)
✅ **Project Set**: personalizedreceng
❌ **Billing**: Not enabled (required for Cloud Run)
❌ **APIs**: Not enabled (waiting for billing)

## Next Steps

1. Enable billing in Google Cloud Console
2. Run `./deploy-to-cloud-run.sh` again
3. The script will automatically enable APIs and deploy

