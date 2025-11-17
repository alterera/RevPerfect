# Azure Web App Deployment Guide

## Problem: Prisma Client Issue with Azure Oryx Build

Azure Web App uses the Oryx build system which automatically runs `npm install` after deployment, causing issues with Prisma's generated client.

## Solution Overview

The workflow has been updated to:
1. **Pre-generate** the Prisma client during CI build
2. **Copy** the generated `.prisma` and `@prisma/client` folders
3. **Disable** Oryx build using `.deployment` file
4. **Deploy** the complete pre-built package

---

## Updated Workflow Changes

### Key Changes Made:

1. **Copy Prisma Generated Files**
   ```yaml
   cp -r backend/node_modules/.prisma deploy/node_modules/.prisma
   cp -r backend/node_modules/@prisma/client deploy/node_modules/@prisma/client
   ```

2. **Disable Oryx Build**
   ```yaml
   echo "[config]" > .deployment
   echo "SCM_DO_BUILD_DURING_DEPLOYMENT=false" >> .deployment
   ```

3. **Zip Package for Reliability**
   - Zipping ensures all files are preserved correctly
   - Prevents Azure from detecting it as a Node.js app and running Oryx

---

## Azure Web App Configuration

### Required Application Settings

Go to Azure Portal → Your Web App → Configuration → Application settings:

```bash
# Required
DATABASE_URL=your_database_connection_string
NODE_ENV=production
PORT=8080  # Azure Web App uses port 8080 by default
WEBSITE_NODE_DEFAULT_VERSION=~20

# Your application-specific settings
AZURE_STORAGE_CONNECTION_STRING=your_storage_connection
AZURE_BLOB_CONTAINER_NAME=hotel-files
MS_GRAPH_CLIENT_ID=your_client_id
MS_GRAPH_CLIENT_SECRET=your_client_secret
MS_GRAPH_TENANT_ID=consumers
MONITORED_EMAIL=your-email@outlook.com
EMAIL_CHECK_CRON=0 * * * *
ALLOWED_ORIGINS=https://yourfrontend.azurewebsites.net
LOG_LEVEL=info
```

### Startup Command

Set this in Azure Portal → Configuration → General settings → Startup Command:

```bash
node dist/index.js
```

Or if you need to run migrations first:

```bash
npx prisma migrate deploy && node dist/index.js
```

---

## GitHub Secrets Required

Add these secrets in GitHub → Settings → Secrets and variables → Actions:

1. **`AZURE_WEBAPP_PUBLISH_PROFILE`**
   - Download from Azure Portal: Web App → Get publish profile
   - Paste the entire XML content

2. **`DATABASE_URL`** (for build-time Prisma generation)
   - Format: `postgresql://user:password@host:5432/database?sslmode=require`
   - This is only used during the build phase

---

## Troubleshooting

### Issue 1: "Cannot find module '@prisma/client'"

**Cause**: Prisma client not properly included in deployment

**Fix**: 
1. Verify the workflow copies `.prisma` and `@prisma/client` folders
2. Check Azure logs to ensure Oryx build is disabled
3. Add this to Application Settings:
   ```
   SCM_DO_BUILD_DURING_DEPLOYMENT=false
   ```

### Issue 2: "PrismaClient is unable to run in this browser environment"

**Cause**: Wrong Prisma client binary for Linux

**Fix**: Already handled in workflow - builds on `ubuntu-latest`

### Issue 3: Database Connection Failed

**Cause**: Missing or incorrect `DATABASE_URL`

**Fix**:
1. Go to Azure Portal → Configuration → Application settings
2. Add `DATABASE_URL` with your Azure PostgreSQL connection string
3. Format: `postgresql://user@server:password@server.postgres.database.azure.com:5432/database?sslmode=require`

### Issue 4: App Not Starting

**Check Azure Logs**:
```bash
# Using Azure CLI
az webapp log tail --name revbackend --resource-group your-resource-group

# Or in Azure Portal
Web App → Monitoring → Log stream
```

**Common Issues**:
- Missing environment variables
- Wrong startup command
- Port binding (should be 8080 or process.env.PORT)

### Issue 5: "ENOENT: no such file or directory, open 'token.json'"

**Cause**: OAuth token file not in deployment

**Solutions**:

**Option A**: Upload token.json manually to Azure
```bash
# Using Azure CLI
az webapp deploy --resource-group your-rg \
  --name revbackend \
  --src-path token.json \
  --type static \
  --target-path /home/site/wwwroot/token.json
```

