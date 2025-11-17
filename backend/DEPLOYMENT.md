# RevPerfect Backend - Production Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Deployment Options](#deployment-options)
4. [Security Checklist](#security-checklist)
5. [Monitoring & Maintenance](#monitoring--maintenance)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Services
- **PostgreSQL** 14+ (Azure Database for PostgreSQL recommended)
- **Azure Storage Account** (for file storage)
- **Microsoft 365 Account** with Graph API access
- **Docker** (for containerized deployment)

### Required Credentials
Before deployment, ensure you have:
- [ ] Database connection string
- [ ] Azure Storage connection string
- [ ] Microsoft Graph API credentials (Client ID, Secret, Tenant ID)
- [ ] OAuth refresh token (see [OAuth Setup](#oauth-setup))

## Environment Setup

### 1. Create Production Environment File

Copy the example environment file and fill in your production values:

```bash
cp env.example .env.production
```

Edit `.env.production` with your production credentials:

```bash
# Database
DATABASE_URL="postgresql://username:password@hostname:5432/database?sslmode=require"

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING="your_connection_string"
AZURE_BLOB_CONTAINER_NAME="hotel-files"

# Microsoft Graph API
MS_GRAPH_CLIENT_ID="your_client_id"
MS_GRAPH_CLIENT_SECRET="your_client_secret"
MS_GRAPH_TENANT_ID="consumers"

# Email Configuration
MONITORED_EMAIL="your-email@outlook.com"

# Scheduler (every hour)
EMAIL_CHECK_CRON="0 * * * *"

# Environment
NODE_ENV="production"
PORT=3001

# Security - IMPORTANT: Set your frontend domain(s)
ALLOWED_ORIGINS="https://yourdomain.com,https://www.yourdomain.com"

# Logging
LOG_LEVEL="info"
```

### 2. OAuth Setup

The application requires a one-time OAuth setup to obtain refresh tokens:

#### Option A: Using Development Setup (Recommended)

1. Temporarily install development dependencies:
```bash
npm install
```

2. Run the auth setup (development only):
```bash
npm run dev
# In a separate terminal, manually run the OAuth flow
# This is a one-time setup
```

3. Follow the browser prompts to authenticate
4. The `token.json` file will be created
5. **Important**: Keep this file secure - it contains sensitive tokens

#### Option B: Manual Token Generation

Contact your system administrator for pre-generated tokens.

## Deployment Options

### Option 1: Docker Deployment (Recommended)

#### Using Docker Compose (Easiest)

1. **Build and start all services**:
```bash
docker-compose up -d
```

2. **Run database migrations**:
```bash
docker-compose exec backend npx prisma migrate deploy
```

3. **Check logs**:
```bash
docker-compose logs -f backend
```

4. **Stop services**:
```bash
docker-compose down
```

#### Using Docker Only

1. **Build the image**:
```bash
docker build -t revperfect-backend .
```

2. **Run the container**:
```bash
docker run -d \
  --name revperfect-backend \
  -p 3001:3001 \
  --env-file .env.production \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/token.json:/app/token.json \
  revperfect-backend
```

3. **Run migrations** (first time only):
```bash
docker exec revperfect-backend npx prisma migrate deploy
```

### Option 2: Direct Node.js Deployment

1. **Install dependencies**:
```bash
npm ci --only=production
```

2. **Generate Prisma client**:
```bash
npx prisma generate
```

3. **Run database migrations**:
```bash
npx prisma migrate deploy
```

4. **Build the application**:
```bash
npm run build
```

5. **Start the application**:
```bash
NODE_ENV=production node dist/index.js
```

### Option 3: Process Manager (PM2)

1. **Install PM2 globally**:
```bash
npm install -g pm2
```

2. **Create PM2 ecosystem file** (`ecosystem.config.js`):
```javascript
module.exports = {
  apps: [{
    name: 'revperfect-backend',
    script: './dist/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
```

3. **Start with PM2**:
```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### Option 4: Cloud Deployment

#### Azure Container Instances

```bash
# Login to Azure
az login

# Create resource group
az group create --name revperfect-rg --location eastus

# Create container instance
az container create \
  --resource-group revperfect-rg \
  --name revperfect-backend \
  --image your-registry/revperfect-backend:latest \
  --dns-name-label revperfect-api \
  --ports 3001 \
  --environment-variables \
    NODE_ENV=production \
    PORT=3001 \
  --secure-environment-variables \
    DATABASE_URL=$DATABASE_URL \
    AZURE_STORAGE_CONNECTION_STRING=$AZURE_STORAGE_CONNECTION_STRING
```

#### AWS ECS / Google Cloud Run

Similar container-based deployment strategies apply. Refer to respective cloud provider documentation.

## Security Checklist

Before going to production, verify:

- [ ] All environment variables use production values (no default/example values)
- [ ] `NODE_ENV` is set to `production`
- [ ] Database uses SSL/TLS (`sslmode=require`)
- [ ] `ALLOWED_ORIGINS` is set to your actual frontend domain(s)
- [ ] `token.json` file is secure and not committed to git
- [ ] Database credentials are strong and rotated regularly
- [ ] Azure Storage uses managed identities or secure connection strings
- [ ] Rate limiting is enabled (default: 100 req/15min)
- [ ] Health checks are configured (`/health`, `/ready`)
- [ ] Logs are being captured and monitored
- [ ] HTTPS is enforced at load balancer/reverse proxy level

## Database Migrations

### Production Migration Strategy

1. **Always test migrations in staging first**
2. **Backup database before migrations**:
```bash
# Azure Database for PostgreSQL
az postgres db show --resource-group <rg> --server <server> --name <db>
# Manual backup or use automated backups
```

3. **Run migrations**:
```bash
npx prisma migrate deploy
```

4. **Verify migration**:
```bash
npx prisma migrate status
```

### Rollback Strategy

If a migration fails:

1. Restore database from backup
2. Review migration scripts in `prisma/migrations/`
3. Fix issues and re-deploy

## Monitoring & Maintenance

### Health Checks

- **Liveness**: `GET /health` - Returns application and database status
- **Readiness**: `GET /ready` - Returns 200 when ready to accept traffic

### Logs

Logs are written to:
- **Console**: JSON format in production (for Docker/Cloud)
- **Files**: `logs/` directory
  - `combined-YYYY-MM-DD.log` - All logs
  - `error-YYYY-MM-DD.log` - Error logs only
  - `exceptions-YYYY-MM-DD.log` - Uncaught exceptions
  - `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

**Log rotation**: Automatic (14 days for combined, 30 days for errors)

### Monitoring Recommendations

1. **Application Monitoring**:
   - Monitor `/health` endpoint (every 30s)
   - Alert if unhealthy for > 2 minutes

2. **Resource Monitoring**:
   - CPU usage (alert if > 80% for 5 minutes)
   - Memory usage (alert if > 90%)
   - Disk space (logs directory)

3. **Error Monitoring**:
   - Parse error logs for patterns
   - Alert on repeated errors
   - Monitor 5xx error rate

4. **Business Metrics**:
   - Email processing success rate
   - File upload success rate
   - Database query performance

### Maintenance Tasks

#### Daily
- Check application health
- Review error logs

#### Weekly
- Review log file sizes
- Check disk space
- Review performance metrics

#### Monthly
- Rotate database credentials
- Review and update dependencies
- Database maintenance (VACUUM, ANALYZE)

#### Quarterly
- Security audit
- Review and update API permissions
- Backup verification

## Troubleshooting

### Application Won't Start

1. **Check environment variables**:
```bash
# Verify all required variables are set
docker-compose exec backend env | grep -E "DATABASE_URL|AZURE|MS_GRAPH"
```

2. **Check database connectivity**:
```bash
docker-compose exec backend npx prisma db pull
```

3. **Review logs**:
```bash
docker-compose logs backend
# Or
tail -f logs/error-*.log
```

### Email Processing Not Working

1. **Verify OAuth token**:
   - Check `token.json` exists
   - Verify token hasn't expired (refresh token should work indefinitely)

2. **Check Graph API permissions**:
   - Ensure `Mail.Read` and `Mail.ReadWrite` are granted
   - Verify admin consent is given

3. **Review scheduler logs**:
```bash
grep "Email Watcher" logs/combined-*.log
```

### High Memory Usage

1. **Check for memory leaks**:
```bash
docker stats revperfect-backend
```

2. **Reduce upload file size limits** in `src/index.ts`:
```typescript
app.use(express.json({ limit: '5mb' })); // Reduce from 10mb
```

3. **Increase container memory**:
```yaml
# docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 1G
```

### Database Connection Issues

1. **Verify connection string**:
```bash
echo $DATABASE_URL
```

2. **Check database is accessible**:
```bash
docker-compose exec backend npx prisma db pull
```

3. **Verify SSL requirements**:
   - Azure Database requires SSL: `?sslmode=require`

### Rate Limiting Too Strict

Adjust in `src/middleware/security.ts`:
```typescript
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increase from 100
  // ...
});
```

## Support & Contact

For production issues:
1. Check logs first
2. Review this documentation
3. Contact system administrator

## Version History

- **v1.0.0** - Initial production release
  - Core features implemented
  - Security hardened
  - Docker deployment ready

