<!-- 0836f782-4a6e-4242-9e8b-9e981d55f06c 96750ad7-cd90-43d8-a011-b8f74f8ee59f -->
# History Forecast Email Processing System - Snapshot-Based Architecture

## Architecture Overview

Node.js + TypeScript backend with:

- Microsoft Graph API for email monitoring (every 5 min)
- Azure Blob Storage for file storage
- PostgreSQL + Prisma ORM for snapshot-based time-series data
- Each hourly file = unique snapshot (never overwrite, stack chronologically)

## Core Concept

**Snapshot Philosophy**: Each hourly forecast file creates a new snapshot. Multiple snapshots for the same stay_date enable time-series analysis (pickup, ADR movement, RevPAR trends).

## Implementation Steps

### 1. Project Setup & Dependencies

**Create/update project structure:**

- Initialize TypeScript with strict configuration
- Install core dependencies: `@azure/storage-blob`, `@microsoft/microsoft-graph-client`, `@azure/identity`, `prisma`, `@prisma/client`, `node-cron`, `dotenv`, `crypto` (for file hashing)
- Install dev dependencies: `typescript`, `@types/node`, `tsx`, `nodemon`, `prisma` (dev)
- Setup folder structure:
  ```
  src/
    ├── config/         # Configuration management
    ├── services/       # Business logic services
    ├── jobs/          # Scheduled jobs
    ├── utils/         # Utility functions
    ├── types/         # TypeScript type definitions
    └── index.ts       # Application entry
  prisma/
    └── schema.prisma  # Database schema
  ```


### 2. Database Schema Design (Prisma)

**File**: `prisma/schema.prisma`

**Hotel** model:

- id (UUID primary key)
- name (String)
- email (String, unique) - for sender identification
- isActive (Boolean, default true)
- createdAt, updatedAt (DateTime)
- Relationship: Hotel has many HistoryForecastSnapshot

**ProcessedEmail** model:

- id (UUID primary key)
- messageId (String, unique) - Microsoft Graph email message ID
- subject (String)
- sender (String)
- receivedAt (DateTime) - when email was received
- processedAt (DateTime) - when we processed it
- fileHash (String) - for duplicate detection
- Indexes: messageId, fileHash

**HistoryForecastSnapshot** model:

- id (UUID primary key)
- hotelId (UUID, foreign key → Hotel)
- snapshotTime (DateTime) - extracted from filename or email timestamp
- originalFilename (String)
- blobUrl (String) - Azure Blob Storage URL
- fileHash (String, unique) - SHA-256 for duplicate detection
- uploadedAt (DateTime)
- processed (Boolean, default false)
- processingStatus (Enum: PENDING, PROCESSING, COMPLETED, FAILED)
- processingError (Text, nullable)
- rowCount (Int, nullable) - number of rows parsed
- createdAt, updatedAt (DateTime)
- Relationships: Snapshot has many HistoryForecastData
- Indexes: (hotelId, snapshotTime) composite, fileHash, processed, processingStatus

**HistoryForecastData** model:

- id (UUID primary key)
- snapshotId (UUID, foreign key → HistoryForecastSnapshot)
- stayDate (Date) - the date this forecast/history row represents
- dataType (Enum: HISTORY, FORECAST)
- roomsTotal (Int) - total rooms available
- roomsSold (Int) - rooms occupied
- roomRevenue (Decimal(12,2)) - total room revenue
- adr (Decimal(10,2)) - Average Daily Rate
- ooRooms (Int) - out of order rooms
- compRooms (Int) - complimentary rooms
- occupancyPercent (Decimal(5,2), nullable) - can be computed
- revPAR (Decimal(10,2), nullable) - computed: roomRevenue / roomsTotal
- rawData (Json) - store complete parsed row for future needs
- rowIndex (Int) - line number in original file
- createdAt (DateTime)
- Indexes: (snapshotId, stayDate) composite, stayDate, dataType
- Unique constraint: (snapshotId, stayDate, dataType) - prevent duplicate entries

### 3. Column Mapping Strategy

**File**: `src/config/columnMapping.ts`

Based on sample file analysis, define column indices (0-based, tab-separated):

- Column 0: Category (always "Room Revenue")
- Column 1: dataType (History/Forecast)
- Column 2: stayDate (format: DD/MM/YY Day)
- Column 3: roomsTotal
- Column 4-7: TBD (need clarification)
- Column 8: roomsSold
- Column 9: compRooms (likely)
- Column 10: occupancyPercent
- Column 11: roomRevenue
- Column 12: adr
- Column 13+: Various (store in rawData)

