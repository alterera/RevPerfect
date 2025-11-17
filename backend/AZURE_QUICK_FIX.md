# Azure Prisma Fix - Quick Reference Card

## 🚨 Critical Issue
**Error**: `Cannot find module '@prisma/client'` on Azure Web App  
**Cause**: Azure Oryx build system overwrites pre-generated Prisma client

---

## ✅ 3-Step Fix

### 1️⃣ Workflow Updated ✅ (Already Done)
The `workflow.yml` file has been updated to:
- Copy `.prisma` and `@prisma/client` folders
- Create `.deployment` file to disable Oryx
- Zip the complete package

### 2️⃣ Azure Configuration (Do This Now)

**Go to**: Azure Portal → Your Web App → Configuration → Application settings

**Add this setting** (CRITICAL):
```
Name: SCM_DO_BUILD_DURING_DEPLOYMENT
Value: false
```

**Add your environment variables**:
```
DATABASE_URL=postgresql://user@server:pass@host.postgres.database.azure.com:5432/db?sslmode=require
NODE_ENV=production
WEBSITE_NODE_DEFAULT_VERSION=~20
AZURE_STORAGE_CONNECTION_STRING=your_value
AZURE_BLOB_CONTAINER_NAME=hotel-files
MS_GRAPH_CLIENT_ID=your_value
MS_GRAPH_CLIENT_SECRET=your_value
MS_GRAPH_TENANT_ID=consumers
MONITORED_EMAIL=your-email@outlook.com
ALLOWED_ORIGINS=https://your-frontend.azurewebsites.net
LOG_LEVEL=info
```

**Startup Command**:
```
node dist/index.js
```

Click **Save** and restart the app.

### 3️⃣ Deploy

```bash
git add .
git commit -m "Fix: Azure Prisma deployment"
git push origin main
```

---

## 🔍 Verify It Works

### Check 1: GitHub Actions
✅ Watch workflow complete without errors

### Check 2: Health Check
```bash
curl https://revbackend.azurewebsites.net/health
```
Expected: `{"status":"healthy",...}`

### Check 3: Azure Logs
```bash
az webapp log tail --name revbackend --resource-group your-rg
```
Expected: ✅ "Application started successfully"

---

## 🆘 Still Not Working?

### Quick Diagnostics

**1. Check if Oryx build is disabled**
```bash
# Azure Kudu Console: https://revbackend.scm.azurewebsites.net
cat /home/site/wwwroot/.deployment
```
Should show: `SCM_DO_BUILD_DURING_DEPLOYMENT=false`

**2. Check if Prisma client exists**
```bash
ls -la /home/site/wwwroot/node_modules/.prisma/client/
```
Should show: `libquery_engine-*` files

**3. Check Application Settings**
```bash
az webapp config appsettings list --name revbackend | grep SCM_DO_BUILD
```
Should show: `"value": "false"`

### If Prisma client is missing:

**Option A**: Manually set in Azure Portal
1. Go to Configuration → Application settings
2. Add: `SCM_DO_BUILD_DURING_DEPLOYMENT = false`
3. Save and restart

**Option B**: Use Azure CLI
```bash
az webapp config appsettings set \
  --name revbackend \
  --resource-group your-rg \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false
```

**Option C**: Use alternate workflow
- We created: `.github/workflows/azure-deploy-alternative.yml`
- More verbose and explicit about copying files

---

## 📋 Pre-Deployment Checklist

Before you commit:
- [x] `workflow.yml` updated (already done)
- [x] `package.json` updated with safe prisma generate (already done)
- [ ] Azure Application Setting: `SCM_DO_BUILD_DURING_DEPLOYMENT=false` added
- [ ] All environment variables added in Azure
- [ ] Startup command set to: `node dist/index.js`
- [ ] GitHub secret `AZURE_WEBAPP_PUBLISH_PROFILE` exists
- [ ] GitHub secret `DATABASE_URL` exists (for build time)

---

## 📞 Documentation

Full details in:
- `PRISMA_AZURE_FIX.md` - Complete troubleshooting guide
- `AZURE_DEPLOYMENT.md` - Full Azure deployment documentation
- `.github/workflows/azure-deploy-alternative.yml` - Alternative workflow

---

## 🎯 Summary

**Problem**: Oryx build overwrites Prisma client  
**Solution**: Disable Oryx + copy pre-generated client  
**Critical**: Must set `SCM_DO_BUILD_DURING_DEPLOYMENT=false` in Azure  

**Status**: ✅ Ready to deploy after Azure config

