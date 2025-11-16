<!-- ab92d4cc-d02e-4e81-8ceb-19a98099f29c 87dff501-adbb-436c-82d1-22c254d8956c -->
# Hotel Onboarding & Actuals Management System

## Phase 1: Database Schema & Partition Removal

### 1.1 Update Prisma Schema

**File**: `backend/prisma/schema.prisma`

- Add `isSeedSnapshot Boolean @default(false)` to `HistoryForecastSnapshot` model
- Expand `HistoryForecastData` model to include 30 raw columns (col1-col30 as String)
- Keep existing calculated fields: `occupancyPercent`, `adr`, `revPAR`
- Remove partition-related comments/notes

### 1.2 Create Migration to Remove Partitions

**New file**: `backend/prisma/migrations/[timestamp]_remove_partitions_expand_columns/migration.sql`

- Convert `history_forecast_data` from partitioned to regular table
- Add 25 new columns (col6-col30) as TEXT
- Drop partition functions and triggers
- Preserve existing data and indexes

### 1.3 Remove Partition Manager Service

**Files to modify**:

- Delete `backend/src/services/partitionManager.service.ts`
- Remove partition imports from `backend/src/services/snapshot.service.ts`
- Remove `ensurePartitionExists()` calls from `saveSnapshotData()`
- Remove partition-related jobs from `backend/src/jobs/scheduler.ts`

## Phase 2: Expand Column Mapping

### 2.1 Update Column Mapping Configuration

**File**: `backend/src/config/columnMapping.ts`

- Expand `COLUMN_INDICES` to map all 30 columns (skip column 0)
- Columns 1-5: Keep existing names (DATA_TYPE, STAY_DATE, ROOM_NIGHTS, ROOM_REVENUE, OO_ROOMS)
- Columns 6-30: Add as COL_A through COL_Y (placeholder names)
- Keep existing parse functions

### 2.2 Update File Processor

**File**: `backend/src/services/fileProcessor.service.ts`

- Modify `parseLine()` to extract all 30 columns
- Store all as strings (raw values)
- Keep calculating occupancyPercent, adr, revPAR from columns 3, 10, and totalAvailableRooms
- Update `ParsedRow` type to include all 30 columns

### 2.3 Update Type Definitions

**File**: `backend/src/types/fileProcessor.types.ts`

- Add fields col1-col30 to `ParsedRow` interface
- Keep existing calculated metric fields

## Phase 3: Seed Snapshot Upload API

### 3.1 Install File Upload Dependencies

**Command**: `npm install multer @types/multer --save` (in backend)

### 3.2 Create Seed Upload Endpoint

**File**: `backend/src/routes/api.ts`

Add new endpoint:

```typescript
POST /api/hotels/:hotelId/seed
- Accepts multipart/form-data with 'file' field
- Validates hotelId exists
- Calculates file hash
- Uploads to Azure Blob Storage
- Creates snapshot with isSeedSnapshot: true
- Sets snapshotTime to provided onboardingDate (query param) or current date
- Parses all 30 columns
- Saves to HistoryForecastData
```

## Phase 4: Last 7 Days Override Logic

### 4.1 Add Override Function to Snapshot Service

**File**: `backend/src/services/snapshot.service.ts`

Add new method:

```typescript
async updateSeedActualsWithHistory(
  hotelId: string,
  historyRows: ParsedRow[]
): Promise<void>
```

Logic:

- Find seed snapshot for hotel (`isSeedSnapshot: true`)
- Get last 7 rows with dataType='HISTORY' from historyRows
- For each history row, check if stayDate exists in seed snapshot data
- If exists: UPDATE all 30 columns + recalculate metrics
- If not exists: skip (only update dates from original seed data)

### 4.2 Integrate Override into Email Watcher

**File**: `backend/src/jobs/emailWatcher.job.ts`

After `saveSnapshotData()`:

- Filter parsed rows where dataType='HISTORY'
- If history rows exist, call `updateSeedActualsWithHistory()`
- Log update summary

## Phase 5: Comparison API Enhancements

### 5.1 Add Daily Comparison Endpoint

**File**: `backend/src/routes/api.ts`

New endpoint:

```typescript
GET /api/pickup/:hotelId/daily?snapshot1Id&snapshot2Id
- Returns day-by-day comparison (not monthly aggregation)
- Each row: one stay date with pickup metrics
```

### 5.2 Add Actual vs Snapshot Endpoint

**File**: `backend/src/routes/api.ts`

New endpoint:

```typescript
GET /api/comparison/:hotelId/actual-vs-snapshot?snapshotId
- Compares seed snapshot (actuals) vs selected snapshot
- Returns daily differences
```

### 5.3 Add STLY Comparison Endpoint

**File**: `backend/src/routes/api.ts`

New endpoint:

```typescript
GET /api/comparison/:hotelId/stly?date
- Finds snapshot from 1 year ago for given date
- Compares latest snapshot vs STLY snapshot
- Returns daily comparison
```

### 5.4 Update Existing Pickup Endpoint

**File**: `backend/src/routes/api.ts`

Modify `/api/pickup/:hotelId`:

- Filter out seed snapshots: `WHERE isSeedSnapshot = false`
- Only compare hourly snapshots by default

## Phase 6: Frontend Updates

### 6.1 Add View Toggle Component

**New file**: `frontend/src/components/Tables/top-channels/view-toggle.tsx`

- Client component with state for "Monthly" vs "Daily" view
- Radio buttons or toggle switch

### 6.2 Add Comparison Type Selector

**New file**: `frontend/src/components/Tables/top-channels/comparison-selector.tsx`

- Dropdown: "Pickup", "Actual vs Snapshot", "STLY"
- Client component with state

### 6.3 Update Fetch Functions

**File**: `frontend/src/components/Tables/fetch.ts`

Add new functions:

- `getDailyPickup(hotelId, snapshot1Id?, snapshot2Id?)`
- `getActualVsSnapshot(hotelId, snapshotId)`
- `getSTLYComparison(hotelId, date)`

### 6.4 Update TopChannels Component

**File**: `frontend/src/components/Tables/top-channels/index.tsx`

- Add view toggle and comparison selector
- Conditionally render monthly or daily table based on view
- Support different data sources based on comparison type

## Phase 7: Testing & Validation

- Test seed upload with 365-day file
- Test hourly snapshot with last 7 days history
- Verify seed data updates correctly
- Test all comparison modes
- Verify partitioning is fully removed
- Test daily and monthly views in frontend

## Migration Notes

- Run `npm run prisma:generate` after schema changes
- Run `npm run prisma:migrate` to apply partition removal
- Existing snapshot data will be preserved
- No data loss during partition-to-regular table conversion

### To-dos

- [x] Update Prisma schema: add isSeedSnapshot, expand to 30 columns, remove partition notes
- [x] Create migration to remove partitions and expand columns
- [x] Remove partition manager service and related code
- [x] Expand column mapping to handle 30 columns with proper naming
- [x] Update file processor to parse all 30 columns
- [x] Create seed upload API endpoint with file upload support
- [x] Implement last 7 days override logic in snapshot service
- [x] Add daily, actual-vs-snapshot, and STLY comparison endpoints
- [x] Add view toggle and comparison selector components
- [x] Update frontend to support daily view and new comparison modes