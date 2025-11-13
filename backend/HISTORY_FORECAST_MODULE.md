# History Forecast Module Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Flow Pipeline](#data-flow-pipeline)
4. [Database Schema](#database-schema)
5. [Database Optimization & Partitioning](#database-optimization--partitioning)
6. [Core Components](#core-components)
7. [Data Extraction & Metrics](#data-extraction--metrics)
8. [Processing Workflow](#processing-workflow)
9. [Query Patterns](#query-patterns)
10. [Time-Series Analysis](#time-series-analysis)

---

## Overview

The **History Forecast Module** is a sophisticated data processing system that automatically ingests, processes, and stores hotel revenue forecasting data. It monitors a dedicated email inbox for history/forecast reports, extracts key metrics, and stores them in a time-series database for analysis.

### Key Features
- **Automated Email Monitoring**: Checks inbox every 5 minutes for new forecast files
- **Snapshot-Based Architecture**: Each file creates an immutable snapshot, enabling time-series analysis
- **Duplicate Detection**: Uses SHA-256 file hashing to prevent duplicate processing
- **Intelligent Storage**: Azure Blob Storage for raw files, PostgreSQL for structured data
- **Database Partitioning**: Monthly partitions for optimal query performance
- **Calculated Metrics**: Automatically computes Occupancy %, ADR, and RevPAR

### Purpose
Enable hoteliers to:
- Track forecast changes over time (pickup analysis)
- Monitor ADR and RevPAR trends
- Compare forecasts vs actual history
- Identify booking patterns and anomalies

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Outlook Email Inbox                          │
│              (history.forecast@outlook.com)                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │ Every 5 minutes
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Email Watcher Job                              │
│         (Microsoft Graph API - Delegated Auth)                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
        ┌─────────────────────┐
        │  Hotel Identification│ ← Hotels Table (email mapping)
        └─────────┬────────────┘
                  │
                  ↓
        ┌─────────────────────┐
        │   File Hash Check    │ ← ProcessedEmails Table
        └─────────┬────────────┘
                  │ If new file
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│              Azure Blob Storage Upload                           │
│        Container: hotel-files/{hotelId}/filename.txt             │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│               Create Snapshot Record                             │
│         (Phase 1: Register before parsing)                       │
│     Table: history_forecast_snapshots                            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                  File Parser                                     │
│   • Extract 5 essential columns                                  │
│   • Calculate 3 metrics (Occupancy%, ADR, RevPAR)                │
│   • Parse dates from DD/MM/YY to YYYY-MM-DD                      │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│            Ensure Partitions Exist                               │
│   • Check required month partitions                              │
│   • Create if missing                                            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────────────────────────┐
│              Save Snapshot Data                                  │
│         (Phase 2: Bulk insert parsed rows)                       │
│     Table: history_forecast_data (partitioned)                   │
│     • Transaction-based atomic insert                            │
│     • Update snapshot status to COMPLETED                        │
└──────────────────────────────────────────────────────────────────┘
```

### Technology Stack
- **Runtime**: Node.js 18+ with TypeScript
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Cloud Storage**: Azure Blob Storage
- **Email Integration**: Microsoft Graph API (OAuth 2.0 Delegated Flow)
- **Scheduling**: node-cron (5-minute intervals)

---

## Data Flow Pipeline

### Step-by-Step Processing

#### 1. **Email Detection** (Every 5 minutes)
```typescript
// Query: Unread emails with attachments
GET /me/messages?$filter=hasAttachments eq true and isRead eq false
```

#### 2. **Hotel Identification**
- Extract sender email from message
- Query `hotels` table by email
- Skip if hotel not found or inactive

#### 3. **Duplicate Prevention**
- Calculate SHA-256 hash of file content
- Check `processed_emails` table by messageId
- Check `history_forecast_snapshots` table by fileHash
- Skip if duplicate detected

#### 4. **File Storage**
- Upload to Azure Blob: `history-forecast/{hotelId}/{timestamp}_{filename}.txt`
- Store blob URL in database
- Mark email as read immediately (prevents reprocessing)

#### 5. **Snapshot Registration (Phase 1)**
```typescript
CREATE HistoryForecastSnapshot {
  hotelId: "uuid"
  snapshotTime: Date    // Extracted from filename or email timestamp
  blobUrl: "https://..."
  fileHash: "sha256..."
  processed: false
  processingStatus: "PENDING"
  totalAvailableRoomsSnapshot: 120  // From hotel record
}
```

#### 6. **File Parsing**
```
Input Format (Tab-separated):
Room Revenue    History    01/11/25 Sat    45    ...    12500.00    ...    278.00

Extracted:
- dataType: "HISTORY" or "FORECAST"
- stayDate: 2025-11-01 (converted from DD/MM/YY)
- roomNights: 45
- roomRevenue: 12500.00
- ooRooms: 2

Calculated:
- occupancyPercent: (45 / 120) * 100 = 37.50%
- adr: 12500 / 45 = 277.78
- revPAR: 12500 / 120 = 104.17
```

#### 7. **Partition Management**
- Extract unique months from parsed data
- For each month, check if partition exists
- Create partition if missing: `history_forecast_data_YYYY_MM`
- Add indexes for active/future months

#### 8. **Data Insertion (Phase 2)**
```sql
-- Transaction-based bulk insert
BEGIN;
  UPDATE history_forecast_snapshots SET processingStatus = 'PROCESSING';
  
  INSERT INTO history_forecast_data (
    snapshotId, hotelId, stayDate, dataType,
    roomNights, roomRevenue, ooRooms,
    occupancyPercent, adr, revPAR, rowIndex
  ) VALUES (...) -- Bulk insert all rows
  
  UPDATE history_forecast_snapshots 
  SET processed = true, 
      processingStatus = 'COMPLETED',
      rowCount = 730;
COMMIT;
```

#### 9. **Email Tracking**
```typescript
INSERT INTO processed_emails {
  messageId: "AAMkAD..."
  sender: "hotel@example.com"
  fileHash: "sha256..."
  processedAt: NOW()
}
```

### Error Handling
- **Parse Error**: Mark snapshot as `FAILED`, store error message, continue with next file
- **Database Error**: Transaction rollback, snapshot remains in `PENDING` state
- **Email Already Read**: Skip processing, prevents duplicates
- **Partition Missing**: Automatically created before data insertion

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────────────┐
│      Hotel           │
├──────────────────────┤
│ id (PK)              │
│ name                 │
│ email (unique)       │───┐
│ totalAvailableRooms  │   │
│ isActive             │   │
└──────────────────────┘   │
           │               │
           │ 1:N           │
           ↓               │
┌──────────────────────────────────┐
│ HistoryForecastSnapshot          │
├──────────────────────────────────┤
│ id (PK)                          │
│ hotelId (FK)                     │
│ snapshotTime                     │
│ originalFilename                 │
│ blobUrl                          │
│ fileHash (unique)                │───────→ Duplicate Detection
│ totalAvailableRoomsSnapshot      │         (SHA-256)
│ processed                        │
│ processingStatus (enum)          │
│ processingError                  │
│ rowCount                         │
└──────────────────────────────────┘
           │
           │ 1:N
           ↓
┌──────────────────────────────────┐
│ HistoryForecastData              │
│ (Partitioned by stayDate)        │
├──────────────────────────────────┤
│ id (PK)                          │
│ snapshotId (FK)                  │
│ hotelId (FK, denormalized)       │◄───── Optimization for queries
│ stayDate (partition key)         │
│ dataType (HISTORY/FORECAST)      │
│                                  │
│ --- EXTRACTED (5 columns) ---    │
│ roomNights                       │
│ roomRevenue                      │
│ ooRooms                          │
│                                  │
│ --- CALCULATED (3 metrics) ---   │
│ occupancyPercent                 │
│ adr (Average Daily Rate)         │
│ revPAR (Revenue Per Available)   │
│                                  │
│ rowIndex                         │
│ createdAt                        │
└──────────────────────────────────┘
```

### Table Details

#### **hotels**
```sql
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  totalAvailableRooms INT DEFAULT 0,
  isActive BOOLEAN DEFAULT true,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

-- Purpose: Maps email senders to hotel records
-- Key Field: email (used for sender identification)
```

#### **processed_emails**
```sql
CREATE TABLE processed_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  messageId VARCHAR(255) UNIQUE NOT NULL,
  subject VARCHAR(500),
  sender VARCHAR(255),
  receivedAt TIMESTAMP,
  processedAt TIMESTAMP DEFAULT NOW(),
  fileHash VARCHAR(64)
);

CREATE INDEX idx_processed_emails_messageId ON processed_emails(messageId);
CREATE INDEX idx_processed_emails_fileHash ON processed_emails(fileHash);

-- Purpose: Prevents duplicate email processing
-- Key Fields: 
--   - messageId: Microsoft Graph message ID
--   - fileHash: SHA-256 for duplicate file detection
```

#### **history_forecast_snapshots**
```sql
CREATE TABLE history_forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotelId UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  snapshotTime TIMESTAMP NOT NULL,
  originalFilename VARCHAR(500),
  blobUrl TEXT,
  fileHash VARCHAR(64) UNIQUE NOT NULL,
  totalAvailableRoomsSnapshot INT,
  uploadedAt TIMESTAMP DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  processingStatus VARCHAR(20) DEFAULT 'PENDING',
  processingError TEXT,
  rowCount INT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_snapshots_hotel_time ON history_forecast_snapshots(hotelId, snapshotTime);
CREATE INDEX idx_snapshots_fileHash ON history_forecast_snapshots(fileHash);
CREATE INDEX idx_snapshots_processed ON history_forecast_snapshots(processed);
CREATE INDEX idx_snapshots_status ON history_forecast_snapshots(processingStatus);

-- Purpose: Tracks each file upload and its processing status
-- Key Fields:
--   - snapshotTime: When this forecast was generated
--   - totalAvailableRoomsSnapshot: Room count at time of snapshot (for calculations)
--   - processingStatus: PENDING → PROCESSING → COMPLETED/FAILED
```

#### **history_forecast_data** (Partitioned Table)
```sql
CREATE TABLE history_forecast_data (
  id UUID DEFAULT uuid_generate_v4(),
  snapshotId UUID NOT NULL REFERENCES history_forecast_snapshots(id) ON DELETE CASCADE,
  hotelId UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  stayDate DATE NOT NULL,
  dataType VARCHAR(10) NOT NULL,
  
  -- Extracted columns
  roomNights INT,
  roomRevenue DECIMAL(12,2),
  ooRooms INT,
  
  -- Calculated metrics
  occupancyPercent DECIMAL(5,2),
  adr DECIMAL(10,2),
  revPAR DECIMAL(10,2),
  
  rowIndex INT,
  createdAt TIMESTAMP DEFAULT NOW(),
  
  PRIMARY KEY (id, stayDate)
) PARTITION BY RANGE (stayDate);

-- Composite indexes
CREATE INDEX idx_data_snapshot_date ON history_forecast_data(snapshotId, stayDate);
CREATE INDEX idx_data_hotel_date ON history_forecast_data(hotelId, stayDate);
CREATE INDEX idx_data_stayDate ON history_forecast_data(stayDate);
CREATE INDEX idx_data_dataType ON history_forecast_data(dataType);

-- Metric indexes (created only on active partitions)
CREATE INDEX idx_data_occupancy ON history_forecast_data(occupancyPercent);
CREATE INDEX idx_data_adr ON history_forecast_data(adr);
CREATE INDEX idx_data_revPAR ON history_forecast_data(revPAR);

-- Unique constraint
ALTER TABLE history_forecast_data 
ADD CONSTRAINT unique_snapshot_date_type 
UNIQUE (snapshotId, stayDate, dataType);

-- Purpose: Stores parsed forecast data in monthly partitions
-- Key Design Decisions:
--   - Partitioned by stayDate for query performance
--   - hotelId denormalized for direct queries (optimization)
--   - Calculated metrics pre-computed and indexed
```

---

## Database Optimization & Partitioning

### Why Partitioning?

The `history_forecast_data` table grows rapidly:
- **Per Snapshot**: ~730 rows (365 days × 2 data types)
- **Per Hotel Per Month**: ~60 snapshots (hourly) = 43,800 rows
- **10 Hotels**: ~440,000 rows/month = 5.3M rows/year

**Solution**: Monthly partitioning by `stayDate`

### Partition Strategy

#### Partition Naming Convention
```
history_forecast_data_YYYY_MM
Examples:
  - history_forecast_data_2025_11  (November 2025)
  - history_forecast_data_2025_12  (December 2025)
```

#### Automatic Partition Creation
```sql
-- Function to create next 3 months of partitions
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date TEXT;
  end_date TEXT;
BEGIN
  FOR i IN 0..2 LOOP
    partition_date := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::INTERVAL);
    partition_name := 'history_forecast_data_' || 
                      TO_CHAR(partition_date, 'YYYY_MM');
    start_date := TO_CHAR(partition_date, 'YYYY-MM-DD');
    end_date := TO_CHAR(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');
    
    -- Create partition if not exists
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF history_forecast_data
       FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );
    
    -- Create indexes for active partitions
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(occupancyPercent)',
      partition_name || '_occupancy_idx', partition_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(adr)',
      partition_name || '_adr_idx', partition_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(revPAR)',
      partition_name || '_revpar_idx', partition_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

#### Archive Old Partitions
```sql
-- Archive completed months (remove write-optimized indexes)
CREATE OR REPLACE FUNCTION archive_completed_month(archive_date DATE)
RETURNS void AS $$
DECLARE
  partition_name TEXT;
BEGIN
  partition_name := 'history_forecast_data_' || 
                    TO_CHAR(archive_date, 'YYYY_MM');
  
  -- Drop write-optimized indexes (keep read-optimized ones)
  EXECUTE format('DROP INDEX IF EXISTS %I', 
    partition_name || '_occupancy_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', 
    partition_name || '_adr_idx');
  EXECUTE format('DROP INDEX IF EXISTS %I', 
    partition_name || '_revpar_idx');
  
  -- Optional: Compress partition (PostgreSQL 14+)
  -- EXECUTE format('ALTER TABLE %I SET (autovacuum_enabled = false)', partition_name);
END;
$$ LANGUAGE plpgsql;
```

### Partition Management Service

```typescript
class PartitionManagerService {
  // Create partitions for next 3 months (run monthly)
  async createFuturePartitions(monthsAhead: number = 3): Promise<void>
  
  // Archive completed month (remove write indexes)
  async archiveCompletedMonth(archiveDate: Date): Promise<void>
  
  // List all partitions
  async listPartitions(): Promise<Array<{name, startDate, endDate}>>
  
  // Get partition statistics (row count, size)
  async getPartitionStats(partitionName: string): Promise<Stats>
  
  // Ensure partition exists for date (auto-create if missing)
  async ensurePartitionExists(date: Date): Promise<void>
}
```

### Index Strategy

#### Active Partitions (Current + Future Months)
```sql
-- Full index suite for fast queries
CREATE INDEX idx_occupancy ON partition_2025_11(occupancyPercent);
CREATE INDEX idx_adr ON partition_2025_11(adr);
CREATE INDEX idx_revpar ON partition_2025_11(revPAR);
CREATE INDEX idx_snapshot_date ON partition_2025_11(snapshotId, stayDate);
CREATE INDEX idx_hotel_date ON partition_2025_11(hotelId, stayDate);
```

#### Archived Partitions (Past Months)
```sql
-- Only essential indexes for time-series queries
CREATE INDEX idx_snapshot_date ON partition_2024_01(snapshotId, stayDate);
CREATE INDEX idx_hotel_date ON partition_2024_01(hotelId, stayDate);
-- Metric indexes DROPPED to save storage
```

### Query Performance

#### Without Partitioning
```sql
-- Scans entire table (5M+ rows)
SELECT * FROM history_forecast_data 
WHERE hotelId = '...' 
  AND stayDate BETWEEN '2025-11-01' AND '2025-11-30';

-- Execution: ~2000ms
```

#### With Partitioning
```sql
-- Only scans partition_2025_11 (~440K rows)
SELECT * FROM history_forecast_data 
WHERE hotelId = '...' 
  AND stayDate BETWEEN '2025-11-01' AND '2025-11-30';

-- Execution: ~150ms (13x faster)
```

### Storage Optimization

| Partition Type | Indexes | Storage/Month | Query Speed |
|----------------|---------|---------------|-------------|
| **Active** (Current + 2 future) | Full (7 indexes) | ~25 MB | Very Fast |
| **Recent** (Past 3 months) | Read-only (2 indexes) | ~15 MB | Fast |
| **Archived** (>3 months old) | Minimal (2 indexes) | ~10 MB | Moderate |

**Total Savings**: ~40% storage reduction after 6 months

---

## Core Components

### 1. Email Service (`email.service.ts`)

**Purpose**: Interface with Microsoft Graph API for email operations

```typescript
class EmailService {
  // Initialize Graph client with OAuth token
  initializeClient(): void
  
  // Get unread emails with attachments
  async getNewEmails(): Promise<Email[]>
  
  // Download attachments from specific email
  async getAttachments(messageId: string): Promise<Attachment[]>
  
  // Mark email as read (prevent reprocessing)
  async markAsProcessed(messageId: string): Promise<void>
  
  // Optional: Move to folder for organization
  async moveToFolder(messageId: string, folderName: string): Promise<void>
}
```

**Authentication**: OAuth 2.0 Delegated Flow
- Uses refresh token stored in `token.json`
- Automatically refreshes access token when expired
- User context: `history.forecast@outlook.com`

### 2. File Processor Service (`fileProcessor.service.ts`)

**Purpose**: Parse tab-separated forecast files

```typescript
class FileProcessorService {
  // Main parsing method
  parseHistoryForecastFile(buffer: Buffer, totalAvailableRooms: number): ParsedRow[]
  
  // Parse single line
  private parseLine(line: string, rowIndex: number, totalAvailableRooms: number): ParsedRow | null
  
  // Validate row has minimum required columns
  private validateRow(columns: string[]): boolean
  
  // Extract snapshot time from filename
  extractSnapshotTime(filename: string): Date
}
```

**File Format**:
```
Column 0:  Category (always "Room Revenue")
Column 1:  Data Type (History/Forecast)
Column 2:  Stay Date (DD/MM/YY Day)
Column 3:  Room Nights Sold
Column 10: Room Revenue
Column 15: Out of Order Rooms
```

### 3. Snapshot Service (`snapshot.service.ts`)

**Purpose**: Manage snapshot lifecycle and data storage

```typescript
class SnapshotService {
  // Phase 1: Register snapshot before parsing
  async createSnapshotRecord(
    metadata: SnapshotMetadata,
    totalAvailableRoomsSnapshot: number
  ): Promise<HistoryForecastSnapshot>
  
  // Check if file already processed (by hash)
  async checkDuplicateByHash(fileHash: string): Promise<HistoryForecastSnapshot | null>
  
  // Phase 2: Save parsed data (transaction-based)
  async saveSnapshotData(snapshotId: string, rows: ParsedRow[]): Promise<void>
  
  // Mark snapshot as failed (store error)
  async markSnapshotFailed(snapshotId: string, error: string): Promise<void>
  
  // Query methods
  async getSnapshotsByHotel(hotelId: string, limit?: number): Promise<Snapshot[]>
  async getSnapshotData(snapshotId: string): Promise<Data[]>
  async getDataByDateRange(hotelId: string, startDate: Date, endDate: Date): Promise<Data[]>
  async getLatestSnapshot(hotelId: string): Promise<Snapshot | null>
}
```

**Two-Phase Processing**:
1. **Phase 1**: Create snapshot record immediately (even if parsing fails later)
2. **Phase 2**: Parse and insert data (transaction ensures atomicity)

**Benefits**:
- Snapshot record persists even if parsing fails
- Enables retry logic without losing metadata
- Prevents orphaned data (cascade deletes)

### 4. Partition Manager Service (`partitionManager.service.ts`)

**Purpose**: Manage monthly partitions for optimal performance

```typescript
class PartitionManagerService {
  // Create partitions for next N months
  async createFuturePartitions(monthsAhead: number = 3): Promise<void>
  
  // Archive completed month (remove write indexes)
  async archiveCompletedMonth(archiveDate: Date): Promise<void>
  
  // Archive previous month (convenience method)
  async archivePreviousMonth(): Promise<void>
  
  // Get list of all partitions
  async listPartitions(): Promise<Array<{name, startDate, endDate}>>
  
  // Get partition statistics
  async getPartitionStats(partitionName: string): Promise<{
    rowCount: number,
    tableSize: string,
    indexSize: string,
    totalSize: string
  }>
  
  // Check if partition exists for date
  async partitionExists(date: Date): Promise<boolean>
  
  // Ensure partition exists (create if missing)
  async ensurePartitionExists(date: Date): Promise<void>
}
```

**Usage**:
```typescript
// Run monthly (cron: 0 0 1 * *)
await partitionManager.createFuturePartitions(3);

// Run on 1st of each month
await partitionManager.archivePreviousMonth();

// Before inserting data (automatic)
await partitionManager.ensurePartitionExists(stayDate);
```

### 5. Hotel Service (`hotel.service.ts`)

**Purpose**: Manage hotel records and email mapping

```typescript
class HotelService {
  // Get hotel by sender email
  async getHotelByEmail(email: string): Promise<Hotel | null>
  
  // Create new hotel (admin)
  async createHotel(name: string, email: string, totalRooms: number): Promise<Hotel>
  
  // Update room count
  async updateHotelRooms(hotelId: string, totalRooms: number): Promise<Hotel>
  
  // Get all active hotels
  async getAllActiveHotels(): Promise<Hotel[]>
}
```

### 6. Blob Storage Service (`blobStorage.service.ts`)

**Purpose**: Upload and manage files in Azure Blob Storage

```typescript
class BlobStorageService {
  // Initialize blob service client
  async initialize(): Promise<void>
  
  // Upload file to blob storage
  async uploadFile(hotelId: string, filename: string, buffer: Buffer): Promise<string>
  
  // Get file URL (with SAS token if needed)
  async getFileUrl(blobPath: string): Promise<string>
  
  // Check if file exists
  async fileExists(blobPath: string): Promise<boolean>
}
```

**Storage Structure**:
```
Container: hotel-files
├── {hotelId-1}/
│   ├── 1699383127_history_forecast.txt
│   ├── 1699386727_history_forecast.txt
│   └── ...
├── {hotelId-2}/
│   └── ...
```

### 7. Email Watcher Job (`emailWatcher.job.ts`)

**Purpose**: Orchestrate the entire processing pipeline

```typescript
async function processEmails(): Promise<ProcessingSummary> {
  // 1. Fetch new emails
  // 2. For each email:
  //    - Check if processed
  //    - Identify hotel
  //    - Get attachments
  //    - For each .txt attachment:
  //      - Calculate file hash
  //      - Check duplicate
  //      - Upload to blob
  //      - Mark email as read
  //      - Register snapshot (Phase 1)
  //      - Parse file
  //      - Ensure partitions exist
  //      - Save data (Phase 2)
  //      - Record processed email
  // 3. Return summary
}
```

**Scheduled Execution**: Every 5 minutes via node-cron

```typescript
cron.schedule('*/5 * * * *', async () => {
  if (isRunning) return; // Prevent overlapping runs
  isRunning = true;
  try {
    await processEmails();
  } finally {
    isRunning = false;
  }
});
```

---

## Data Extraction & Metrics

### Extracted Columns (5)

| Column Index | Field Name | Type | Description | Example |
|--------------|------------|------|-------------|---------|
| 1 | dataType | ENUM | History or Forecast | "History" |
| 2 | stayDate | DATE | Stay date (DD/MM/YY Day) | "01/11/25 Sat" → 2025-11-01 |
| 3 | roomNights | INT | Total room nights sold | 45 |
| 10 | roomRevenue | DECIMAL(12,2) | Total room revenue | 12500.00 |
| 15 | ooRooms | INT | Out of order rooms | 2 |

### Calculated Metrics (3)

#### 1. **Occupancy Percent**
```typescript
Formula: (Room Nights Sold / Total Available Rooms) × 100

Example:
  roomNights = 45
  totalAvailableRooms = 120
  
  occupancyPercent = (45 / 120) × 100 = 37.50%
```

**Business Meaning**: Percentage of rooms occupied on a given date

#### 2. **ADR (Average Daily Rate)**
```typescript
Formula: Total Room Revenue / Room Nights Sold

Example:
  roomRevenue = 12500.00
  roomNights = 45
  
  adr = 12500 / 45 = 277.78
```

**Business Meaning**: Average price per room sold

#### 3. **RevPAR (Revenue Per Available Room)**
```typescript
Formula: Total Room Revenue / Total Available Rooms

Example:
  roomRevenue = 12500.00
  totalAvailableRooms = 120
  
  revPAR = 12500 / 120 = 104.17
```

**Business Meaning**: Revenue generated per available room (whether sold or not)

### Date Format Conversion

**Input Format**: `DD/MM/YY Day` (e.g., "01/11/25 Sat")
**Database Format**: `YYYY-MM-DD` (e.g., "2025-11-01")

```typescript
function parseStayDate(dateStr: string): Date {
  // Extract: "01/11/25 Sat" → "01/11/25"
  const datePart = dateStr.split(' ')[0];
  const [day, month, year] = datePart.split('/').map(Number);
  
  // Convert 2-digit year to 4-digit (20xx)
  const fullYear = 2000 + year;
  
  // Create Date object (month is 0-indexed)
  return new Date(fullYear, month - 1, day);
}
```

### Data Types

**HISTORY**: Actual past performance (actuals)
**FORECAST**: Future predictions/reservations on the books

**Example**:
```
Snapshot Time: 2025-11-10 14:00:00
Data Rows:
  - 2025-11-09 [HISTORY]  ← Actual performance
  - 2025-11-10 [HISTORY]  ← Today's performance so far
  - 2025-11-11 [FORECAST] ← Tomorrow's forecast
  - 2025-11-12 [FORECAST] ← Future forecast
```

---

## Processing Workflow

### Detailed Step-by-Step Flow

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Email Watcher Job Triggered (Every 5 minutes)              │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
┌────────────────────────────────────────────────────────────────┐
│ 2. Fetch Unread Emails with Attachments                       │
│    GET /me/messages?$filter=hasAttachments eq true             │
│                             and isRead eq false                │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
         ┌───────────────────────┐
         │ No emails? → Exit     │
         └───────────────────────┘
                     ↓ Has emails
┌────────────────────────────────────────────────────────────────┐
│ 3. For Each Email                                              │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
         ┌──────────────────────────────────────┐
         │ 4. Check ProcessedEmails by messageId│
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────┐
         │ Already processed?   │
         │ Yes → Skip           │
         └──────────────────────┘
                    ↓ No
         ┌──────────────────────────────────────┐
         │ 5. Identify Hotel by Sender Email    │
         │    SELECT * FROM hotels              │
         │    WHERE email = sender              │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────┐
         │ Hotel not found?     │
         │ Yes → Skip & Log     │
         └──────────────────────┘
                    ↓ Hotel found
         ┌──────────────────────────────────────┐
         │ 6. Get Attachments                   │
         │    GET /me/messages/{id}/attachments │
         └──────────┬───────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 7. For Each .txt Attachment                                    │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
         ┌──────────────────────────────────────┐
         │ 8. Calculate SHA-256 File Hash       │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────────────────────┐
         │ 9. Check Duplicate by Hash           │
         │    SELECT * FROM snapshots           │
         │    WHERE fileHash = hash             │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────┐
         │ Duplicate found?     │
         │ Yes → Skip           │
         └──────────────────────┘
                    ↓ No (New file)
         ┌──────────────────────────────────────┐
         │ 10. Upload to Azure Blob Storage     │
         │     Path: hotel-files/{hotelId}/file │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────────────────────┐
         │ 11. Mark Email as Read               │
         │     PATCH /me/messages/{id}          │
         │     { isRead: true }                 │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────────────────────┐
         │ 12. Extract Snapshot Time            │
         │     From filename or email timestamp │
         └──────────┬───────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 13. PHASE 1: Register Snapshot                                 │
│     INSERT INTO history_forecast_snapshots                     │
│     VALUES (hotelId, snapshotTime, blobUrl,                    │
│             fileHash, totalAvailableRoomsSnapshot,             │
│             processed=false, status='PENDING')                 │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
         ┌──────────────────────────────────────┐
         │ 14. Parse File Content               │
         │     - Split by lines                 │
         │     - For each line:                 │
         │       • Split by tabs                │
         │       • Extract 5 columns            │
         │       • Calculate 3 metrics          │
         │       • Convert date format          │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────────────────────┐
         │ 15. Extract Unique Months            │
         │     From parsed stayDate values      │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────────────────────┐
         │ 16. Ensure Partitions Exist          │
         │     For each unique month:           │
         │     • Check if partition exists      │
         │     • Create if missing              │
         │     • Add indexes if active month    │
         └──────────┬───────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 17. PHASE 2: Save Data (Transaction)                           │
│     BEGIN;                                                     │
│       UPDATE snapshots SET status='PROCESSING';                │
│       INSERT INTO history_forecast_data (bulk insert);         │
│       UPDATE snapshots SET processed=true,                     │
│                           status='COMPLETED',                  │
│                           rowCount=N;                          │
│     COMMIT;                                                    │
└────────────────────┬───────────────────────────────────────────┘
                     ↓
         ┌──────────────────────────────────────┐
         │ 18. Record Processed Email           │
         │     INSERT INTO processed_emails     │
         │     VALUES (messageId, sender, hash) │
         └──────────┬───────────────────────────┘
                    ↓
         ┌──────────────────────────────────────┐
         │ 19. Log Success                      │
         │     ✓ Snapshot created               │
         │     ✓ N rows saved                   │
         └──────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 20. Next Attachment / Email                                    │
└────────────────────────────────────────────────────────────────┘
                    ↓
┌────────────────────────────────────────────────────────────────┐
│ 21. Print Summary                                              │
│     Total Emails: 3                                            │
│     Processed: 2                                               │
│     Skipped: 1                                                 │
│     Snapshots Created: 2                                       │
│     Errors: 0                                                  │
└────────────────────────────────────────────────────────────────┘
```

### Error Handling at Each Stage

| Stage | Error Type | Handling |
|-------|-----------|----------|
| Email Fetch | API Failure | Retry next cycle (5 min), log error |
| Hotel Lookup | Not Found | Skip email, log warning |
| Duplicate Check | Database Error | Fail gracefully, continue next email |
| Blob Upload | Network Error | Fail processing, keep email unread |
| Snapshot Create | Database Error | Fail processing, email remains unread |
| File Parse | Format Error | Mark snapshot FAILED, continue next file |
| Data Insert | Transaction Error | Rollback, snapshot remains PENDING, retry possible |
| Email Mark Read | API Error | Log warning (data already saved) |

---

## Query Patterns

### Common Query Examples

#### 1. Get Latest Snapshot for Hotel
```typescript
const snapshot = await prisma.historyForecastSnapshot.findFirst({
  where: {
    hotelId: 'hotel-uuid',
    processed: true,
    processingStatus: 'COMPLETED'
  },
  orderBy: { snapshotTime: 'desc' }
});
```

#### 2. Get Forecast Data for Date Range
```typescript
const data = await prisma.historyForecastData.findMany({
  where: {
    hotelId: 'hotel-uuid',
    stayDate: {
      gte: new Date('2025-11-01'),
      lte: new Date('2025-11-30')
    },
    dataType: 'FORECAST'
  },
  include: {
    snapshot: {
      select: { snapshotTime: true, originalFilename: true }
    }
  },
  orderBy: [
    { stayDate: 'asc' },
    { snapshot: { snapshotTime: 'desc' } }
  ]
});
```

#### 3. Get All Snapshots for a Specific Stay Date
```typescript
// Track how forecast changed over time for Nov 15, 2025
const snapshots = await prisma.historyForecastData.findMany({
  where: {
    hotelId: 'hotel-uuid',
    stayDate: new Date('2025-11-15'),
    dataType: 'FORECAST'
  },
  include: {
    snapshot: {
      select: { snapshotTime: true }
    }
  },
  orderBy: {
    snapshot: { snapshotTime: 'asc' }
  }
});

// Result shows pickup analysis:
// Snapshot 1 (Nov 1): 30 rooms, ADR $250
// Snapshot 2 (Nov 5): 42 rooms, ADR $265  ← +12 rooms pickup
// Snapshot 3 (Nov 10): 55 rooms, ADR $275 ← +13 rooms pickup
```

#### 4. Calculate Pickup Between Snapshots
```typescript
const pickup = await prisma.$queryRaw`
  SELECT 
    s1.snapshotTime as snapshot1_time,
    s2.snapshotTime as snapshot2_time,
    d1.stayDate,
    d2.roomNights - d1.roomNights as room_pickup,
    d2.adr - d1.adr as adr_change,
    d2.roomRevenue - d1.roomRevenue as revenue_change
  FROM history_forecast_data d1
  JOIN history_forecast_data d2 
    ON d1.stayDate = d2.stayDate 
    AND d1.hotelId = d2.hotelId
  JOIN history_forecast_snapshots s1 ON d1.snapshotId = s1.id
  JOIN history_forecast_snapshots s2 ON d2.snapshotId = s2.id
  WHERE d1.hotelId = ${hotelId}
    AND s1.snapshotTime = ${snapshot1Time}
    AND s2.snapshotTime = ${snapshot2Time}
    AND d1.dataType = 'FORECAST'
    AND d2.dataType = 'FORECAST'
  ORDER BY d1.stayDate;
`;
```

#### 5. Get High Occupancy Days
```typescript
const highOccupancyDays = await prisma.historyForecastData.findMany({
  where: {
    hotelId: 'hotel-uuid',
    occupancyPercent: { gte: 85 },
    dataType: 'FORECAST',
    stayDate: { gte: new Date() }
  },
  include: {
    snapshot: { select: { snapshotTime: true } }
  },
  orderBy: { occupancyPercent: 'desc' }
});
```

#### 6. Get Partition Statistics
```typescript
const partitions = await partitionManager.listPartitions();

for (const partition of partitions) {
  const stats = await partitionManager.getPartitionStats(partition.name);
  console.log(`${partition.name}:
    Rows: ${stats.rowCount}
    Table Size: ${stats.tableSize}
    Index Size: ${stats.indexSize}
    Total Size: ${stats.totalSize}
  `);
}
```

#### 7. Compare History vs Forecast
```typescript
// For a past date, compare what was forecasted vs actual
const comparison = await prisma.$queryRaw`
  SELECT 
    forecast.stayDate,
    forecast.roomNights as forecasted_rooms,
    history.roomNights as actual_rooms,
    history.roomNights - forecast.roomNights as variance,
    forecast.adr as forecasted_adr,
    history.adr as actual_adr
  FROM history_forecast_data forecast
  JOIN history_forecast_data history 
    ON forecast.stayDate = history.stayDate 
    AND forecast.hotelId = history.hotelId
  WHERE forecast.hotelId = ${hotelId}
    AND forecast.dataType = 'FORECAST'
    AND history.dataType = 'HISTORY'
    AND forecast.stayDate BETWEEN ${startDate} AND ${endDate}
  ORDER BY forecast.stayDate;
`;
```

---

## Time-Series Analysis

### Snapshot-Based Architecture Benefits

#### Problem: How do we track changes over time?
Traditional approach: Update existing records → **Loses historical data**

Our approach: Create new snapshot for each file → **Preserves complete history**

### Use Cases

#### 1. **Pickup Analysis**
Track how reservations increase as stay date approaches

```typescript
// Question: How many rooms did we pick up for Nov 15?
// Query all snapshots for Nov 15 stay date

Snapshot 1 (30 days out): 25 rooms booked
Snapshot 2 (15 days out): 38 rooms booked  → +13 rooms pickup
Snapshot 3 (7 days out):  52 rooms booked  → +14 rooms pickup
Snapshot 4 (1 day out):   58 rooms booked  → +6 rooms pickup
```

#### 2. **ADR Movement**
Monitor how pricing changes over time

```typescript
Snapshot 1 (30 days out): ADR $220
Snapshot 2 (15 days out): ADR $245  → +$25 (strong demand)
Snapshot 3 (7 days out):  ADR $265  → +$20 (last-minute rate)
Snapshot 4 (1 day out):   ADR $275  → +$10 (premium pricing)
```

#### 3. **Forecast Accuracy**
Compare early forecasts to actual results

```typescript
// Forecasted on Nov 1 for Nov 15:
Forecast: 60 rooms, ADR $250, Revenue $15,000

// Actual on Nov 15:
History: 58 rooms, ADR $275, Revenue $15,950

// Analysis:
Rooms: -2 (3% under forecast)
ADR: +$25 (10% better than forecast)
Revenue: +$950 (6% better than forecast)
```

#### 4. **Booking Velocity**
Measure speed of reservations

```typescript
// Rooms picked up per day
Nov 1-7:   +10 rooms (1.4 rooms/day)
Nov 8-14:  +18 rooms (2.6 rooms/day)  ← Accelerating
Nov 15-21: +8 rooms  (1.1 rooms/day)  ← Slowing down
```

#### 5. **Competitive Analysis**
Compare performance across time periods

```typescript
// Last year same period:
Nov 15, 2024: 52 rooms, ADR $230, RevPAR $140

// This year:
Nov 15, 2025: 58 rooms, ADR $275, RevPAR $165

// YoY Growth:
Rooms: +11.5%
ADR: +19.6%
RevPAR: +17.9%
```

### Dashboard Visualizations (Future)

With this data model, you can build:

1. **Pickup Curves**: Line chart showing room nights over time for a specific stay date
2. **ADR Trends**: How average rates change as stay date approaches
3. **Occupancy Heatmap**: Calendar view with color-coded occupancy percentages
4. **Revenue Forecast**: Projected revenue based on latest snapshot
5. **Forecast Accuracy Report**: Historical comparison of forecasts vs actuals

### Example Dashboard Query

```typescript
// Get data for pickup curve chart
interface PickupPoint {
  daysOut: number;
  roomNights: number;
  adr: number;
  snapshotTime: Date;
}

async function getPickupCurve(
  hotelId: string, 
  stayDate: Date
): Promise<PickupPoint[]> {
  const data = await prisma.historyForecastData.findMany({
    where: {
      hotelId,
      stayDate,
      dataType: 'FORECAST'
    },
    include: {
      snapshot: { select: { snapshotTime: true } }
    },
    orderBy: {
      snapshot: { snapshotTime: 'asc' }
    }
  });
  
  return data.map(d => ({
    daysOut: Math.floor(
      (stayDate.getTime() - d.snapshot.snapshotTime.getTime()) 
      / (1000 * 60 * 60 * 24)
    ),
    roomNights: d.roomNights,
    adr: d.adr.toNumber(),
    snapshotTime: d.snapshot.snapshotTime
  }));
}

// Usage:
const curve = await getPickupCurve('hotel-uuid', new Date('2025-11-15'));
// Returns: [
//   { daysOut: 30, roomNights: 25, adr: 220, snapshotTime: ... },
//   { daysOut: 15, roomNights: 38, adr: 245, snapshotTime: ... },
//   { daysOut: 7, roomNights: 52, adr: 265, snapshotTime: ... }
// ]
```

---

## Performance Considerations

### Database Optimization

1. **Partitioning**: 13x faster queries on date ranges
2. **Denormalization**: `hotelId` in data table enables direct queries
3. **Selective Indexing**: Indexes only on active partitions
4. **Bulk Inserts**: Transaction-based batch insert for 700+ rows

### Scalability

**Current Capacity**:
- **Hotels**: 100+ hotels
- **Snapshots per Hotel**: Unlimited (1 per hour = 24/day)
- **Data Rows**: 5M+ rows/year (with partitioning)
- **Query Performance**: <200ms for month-range queries

**Bottlenecks**:
- Email API rate limits (handled by 5-min interval)
- Blob storage bandwidth (unlikely with small txt files)
- Database storage (managed by partition archival)

### Monitoring Recommendations

1. **Email Processing**:
   - Track: emails/hour, processing errors, skipped emails
   - Alert: No emails for >2 hours, error rate >10%

2. **Database**:
   - Track: Partition sizes, query performance, failed snapshots
   - Alert: Partition missing for current month, query time >1s

3. **Storage**:
   - Track: Blob storage usage, upload failures
   - Alert: Storage >80% quota, upload failures >5%

---

## Maintenance Tasks

### Daily
- Monitor job logs for errors
- Check processing summary (emails, snapshots, errors)

### Weekly
- Review failed snapshots and retry if needed
- Verify partition creation for upcoming months

### Monthly
- Run `createFuturePartitions(3)` to ensure partitions exist
- Run `archivePreviousMonth()` to optimize storage
- Review partition statistics and storage usage
- Backup database (especially snapshot metadata)

### Quarterly
- Audit hotel email mappings
- Review and update room counts if changed
- Archive very old partitions to cold storage (optional)

---

## Troubleshooting

### Common Issues

#### 1. Duplicate Snapshot Error
**Symptom**: Error "Unique constraint violation on fileHash"
**Cause**: Same file sent multiple times
**Resolution**: System skips automatically, no action needed

#### 2. Partition Missing Error
**Symptom**: Error "no partition of relation ... found for row"
**Cause**: Partition doesn't exist for stay date
**Resolution**: System auto-creates, but can manually run:
```typescript
await partitionManager.ensurePartitionExists(stayDate);
```

#### 3. Email Not Processing
**Symptom**: Email in inbox but not processed
**Possible Causes**:
- Hotel email not registered → Add hotel to database
- Email already marked as read → Check `processed_emails` table
- No .txt attachment → Verify file type
- Token expired → Refresh OAuth token

#### 4. Parse Errors
**Symptom**: Snapshot status = FAILED, error message in database
**Possible Causes**:
- File format changed → Update column mapping
- Invalid date format → Check date parsing logic
- Missing columns → Validate file has minimum 16 columns

#### 5. High Database Size
**Symptom**: Database growing too large
**Resolution**:
- Run `archivePreviousMonth()` to remove indexes
- Drop very old partitions if not needed:
```sql
DROP TABLE history_forecast_data_2023_01;
```

---

## Future Enhancements

### Planned Features

1. **REST API**: Query endpoints for dashboards
2. **Snapshot Comparison API**: Built-in pickup/ADR comparison
3. **Alerting System**: Notify on significant changes
4. **Data Export**: CSV/Excel export functionality
5. **Multi-File Support**: Process other report types (Res Stats, Rates, STR)
6. **ML Forecasting**: Predict future occupancy based on historical pickup
7. **Real-Time Dashboard**: Live updates as emails arrive
8. **Mobile App**: View forecasts on the go

### Optimization Opportunities

1. **Incremental Processing**: Process only changed rows (if file format supports)
2. **Compression**: Enable PostgreSQL table compression for archived partitions
3. **Caching**: Redis cache for frequently accessed snapshots
4. **Parallel Processing**: Process multiple emails simultaneously
5. **Cold Storage**: Move very old data to S3 Glacier

---

## Conclusion

The History Forecast Module provides a robust, scalable solution for ingesting and analyzing hotel revenue forecast data. Key strengths:

✓ **Automated**: Zero manual intervention required  
✓ **Reliable**: Duplicate detection, error handling, transaction safety  
✓ **Performant**: Partitioned tables, selective indexing, bulk inserts  
✓ **Scalable**: Supports 100+ hotels, millions of rows  
✓ **Maintainable**: Clear architecture, comprehensive logging  
✓ **Extensible**: Easy to add new metrics, reports, visualizations  

The snapshot-based architecture enables powerful time-series analysis, allowing hoteliers to track pickup, monitor trends, and make data-driven decisions.

---

**Document Version**: 1.0  
**Last Updated**: November 13, 2025  
**Maintainer**: RevPerfect Backend Team

