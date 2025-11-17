# Azure VM Deployment Guide - RevPerfect Backend

## Deployment Readiness Assessment

### ✅ **READY FOR DEPLOYMENT**

Your backend codebase is **production-ready** for Azure VM deployment with PM2 and NGINX. Here's the assessment:

## ✅ What's Working Well

1. **Cross-Platform Compatibility**: 
   - Uses `path.join()` for file paths (cross-platform)
   - No Windows-specific code or hardcoded paths
   - All dependencies are platform-agnostic

2. **Production Features**:
   - Graceful shutdown handlers (SIGTERM, SIGINT) ✅
   - Health check endpoints (`/health`, `/ready`) ✅
   - Proper error handling and logging ✅
   - Security middleware (Helmet, CORS, rate limiting) ✅
   - Environment-based configuration ✅

3. **Build Process**:
   - TypeScript compilation configured ✅
   - Production build script (`npm run build`) ✅
   - Start script uses compiled JavaScript ✅

4. **Database**:
   - Prisma ORM with migration support ✅
   - Post-install script generates Prisma client ✅

## ⚠️ Minor Issues to Address

### 1. Port Binding (Recommended Fix)
Currently binds to `localhost` only. For clarity and flexibility, should bind to `0.0.0.0`:
- **Current**: `app.listen(API_PORT, ...)`
- **Recommended**: `app.listen(API_PORT, '0.0.0.0', ...)`
- **Impact**: Low (works with NGINX on same machine, but explicit is better)

### 2. Logs Directory
Logger creates files in `logs/` directory, but directory might not exist:
- **Fix**: Ensure `logs/` directory exists or create it automatically
- **Impact**: Medium (app will crash if can't write logs in production)

### 3. PM2 Configuration
No PM2 ecosystem file exists:
- **Fix**: Create `ecosystem.config.js` for PM2 management
- **Impact**: Low (can use CLI, but config file is better)

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Ensure Node.js 18+ is installed on Ubuntu VM
- [ ] PostgreSQL database is accessible from VM
- [ ] Azure Storage credentials are ready
- [ ] Microsoft Graph API credentials are ready
- [ ] Environment variables are documented

### Deployment Steps

1. **Install Node.js on Ubuntu**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Install PM2 globally**
   ```bash
   sudo npm install -g pm2
   ```

3. **Install NGINX**
   ```bash
   sudo apt-get update
   sudo apt-get install -y nginx
   ```

4. **Clone/Deploy Application**
   ```bash
   cd /var/www
   git clone <your-repo> revperfect-backend
   cd revperfect-backend/backend
   ```

5. **Install Dependencies**
   ```bash
   npm install --production
   ```

6. **Setup Environment**
   ```bash
   cp env.example .env
   nano .env  # Edit with production values
   ```

7. **Create Logs Directory**
   ```bash
   mkdir -p logs
   ```

8. **Run Database Migrations**
   ```bash
   npm run prisma:migrate:deploy
   ```

9. **Build Application**
   ```bash
   npm run build
   ```

10. **Start with PM2**
    ```bash
    pm2 start ecosystem.config.js
    pm2 save
    pm2 startup  # Follow instructions to enable auto-start on boot
    ```

11. **Configure NGINX**
    - See NGINX configuration below

12. **Test Deployment**
    ```bash
    curl http://localhost:3001/health
    curl http://your-domain.com/api/health
    ```

## 🔧 Configuration Files

### PM2 Ecosystem Config
See `ecosystem.config.js` (created in this assessment)

### NGINX Configuration
Create `/etc/nginx/sites-available/revperfect-backend`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS (if using SSL)
    # return 301 https://$server_name$request_uri;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint (optional: expose directly)
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/revperfect-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL/HTTPS (Recommended)
Use Let's Encrypt:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🔍 Monitoring & Maintenance

### PM2 Commands
```bash
pm2 status              # Check status
pm2 logs revperfect     # View logs
pm2 restart revperfect  # Restart app
pm2 stop revperfect     # Stop app
pm2 monit               # Monitor resources
```

### Logs Location
- Application logs: `backend/logs/`
- PM2 logs: `~/.pm2/logs/`
- NGINX logs: `/var/log/nginx/`

### Health Monitoring
- Health endpoint: `http://your-domain.com/health`
- Ready endpoint: `http://your-domain.com/ready`

## 🚀 Quick Start Script

Create `deploy.sh` in backend directory:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Install dependencies
npm install --production

# Create logs directory
mkdir -p logs

# Setup environment (if not exists)
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Please create it from env.example"
    exit 1
fi

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate:deploy

# Build application
npm run build

# Restart PM2
pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js

echo "✅ Deployment complete!"
```

Make executable:
```bash
chmod +x deploy.sh
```

## 📝 Environment Variables Checklist

Ensure these are set in `.env`:

- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `AZURE_STORAGE_CONNECTION_STRING` - Azure Storage connection
- [ ] `AZURE_BLOB_CONTAINER_NAME` - Container name (default: hotel-files)
- [ ] `MS_GRAPH_CLIENT_ID` - Microsoft Graph Client ID
- [ ] `MS_GRAPH_CLIENT_SECRET` - Microsoft Graph Client Secret
- [ ] `MS_GRAPH_TENANT_ID` - Tenant ID (default: consumers)
- [ ] `MONITORED_EMAIL` - Email to monitor
- [ ] `NODE_ENV=production` - Environment
- [ ] `PORT=3001` - Server port
- [ ] `ALLOWED_ORIGINS` - CORS allowed origins
- [ ] `LOG_LEVEL=info` - Logging level
- [ ] `EMAIL_CHECK_CRON` - Cron schedule (default: 0 * * * *)

## 🔒 Security Considerations

1. **Firewall**: Only expose ports 80/443, not 3001
2. **Environment Variables**: Never commit `.env` file
3. **Database**: Use SSL connections (`sslmode=require`)
4. **NGINX**: Rate limiting at NGINX level (optional)
5. **PM2**: Run as non-root user (recommended)

## 🐛 Troubleshooting

### App won't start
```bash
# Check logs
pm2 logs revperfect --lines 50

# Check environment
pm2 env 0

# Verify build
ls -la dist/
```

### Database connection issues
```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1;"
```

### Port already in use
```bash
# Find process using port 3001
sudo lsof -i :3001
# Kill if needed
sudo kill -9 <PID>
```

### NGINX 502 Bad Gateway
- Check if app is running: `pm2 status`
- Check app logs: `pm2 logs revperfect`
- Verify port: `curl http://localhost:3001/health`

## ✅ Summary

Your backend is **ready for production deployment** with minor improvements recommended. The codebase follows best practices and will work seamlessly with PM2 and NGINX on Ubuntu.

**Next Steps:**
1. Apply the recommended fixes (port binding, logs directory)
2. Create PM2 ecosystem config
3. Follow deployment checklist
4. Test thoroughly before going live