**Note**: Create flexible parser that can adapt if column positions change.

### 4. Configuration Management

**File**: `src/config/index.ts`

Export configuration object with validation:

```typescript
{
  azure: {
    storageConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.AZURE_BLOB_CONTAINER_NAME || 'hotel-files'
  },
  graph: {
    clientId: process.env.MS_GRAPH_CLIENT_ID,
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET,
    tenantId: process.env.MS_GRAPH_TENANT_ID
  },
  email: {
    monitoredEmail: process.env.MONITORED_EMAIL || 'history.forecast@outlook.com'
  },
  scheduler: {
    emailCheckCron: process.env.EMAIL_CHECK_CRON || '*/5 * * * *' // every 5 min
  },
  database: {
    url: process.env.DATABASE_URL
  }
}
```

### 5. Azure Blob Storage Service

**File**: `src/services/blobStorage.service.ts`

**Methods**:

- `initialize()`: Create BlobServiceClient, ensure container exists
- `uploadFile(hotelId: string, filename: string, buffer: Buffer): Promise<string>`:
  - Generate blob path: `history-forecast/{hotelId}/{timestamp}_{filename}`
  - Upload buffer to Azure Blob
  - Return blob URL
- `getFileUrl(blobPath: string): string`: Get public/SAS URL
- `fileExists(blobPath: string): Promise<boolean>`: Check if file already uploaded

### 6. Microsoft Graph Email Service

**File**: `src/services/email.service.ts`

**Methods**:

- `initializeClient()`: Setup Graph client with ClientSecretCredential
- `getNewEmails(): Promise<Email[]>`:
  - Query mailbox: history.forecast@outlook.com
  - Filter: hasAttachments=true, isRead=false (or use custom flag)
  - Return array of email objects with messageId, sender, subject, receivedAt
- `getAttachments(messageId: string): Promise<Attachment[]>`:
  - Fetch attachments for given email
  - Return array with name, contentBytes, contentType
- `markAsProcessed(messageId: string): Promise<void>`:
  - Mark email as read or move to "Processed" folder
  - Prevent reprocessing

### 7. File Hash Utility

**File**: `src/utils/fileHash.ts`

**Function**: `calculateFileHash(buffer: Buffer): string`

- Use crypto.createHash('sha256')
- Return hex digest
- Used for duplicate detection across uploads

### 8. File Processor Service

**File**: `src/services/fileProcessor.service.ts`

**Methods**:

- `parseHistoryForecastFile(buffer: Buffer): ParsedRow[]`:
  - Convert buffer to string (UTF-8)
  - Split by newlines
  - For each non-empty line:
    - Split by tab character
    - Validate minimum column count
    - Extract: dataType (col 1), stayDate (col 2), roomsTotal (col 3), roomsSold (col 8), roomRevenue (col 11), adr (col 12), ooRooms (col ?), compRooms (col ?)
    - Parse date from DD/MM/YY format to ISO Date
    - Calculate occupancyPercent if missing: (roomsSold / roomsTotal) * 100
    - Calculate revPAR: roomRevenue / roomsTotal
    - Store complete row as rawData (JSON)
  - Return array of ParsedRow objects with row index
- `validateRow(row: string[]): boolean`: Basic validation (min columns, required fields not null)

**Types** (`src/types/fileProcessor.types.ts`):

```typescript
interface ParsedRow {
  dataType: 'HISTORY' | 'FORECAST';
  stayDate: Date;
  roomsTotal: number;
  roomsSold: number;
  roomRevenue: number;
  adr: number;
  ooRooms: number;
  compRooms: number;
  occupancyPercent: number;
  revPAR: number;
  rawData: any[];
  rowIndex: number;
}
```

### 9. Snapshot Service

**File**: `src/services/snapshot.service.ts`

**Workflow: Two-Phase Approach**

**Phase 1: Register Snapshot (Before Parsing)**

- `createSnapshotRecord(data: SnapshotMetadata): Promise<Snapshot>`:
  - Create HistoryForecastSnapshot with:
    - hotelId, snapshotTime, originalFilename, blobUrl, fileHash, uploadedAt
    - processed = false
    - processingStatus = 'PENDING'
  - Return created snapshot
- `checkDuplicateByHash(fileHash: string): Promise<Snapshot | null>`:
  - Query by fileHash
  - If exists, return existing snapshot (skip processing)

