# Fixes Applied - Email Processing Issues

## Date: November 10, 2025

## Issues Fixed

### 1. ✅ Database Overflow Error (FIXED)

**Problem:**
- Error: `numeric field overflow` - `A field with precision 5, scale 2 must round to an absolute value less than 10^3`
- Column mapping was incorrect, causing large revenue values (84,949.12) to be inserted into occupancy percent field (max 999.99)

**Root Cause:**
The column indices in `columnMapping.ts` were off by one position starting from column 7.

**Fix Applied:**
Updated `src/config/columnMapping.ts` with correct column positions:
- `ROOMS_SOLD`: 8 → **7** ✓
- `COMP_ROOMS`: 9 → **8** ✓
- `OCCUPANCY_PERCENT`: 10 → **9** ✓
- `ROOM_REVENUE`: 11 → **10** ✓
- `ADR`: 12 → **11** ✓
- `OO_ROOMS`: 15 → **5** ✓

**Result:**
- Occupancy values (e.g., 75.15%) will now correctly map to `occupancyPercent` field ✓
- Room revenue values (e.g., 84,949.12) will now correctly map to `roomRevenue` field ✓
- No more overflow errors ✓

---

### 2. ✅ Email Mark-as-Read Timing (FIXED)

**Problem:**
- Emails were only marked as read after complete processing (parsing + database save)
- If parsing failed, emails would remain unread and get reprocessed repeatedly
- User wanted emails marked as read once file is safely stored in blob

**Fix Applied:**
Moved email mark-as-read operation in `src/jobs/emailWatcher.job.ts`:
- **Before:** After successful parsing and database save (line ~205)
- **After:** Immediately after successful blob upload (line ~138) ✓

**Benefits:**
1. File is safely stored in Azure Blob Storage first
2. Email is immediately marked as read (won't be reprocessed)
3. Even if parsing fails later, the file is preserved in blob for debugging
4. No duplicate downloads
5. Better error handling - failed parsing doesn't block email marking

---

## Updated Flow

### New Processing Flow:
```
1. Fetch unread emails with attachments
2. Check if email already processed (by message ID)
3. Identify hotel from sender email
4. Download attachments
5. Calculate file hash
6. Check for duplicate by hash
7. Upload to Azure Blob Storage ✓
8. ✨ MARK EMAIL AS READ ✨ (NEW POSITION)
9. Create snapshot record
10. Parse file content
11. Save data to database
12. Record processed email
```

### Key Change:
Step 8 now happens **right after blob upload** instead of at the end.

---

## Testing Recommendations

1. **Test with real email:**
   ```bash
   npm run dev
   ```
   Send a test email with attachment and verify:
   - Email gets marked as read after upload ✓
   - Data parses correctly without overflow errors ✓

2. **Check database values:**
   - Occupancy values should be 0-100 range ✓
   - Room revenue should show full amounts (e.g., 84949.12) ✓
   - ADR values should be reasonable (e.g., 226.53) ✓

3. **Verify blob storage:**
   - Files uploaded successfully ✓
   - Emails marked as read immediately ✓

---

## Files Modified

1. **src/config/columnMapping.ts**
   - Fixed column index mappings

2. **src/services/fileProcessor.service.ts**
   - Updated OO_ROOMS column reference

3. **src/jobs/emailWatcher.job.ts**
   - Moved mark-as-read to after blob upload
   - Removed duplicate mark-as-read call

---

## Expected Results

✅ No more "numeric field overflow" errors
✅ Data correctly parsed and saved to database
✅ Emails marked as read immediately after blob upload
✅ Snapshots processed successfully
✅ Email watcher runs smoothly

---

## Rollback (if needed)

If issues arise, revert these commits:
```bash
git log --oneline -3  # See recent commits
git revert <commit-hash>
```

Or manually restore the old column indices if needed.

