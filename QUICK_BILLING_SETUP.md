# Quick Billing Setup Guide

## ⚠️ Billing Required for Cloud Run

To deploy to Cloud Run, you need to enable billing for your Google Cloud project.

## Option 1: Enable via Web Console (Recommended)

1. **Open Google Cloud Console:**
   - Visit: https://console.cloud.google.com/billing?project=personalizedreceng
   - Or: https://console.cloud.google.com → Billing

2. **Link Billing Account:**
   - If you have a billing account, select it and link to project `personalizedreceng`
   - If you don't have one, create a new billing account (requires credit card)
   - Google provides **$300 free credits** for new accounts (valid for 90 days)

3. **Verify:**
   ```bash
   gcloud billing projects describe personalizedreceng
   ```
   Should show: `billingEnabled: true`

4. **Then run deployment:**
   ```bash
   ./deploy-to-cloud-run.sh
   ```

## Option 2: Enable via Command Line (If you have a billing account)

If you already have a billing account ID:

```bash
# List your billing accounts
gcloud billing accounts list

# Link billing account to project (replace BILLING_ACCOUNT_ID)
gcloud billing projects link personalizedreceng --billing-account=BILLING_ACCOUNT_ID
```

## Free Tier Limits

Even with billing enabled, you get generous free tiers:
- **Cloud Run**: 2 million requests/month free
- **Cloud Build**: 120 build-minutes/day free
- **Container Registry**: 0.5 GB storage/month free

For most small applications, you'll stay within free limits.

## After Billing is Enabled

Once billing is enabled, the deployment script will automatically:
1. ✅ Enable required APIs
2. ✅ Build Docker image
3. ✅ Deploy to Cloud Run
4. ✅ Provide you with the service URL

## Current Status

- ✅ Authentication: Complete
- ✅ Project: personalizedreceng
- ❌ Billing: Not enabled (required)
- ⏳ Deployment: Waiting for billing