**Phase 2: Store Parsed Data**

- `saveSnapshotData(snapshotId: string, rows: ParsedRow[]): Promise<void>`:
  - Begin transaction
  - Bulk insert rows into HistoryForecastData
  - Update snapshot: processed = true, processingStatus = 'COMPLETED', rowCount = rows.length
  - Commit transaction
- `markSnapshotFailed(snapshotId: string, error: string): Promise<void>`:
  - Update snapshot: processingStatus = 'FAILED', processingError = error

**Query Methods**:

- `getSnapshotsByHotel(hotelId: string, limit?: number): Promise<Snapshot[]>`:
  - Fetch snapshots ordered by snapshotTime desc
- `getSnapshotData(snapshotId: string): Promise<HistoryForecastData[]>`:
  - Fetch all data rows for a snapshot
- `getDataByDateRange(hotelId: string, startDate: Date, endDate: Date): Promise<any[]>`:
  - Query data across snapshots for date range

### 10. Hotel Service

**File**: `src/services/hotel.service.ts`

**Methods**:

- `getHotelByEmail(email: string): Promise<Hotel | null>`:
  - Query Hotel by email
  - Return hotel or null
- `createHotel(name: string, email: string): Promise<Hotel>`:
  - Admin function to register new hotel
- `getAllActiveHotels(): Promise<Hotel[]>`:
  - Fetch all hotels with isActive = true

### 11. Processed Email Tracker Service

**File**: `src/services/processedEmail.service.ts`

**Methods**:

- `isEmailProcessed(messageId: string): Promise<boolean>`:
  - Check if messageId exists in ProcessedEmail
- `recordProcessedEmail(data: EmailMetadata): Promise<void>`:
  - Insert into ProcessedEmail with messageId, sender, subject, receivedAt, processedAt, fileHash

### 12. Main Email Processing Job (Orchestrator)

**File**: `src/jobs/emailWatcher.job.ts`

**Main Function**: `processEmails(): Promise<void>`

**Workflow**:

1. **Fetch New Emails**: Call `emailService.getNewEmails()`
2. **For each email**:

   - **Check if processed**: `processedEmailService.isEmailProcessed(messageId)` → skip if true
   - **Identify hotel**: `hotelService.getHotelByEmail(sender)` → log warning and skip if not found
   - **Get attachments**: `emailService.getAttachments(messageId)`
   - **For each attachment** (txt files only):
     - **Calculate file hash**: `fileHash.calculateFileHash(buffer)`
     - **Check duplicate**: `snapshotService.checkDuplicateByHash(hash)` → skip if exists
     - **Upload to Blob**: `blobService.uploadFile(hotelId, filename, buffer)` → get blobUrl
     - **Extract snapshot time**: Parse from filename or use email receivedAt
     - **Register snapshot** (Phase 1):
       ```
       snapshot = snapshotService.createSnapshotRecord({
         hotelId, snapshotTime, filename, blobUrl, fileHash, uploadedAt: now
       })
       ```

     - **Parse file**: `fileProcessor.parseHistoryForecastFile(buffer)` → get rows
     - **Save data** (Phase 2):
       ```
       snapshotService.saveSnapshotData(snapshot.id, rows)
       ```

     - **Record processed email**: `processedEmailService.recordProcessedEmail(...)`
     - **Mark email as processed**: `emailService.markAsProcessed(messageId)`
   - **Error handling**: If any step fails, mark snapshot as failed, log error, continue to next email

3. **Log summary**: Total emails processed, snapshots created, errors encountered

### 13. Scheduler Setup

**File**: `src/jobs/scheduler.ts`

**Implementation**:

- Use `node-cron` to schedule `emailWatcher.processEmails()`
- Default: `*/5 * * * *` (every 5 minutes)
- Add job lock to prevent overlapping runs:
  ```typescript
  let isRunning = false;
  cron.schedule('*/5 * * * *', async () => {
    if (isRunning) {
      console.log('Previous job still running, skipping...');
      return;
    }
    isRunning = true;
    try {
      await processEmails();
    } finally {
      isRunning = false;
    }
  });
  ```


### 14. Application Entry Point

**File**: `src/index.ts`

**Startup sequence**:

1. Load and validate environment variables
2. Initialize Prisma client
3. Test database connection
4. Initialize Azure Blob Storage (ensure container exists)
5. Initialize Microsoft Graph client
6. Start cron scheduler
7. Log startup information (env, scheduled jobs)
8. Setup graceful shutdown:

   - Disconnect Prisma
   - Stop cron jobs
   - Exit cleanly

