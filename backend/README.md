# RevPerfect Backend - Hotel Revenue Optimization System

Production-ready backend system for automated hotel revenue forecasting and analytics using Microsoft Graph API, Azure Blob Storage, and PostgreSQL.

## Features

- **Automated Email Processing**: Monitors Outlook inbox for history forecast files
- **Azure Blob Storage**: Securely stores all forecast files
- **Snapshot-Based Architecture**: Creates immutable snapshots for time-series analysis
- **Duplicate Detection**: File hash-based deduplication
- **Production-Grade Security**: Helmet, CORS, rate limiting, and request validation
- **Structured Logging**: Winston-based logging with rotation
- **Docker Ready**: Multi-stage Docker builds with health checks
- **Scalable Design**: Built with TypeScript, Prisma ORM, and PostgreSQL

## Architecture

### Core Components

1. **Email Watcher**: Checks monitored email every 5 minutes for new attachments
2. **File Processor**: Parses tab-separated history forecast files
3. **Snapshot Service**: Manages snapshot creation and data storage
4. **Blob Storage**: Uploads files to Azure in organized structure
5. **Hotel Service**: Maps sender emails to hotels

### Data Flow

```
Email Received → Attachment Downloaded → File Hash Calculated → 
Duplicate Check → Upload to Blob → Register Snapshot → 
Parse File → Save Data → Mark Email as Processed
```

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Azure Storage Account
- Microsoft 365 with Graph API access (Azure App Registration)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `env.example` to `.env` and fill in your credentials:

```bash
cp env.example .env
```

Required variables:
- `DATABASE_URL`: PostgreSQL connection string
- `AZURE_STORAGE_CONNECTION_STRING`: Azure Storage connection string
- `AZURE_BLOB_CONTAINER_NAME`: Container name (default: hotel-files)
- `MS_GRAPH_CLIENT_ID`: Azure App Registration Client ID
- `MS_GRAPH_CLIENT_SECRET`: Azure App Registration Client Secret
- `MS_GRAPH_TENANT_ID`: Azure Tenant ID
- `MONITORED_EMAIL`: Email address to monitor (e.g., history.forecast@outlook.com)

### 3. Setup Database

Generate Prisma client:
```bash
npm run prisma:generate
```

Run migrations:
```bash
npm run prisma:migrate
```

Seed test data:
```bash
npx tsx prisma/seed.ts
```

### 4. Azure Setup

#### Create Storage Account
1. Go to Azure Portal
2. Create a Storage Account
3. Get connection string from "Access keys"
4. Container will be created automatically on first run

#### Setup Microsoft Graph API
1. Go to Azure Portal → App registrations
2. Create new registration or use existing
3. Add API permissions:
   - `Mail.ReadWrite` (Application permission)
   - `Mail.Send` (Application permission)
4. Grant admin consent
5. Create client secret
6. Note down: Client ID, Client Secret, Tenant ID

### 5. Register Hotels

Add hotels to the database so emails can be mapped:

```typescript
// Using prisma studio
npm run prisma:studio

// Or programmatically in seed.ts
```

Each hotel needs:
- `name`: Hotel name
- `email`: Sender email address (must match email sender)
- `isActive`: true

## Quick Start

### Development Mode

```bash
# Install dependencies
npm install

# Setup environment
cp env.example .env
# Edit .env with your credentials

# Run database migrations
npm run prisma:generate
npx prisma migrate dev

# Start development server
npm run dev
```

### Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for comprehensive production deployment guide.

**Quick production start with Docker**:

```bash
# Build and start
docker-compose up -d

# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Check logs
docker-compose logs -f backend
```

## Database Schema

### Hotel
- Stores hotel information
- Email used for sender identification

### ProcessedEmail
- Tracks processed emails to avoid duplicates
- Stores email metadata and file hash

### HistoryForecastSnapshot
- Represents each hourly file upload
- Tracks processing status
- Links to hotel and contains file metadata

### HistoryForecastData
- Stores parsed forecast data
- Each row represents one stay date from the snapshot
- Includes: rooms, revenue, ADR, RevPAR, occupancy, etc.

## File Format

The system expects tab-separated text files with columns:
1. Category (Room Revenue)
2. Data Type (History/Forecast)
3. Stay Date (DD/MM/YY Day)
4. Rooms Total
5. ... (various columns)
6. Rooms Sold
7. Room Revenue
8. ADR
9. Out of Order Rooms
10. Complimentary Rooms

Sample: `history_forecast99383127.txt`

## Scripts

```json
{
  "dev": "tsx watch src/index.ts",           // Development mode
  "build": "tsc",                             // Build for production
  "start": "node dist/index.js",              // Run production build
  "prisma:generate": "prisma generate",       // Generate Prisma client
  "prisma:migrate": "prisma migrate dev",     // Run migrations
  "prisma:studio": "prisma studio"            // Open Prisma Studio GUI
}
```

## Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration management
│   │   ├── index.ts
│   │   └── columnMapping.ts
│   ├── services/        # Business logic
│   │   ├── blobStorage.service.ts
│   │   ├── email.service.ts
│   │   ├── fileProcessor.service.ts
│   │   ├── snapshot.service.ts
│   │   ├── hotel.service.ts
│   │   └── processedEmail.service.ts
│   ├── jobs/           # Scheduled jobs
│   │   ├── emailWatcher.job.ts
│   │   └── scheduler.ts
│   ├── utils/          # Utility functions
│   │   ├── prisma.ts
│   │   └── fileHash.ts
│   ├── types/          # TypeScript types
│   │   └── fileProcessor.types.ts
│   ├── test-file-parser.ts  # Test script
│   └── index.ts        # Application entry point
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── seed.ts         # Database seeding
├── package.json
├── tsconfig.json
├── env.example
└── README.md
```

## Monitoring & Logs

The application logs:
- Email processing summary
- File upload status
- Parsing results
- Error details
- Snapshot creation

All logs include timestamps and context for debugging.

## Error Handling

- **Email Processing**: Continues with next email if one fails
- **File Parsing**: Marks snapshot as FAILED, stores error message
- **Duplicates**: Detected via file hash, automatically skipped
- **Missing Hotel**: Logs warning, skips email

## Future Enhancements

- [ ] REST API for querying snapshots
- [ ] Snapshot comparison endpoints (pickup, ADR move)
- [ ] Web dashboard for visualization
- [ ] Support for remaining file types (Res Stats, Rates, STR)
- [ ] Automated alerts and notifications
- [ ] Data export functionality

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Ensure database exists

### Email Not Processing
- Verify Graph API credentials
- Check application permissions granted
- Ensure monitored email exists
- Verify hotel registered with matching sender email

### File Upload Fails
- Check Azure Storage connection string
- Verify storage account exists
- Check network connectivity

### Parsing Errors
- Verify file format (tab-separated)
- Check column positions in columnMapping.ts
- Review sample file structure

## Support

For issues or questions, review the logs for detailed error messages and context.

## License

ISC

