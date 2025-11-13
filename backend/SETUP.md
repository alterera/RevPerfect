# Quick Setup Guide

Follow these steps to get the RevPerfect Backend up and running.

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Setup Environment Variables

1. Copy the example environment file:
```bash
cp env.example .env
```

2. Edit `.env` and fill in your credentials:
   - PostgreSQL database URL
   - Azure Storage connection string
   - Microsoft Graph API credentials (Client ID, Secret, Tenant ID)
   - Monitored email address

## Step 3: Initialize Database

1. Generate Prisma client:
```bash
npm run prisma:generate
```

2. Create database tables:
```bash
npm run prisma:migrate
```

3. Seed with test hotels:
```bash
npm run prisma:seed
```

## Step 4: Test File Parser (Optional)

Verify the file parser works with sample data:
```bash
npm run test:parser
```

This will parse `history_forecast99383127.txt` and show results.

## Step 5: Start the Application

Development mode (with auto-reload):
```bash
npm run dev
```

The application will:
- Connect to database
- Initialize Azure Blob Storage
- Setup Microsoft Graph client
- Start the email watcher (runs every 5 minutes)

## Step 6: Verify Setup

Check the console output for:
- ✓ Database connected successfully
- ✓ Azure Blob Storage initialized
- ✓ Microsoft Graph client initialized
- ✓ Scheduler started successfully

## Testing Email Processing

1. Send an email with a `.txt` attachment to your monitored inbox
2. Ensure the sender email matches a hotel in your database
3. Wait for the next scheduler run (max 5 minutes)
4. Check logs for processing status
5. Verify in database:
   - `history_forecast_snapshots` table has new entry
   - `history_forecast_data` table has parsed rows

## View Data

Open Prisma Studio to browse the database:
```bash
npm run prisma:studio
```

Navigate to `http://localhost:5555` in your browser.

## Common Issues

### "No hotel found for sender"
- Add the sender's email to the hotels table
- Ensure `isActive` is true

### "Error initializing blob storage"
- Verify Azure Storage connection string
- Check network connectivity

### "Error fetching emails"
- Verify Graph API credentials
- Check application permissions in Azure Portal
- Ensure admin consent granted

### Database connection failed
- Check PostgreSQL is running
- Verify DATABASE_URL in .env
- Ensure database exists

## Next Steps

1. Register your production hotels via Prisma Studio or seed script
2. Configure the monitored email in Microsoft 365
3. Set up Azure Storage account
4. Configure Graph API permissions
5. Test with a real email

## Production Deployment

For production:

1. Build the application:
```bash
npm run build
```

2. Set NODE_ENV=production in .env

3. Run the built version:
```bash
npm start
```

4. Consider using PM2 or similar for process management

## Support

See README.md for detailed documentation and troubleshooting.