### 15. Environment Variables

**File**: `.env.example` (copy to `.env`):

```
DATABASE_URL="postgresql://user:password@localhost:5432/revperfect"
AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;..."
AZURE_BLOB_CONTAINER_NAME="hotel-files"
MS_GRAPH_CLIENT_ID="your-client-id"
MS_GRAPH_CLIENT_SECRET="your-client-secret"
MS_GRAPH_TENANT_ID="your-tenant-id"
MONITORED_EMAIL="history.forecast@outlook.com"
EMAIL_CHECK_CRON="*/5 * * * *"
NODE_ENV="development"
```

### 16. Derived Metrics (Future/Optional)

**File**: `src/services/metrics.service.ts` (Placeholder for Milestone 2)

**Methods to implement later**:

- `calculatePickup(snapshotId1, snapshotId2, stayDate)`: Room pickup between snapshots
- `calculateADRMove(snapshotId1, snapshotId2, stayDate)`: ADR change
- `compareSnapshots(snapshotId1, snapshotId2)`: Full comparison
- `getIntradayPickup(hotelId, date)`: Today's pickup since morning
- `get7DayPickup(hotelId)`: Weekly trends

**For now**: Store all data, compute on-demand in future dashboard.

### 17. Testing & Validation

**Manual Testing Steps**:

1. Seed database with test hotel: `email = 'testhotel@example.com'`
2. Run Prisma migration: `npx prisma migrate dev --name init`
3. Test file parser independently with sample file:
   ```bash
   tsx src/services/fileProcessor.test.ts
   ```

4. Test blob upload with dummy file
5. Send test email with attachment to monitored inbox
6. Run email watcher manually: `tsx src/jobs/emailWatcher.job.ts`
7. Verify:

   - Snapshot created in database
   - Data rows inserted
   - File in Azure Blob
   - Email marked as processed

8. Send duplicate file, verify skipped
9. Start full application and monitor logs

## Key Technical Decisions

1. **Never Overwrite**: Each snapshot is immutable. Enables time-series analysis.
2. **Two-Phase Processing**: Register snapshot first, then parse. Prevents orphaned data if parsing fails.
3. **File Hash for Duplicates**: SHA-256 on file content prevents duplicate uploads even with different filenames.
4. **Email Message ID Tracking**: Prevents reprocessing same email if job runs multiple times.
5. **Status Tracking**: processingStatus enum allows monitoring and retry logic.
6. **Raw Data Storage**: Store complete row as JSON for future column additions without schema migration.

## Error Handling Strategy

- Wrap all async operations in try-catch blocks
- Log errors with context: hotelId, snapshotId, messageId, filename
- Continue processing other emails if one fails (don't crash entire job)
- Mark snapshots with FAILED status and store error message
- Implement retry logic for transient failures (future enhancement)

## Monitoring & Observability (Future)

- Log aggregation (Winston + CloudWatch/App Insights)
- Metrics: emails processed/hour, snapshots created, parse errors
- Alerts: parsing failures, zero emails for extended period, blob upload errors
- Dashboard: processing status, hotel data freshness

## Future Enhancements (Beyond Milestone 1)

- REST API for querying snapshots and data
- Snapshot comparison endpoints (pickup, ADR move)
- Web dashboard for visualization
- Support for remaining 4 file types (Res Stats, Res Forecast, Rates, STR)
- Automated hotel onboarding flow
- Data export functionality (CSV, Excel)
- Historical data backfill from existing files

### To-dos

- [x] Initialize project structure with TypeScript, install dependencies, and create folder structure
- [x] Design and create Prisma schema with Hotel, ProcessedEmail, HistoryForecastSnapshot, and HistoryForecastData models
- [x] Create configuration management for Azure, Graph API, and database connections
- [x] Implement Azure Blob Storage service for file upload and management
- [x] Implement Microsoft Graph API service for email monitoring and attachment download
- [x] Create file processor to parse tab-separated history forecast files and extract specified columns
- [x] Implement snapshot management service to store and retrieve forecast data
- [x] Create hotel service for email-to-hotel mapping
- [x] Build main email watcher job orchestrating the entire processing pipeline
- [x] Setup cron scheduler to run email watcher every 5 minutes
- [x] Create application entry point with initialization and graceful shutdown
- [x] Test end-to-end flow with sample data and verify all components work together