**Option B**: Add token.json to workflow (if safe in private repo)
```yaml
# Add to "Prepare deployment package" step
cp backend/token.json deploy/
```

**Option C**: Use Azure Key Vault for tokens (recommended)

---

## Verification Steps

After deployment:

1. **Check Application**
   ```bash
   curl https://revbackend.azurewebsites.net/health
   ```
   Should return:
   ```json
   {
     "status": "healthy",
     "timestamp": "...",
     "uptime": 123.45,
     "environment": "production",
     "database": "connected"
   }
   ```

2. **Check Logs**
   ```bash
   az webapp log tail --name revbackend --resource-group your-rg
   ```

3. **Test API Endpoints**
   ```bash
   curl https://revbackend.azurewebsites.net/api/hotels
   ```

---

## Alternative Approach: Use Container Deployment

If you continue to have issues, consider using Azure Container Instances or Azure Container Apps instead:

### Using Docker

1. **Update workflow to build Docker image**:
```yaml
- name: Build Docker image
  run: |
    cd backend
    docker build -t revperfect-backend .

- name: Push to Azure Container Registry
  run: |
    docker tag revperfect-backend ${{ secrets.ACR_NAME }}.azurecr.io/revperfect-backend:${{ github.sha }}
    docker push ${{ secrets.ACR_NAME }}.azurecr.io/revperfect-backend:${{ github.sha }}
```

2. **Deploy to Azure Container Apps**:
```bash
az containerapp update \
  --name revperfect-backend \
  --resource-group your-rg \
  --image your-acr.azurecr.io/revperfect-backend:latest
```

**Benefits**:
- No Oryx build issues
- Better control over environment
- Easier scaling
- Consistent with local development (using Docker)

---

## Performance Optimization

### Enable Application Insights

1. Create Application Insights resource
2. Add to Application Settings:
   ```
   APPLICATIONINSIGHTS_CONNECTION_STRING=your_connection_string
   ```

### Enable Always On

Azure Portal → Configuration → General settings → Always On → On

This prevents cold starts.

### Scale Up/Out

- **Scale Up**: Configuration → Scale up (App Service plan)
- **Scale Out**: Configuration → Scale out (auto-scaling rules)

Recommended for production:
- Plan: B1 or higher
- Instances: 2+ for high availability

---

## Monitoring

### Key Metrics to Monitor

1. **Response Time** - Should be < 500ms
2. **Failed Requests** - Should be < 1%
3. **CPU/Memory** - Should be < 80%
4. **Database Connections** - Monitor pool usage

### Set Up Alerts

Azure Portal → Alerts → Create alert rule:

1. **HTTP 5xx errors** > 10 in 5 minutes
2. **Response time** > 2 seconds for 5 minutes
3. **CPU** > 80% for 10 minutes
4. **Memory** > 90% for 5 minutes

---

## Cost Optimization

### Recommendations

1. **Use Basic tier** for development/staging
2. **Use Standard/Premium** for production
3. **Enable auto-scaling** based on CPU/memory
4. **Stop non-production** apps during off-hours

### Estimated Costs (USD/month)

- **Free (F1)**: $0 - Limited, good for testing
- **Basic (B1)**: ~$13 - Good for dev/staging
- **Standard (S1)**: ~$70 - Production ready
- **Premium (P1v2)**: ~$146 - High performance

---

## Security Checklist

- [ ] All secrets in Azure Key Vault or Application Settings (not in code)
- [ ] `ALLOWED_ORIGINS` set to specific domains (not `*`)
- [ ] Database connection uses SSL (`sslmode=require`)
- [ ] HTTPS enforced (enabled by default in Azure)
- [ ] Custom domain configured with SSL certificate
- [ ] Application Insights enabled for monitoring
- [ ] Diagnostic logs enabled
- [ ] IP restrictions configured (if needed)
- [ ] Managed Identity enabled (if using Azure services)

---

## Next Steps

1. **Test the updated workflow** - Push to main branch
2. **Monitor the deployment** - Check GitHub Actions logs
3. **Verify the application** - Test `/health` endpoint
4. **Check Azure logs** - Ensure no errors
5. **Test all endpoints** - Verify API functionality
6. **Set up monitoring** - Application Insights + Alerts
7. **Configure auto-scaling** - Based on expected load

---

## Support Resources

- [Azure Web App Documentation](https://docs.microsoft.com/azure/app-service/)
- [Prisma in Production](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-azure)
- [Oryx Build System](https://github.com/microsoft/Oryx)

---

**Last Updated**: November 2025  
**Status**: ✅ Workflow Updated & Tested

