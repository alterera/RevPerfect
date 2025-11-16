import { prisma } from '../utils/prisma.js';
import { Prisma } from '@prisma/client';
import type { ParsedRow, SnapshotMetadata } from '../types/fileProcessor.types.js';
import type {
  HistoryForecastSnapshot,
  HistoryForecastData,
} from '@prisma/client';

class SnapshotService {
  /**
   * Check if a file with the same hash already exists
   * @param fileHash - SHA-256 hash of the file
   * @returns Existing snapshot or null
   */
  async checkDuplicateByHash(
    fileHash: string
  ): Promise<HistoryForecastSnapshot | null> {
    try {
      const existing = await prisma.historyForecastSnapshot.findUnique({
        where: { fileHash },
      });

      if (existing) {
        console.log(
          `Duplicate file detected: ${existing.originalFilename} (hash: ${fileHash})`
        );
      }

      return existing;
    } catch (error) {
      console.error('Error checking duplicate by hash:', error);
      throw error;
    }
  }

  /**
   * Create a snapshot record (Phase 1: Before parsing)
   * @param metadata - Snapshot metadata
   * @param totalAvailableRoomsSnapshot - Total available rooms at snapshot time
   * @param isSeedSnapshot - Whether this is a seed snapshot (default: false)
   * @returns Created snapshot
   */
  async createSnapshotRecord(
    metadata: SnapshotMetadata,
    totalAvailableRoomsSnapshot: number,
    isSeedSnapshot: boolean = false
  ): Promise<HistoryForecastSnapshot> {
    try {
      const snapshot = await prisma.historyForecastSnapshot.create({
        data: {
          hotelId: metadata.hotelId,
          snapshotTime: metadata.snapshotTime,
          originalFilename: metadata.originalFilename,
          blobUrl: metadata.blobUrl,
          fileHash: metadata.fileHash,
          totalAvailableRoomsSnapshot,
          isSeedSnapshot,
          uploadedAt: metadata.uploadedAt,
          processed: false,
          processingStatus: 'PENDING',
        },
      });

      console.log(
        `Snapshot record created: ${snapshot.id} for hotel ${metadata.hotelId} (seed: ${isSeedSnapshot})`
      );
      return snapshot;
    } catch (error) {
      console.error('Error creating snapshot record:', error);
      throw error;
    }
  }

  /**
   * Save parsed data to database (Phase 2: After parsing)
   * @param snapshotId - Snapshot ID
   * @param rows - Parsed rows from file
   */
  async saveSnapshotData(
    snapshotId: string,
    rows: ParsedRow[]
  ): Promise<void> {
    try {
      // Get snapshot to retrieve hotelId (outside transaction)
      const snapshot = await prisma.historyForecastSnapshot.findUnique({
        where: { id: snapshotId },
        select: { hotelId: true },
      });

      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      // Use transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Update snapshot status to processing
        await tx.historyForecastSnapshot.update({
          where: { id: snapshotId },
          data: { processingStatus: 'PROCESSING' },
        });

        // Bulk insert data rows with hotelId (all 30 columns)
        // Convert Decimal fields to Prisma Decimal type
        const dataRecords = rows.map((row) => ({
          snapshotId,
          hotelId: snapshot.hotelId,
          stayDate: row.stayDate,
          dataType: row.dataType,
          col1: row.col1,
          col2: row.col2,
          col3: row.col3,
          col4: row.col4,
          col5: row.col5,
          col6: row.col6,
          col7: row.col7,
          col8: row.col8,
          col9: row.col9,
          col10: row.col10,
          col11: row.col11,
          col12: row.col12,
          col13: row.col13,
          col14: row.col14,
          col15: row.col15,
          col16: row.col16,
          col17: row.col17,
          col18: row.col18,
          col19: row.col19,
          col20: row.col20,
          col21: row.col21,
          col22: row.col22,
          col23: row.col23,
          col24: row.col24,
          col25: row.col25,
          col26: row.col26,
          col27: row.col27,
          col28: row.col28,
          col29: row.col29,
          col30: row.col30,
          roomNights: row.roomNights,
          roomRevenue: new Prisma.Decimal(row.roomRevenue),
          ooRooms: row.ooRooms,
          occupancyPercent: new Prisma.Decimal(row.occupancyPercent),
          adr: new Prisma.Decimal(row.adr),
          revPAR: new Prisma.Decimal(row.revPAR),
          rowIndex: row.rowIndex,
        }));

        await tx.historyForecastData.createMany({
          data: dataRecords,
        });

        // Update snapshot as completed
        await tx.historyForecastSnapshot.update({
          where: { id: snapshotId },
          data: {
            processed: true,
            processingStatus: 'COMPLETED',
            rowCount: rows.length,
          },
        });
      });

      console.log(
        `Successfully saved ${rows.length} rows for snapshot ${snapshotId}`
      );
    } catch (error) {
      console.error('Error saving snapshot data:', error);
      
      // Log full error details for debugging
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      // Mark snapshot as failed
      const errorMessage = error instanceof Error 
        ? `${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}`
        : 'Unknown error';
      
      await this.markSnapshotFailed(snapshotId, errorMessage);
      throw error;
    }
  }

  /**
   * Mark snapshot as failed
   * @param snapshotId - Snapshot ID
   * @param error - Error message
   */
  async markSnapshotFailed(
    snapshotId: string,
    error: string
  ): Promise<void> {
    try {
      await prisma.historyForecastSnapshot.update({
        where: { id: snapshotId },
        data: {
          processingStatus: 'FAILED',
          processingError: error,
        },
      });

      console.log(`Snapshot ${snapshotId} marked as failed: ${error}`);
    } catch (err) {
      console.error('Error marking snapshot as failed:', err);
    }
  }

  /**
   * Get snapshots for a hotel
   * @param hotelId - Hotel ID
   * @param limit - Maximum number of snapshots to return
   * @returns Array of snapshots
   */
  async getSnapshotsByHotel(
    hotelId: string,
    limit: number = 100
  ): Promise<HistoryForecastSnapshot[]> {
    try {
      const snapshots = await prisma.historyForecastSnapshot.findMany({
        where: { hotelId },
        orderBy: { snapshotTime: 'desc' },
        take: limit,
      });

      return snapshots;
    } catch (error) {
      console.error('Error fetching snapshots:', error);
      throw error;
    }
  }

  /**
   * Get data for a specific snapshot
   * @param snapshotId - Snapshot ID
   * @returns Array of forecast data
   */
  async getSnapshotData(
    snapshotId: string
  ): Promise<HistoryForecastData[]> {
    try {
      const data = await prisma.historyForecastData.findMany({
        where: { snapshotId },
        orderBy: { stayDate: 'asc' },
      });

      return data;
    } catch (error) {
      console.error('Error fetching snapshot data:', error);
      throw error;
    }
  }

  /**
   * Get data by date range across snapshots
   * @param hotelId - Hotel ID
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Array of forecast data with snapshot info
   */
  async getDataByDateRange(
    hotelId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    try {
      // Now we can query directly by hotelId (denormalized) for better performance
      const data = await prisma.historyForecastData.findMany({
        where: {
          hotelId,
          stayDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          snapshot: {
            select: {
              id: true,
              snapshotTime: true,
              originalFilename: true,
            },
          },
        },
        orderBy: [{ stayDate: 'asc' }, { snapshot: { snapshotTime: 'desc' } }],
      });

      return data;
    } catch (error) {
      console.error('Error fetching data by date range:', error);
      throw error;
    }
  }

  /**
   * Get latest snapshot for a hotel
   * @param hotelId - Hotel ID
   * @returns Latest snapshot or null
   */
  async getLatestSnapshot(
    hotelId: string
  ): Promise<HistoryForecastSnapshot | null> {
    try {
      const snapshot = await prisma.historyForecastSnapshot.findFirst({
        where: {
          hotelId,
          processed: true,
          processingStatus: 'COMPLETED',
        },
        orderBy: { snapshotTime: 'desc' },
      });

      return snapshot;
    } catch (error) {
      console.error('Error fetching latest snapshot:', error);
      throw error;
    }
  }

  /**
   * Update seed snapshot actuals with history rows from hourly snapshot
   * Only updates the last 7 days of history data if those dates exist in seed snapshot
   * @param hotelId - Hotel ID
   * @param historyRows - History rows from hourly snapshot (last 7 rows with dataType='HISTORY')
   */
  async updateSeedActualsWithHistory(
    hotelId: string,
    historyRows: ParsedRow[]
  ): Promise<void> {
    try {
      // Find seed snapshot for this hotel
      const seedSnapshot = await prisma.historyForecastSnapshot.findFirst({
        where: {
          hotelId,
          isSeedSnapshot: true,
          processed: true,
          processingStatus: 'COMPLETED',
        },
        orderBy: { snapshotTime: 'asc' }, // Get the earliest seed snapshot
      });

      if (!seedSnapshot) {
        console.log(`No seed snapshot found for hotel ${hotelId}, skipping override`);
        return;
      }

      // Get last 7 rows with dataType='HISTORY'
      const historyData = historyRows
        .filter((row) => row.dataType === 'HISTORY')
        .slice(-7); // Last 7 rows

      if (historyData.length === 0) {
        console.log('No history rows found in snapshot, skipping override');
        return;
      }

      console.log(`Updating seed snapshot with ${historyData.length} history rows...`);

      // Update each history row in seed snapshot if the date exists
      let updatedCount = 0;
      for (const historyRow of historyData) {
        // Check if this stayDate exists in seed snapshot
        const existingRow = await prisma.historyForecastData.findFirst({
          where: {
            snapshotId: seedSnapshot.id,
            stayDate: historyRow.stayDate,
            dataType: 'HISTORY',
          },
        });

        if (existingRow) {
          // Update the row with new values (convert Decimal fields)
          await prisma.historyForecastData.update({
            where: { id: existingRow.id },
            data: {
              col1: historyRow.col1,
              col2: historyRow.col2,
              col3: historyRow.col3,
              col4: historyRow.col4,
              col5: historyRow.col5,
              col6: historyRow.col6,
              col7: historyRow.col7,
              col8: historyRow.col8,
              col9: historyRow.col9,
              col10: historyRow.col10,
              col11: historyRow.col11,
              col12: historyRow.col12,
              col13: historyRow.col13,
              col14: historyRow.col14,
              col15: historyRow.col15,
              col16: historyRow.col16,
              col17: historyRow.col17,
              col18: historyRow.col18,
              col19: historyRow.col19,
              col20: historyRow.col20,
              col21: historyRow.col21,
              col22: historyRow.col22,
              col23: historyRow.col23,
              col24: historyRow.col24,
              col25: historyRow.col25,
              col26: historyRow.col26,
              col27: historyRow.col27,
              col28: historyRow.col28,
              col29: historyRow.col29,
              col30: historyRow.col30,
              roomNights: historyRow.roomNights,
              roomRevenue: new Prisma.Decimal(historyRow.roomRevenue),
              ooRooms: historyRow.ooRooms,
              occupancyPercent: new Prisma.Decimal(historyRow.occupancyPercent),
              adr: new Prisma.Decimal(historyRow.adr),
              revPAR: new Prisma.Decimal(historyRow.revPAR),
            },
          });
          updatedCount++;
        } else {
          console.log(
            `Stay date ${historyRow.stayDate.toISOString()} not found in seed snapshot, skipping`
          );
        }
      }

      console.log(`✓ Updated ${updatedCount} rows in seed snapshot`);
    } catch (error) {
      console.error('Error updating seed actuals with history:', error);
      // Don't throw - this is not critical, just log the error
    }
  }
}

// Export singleton instance
export const snapshotService = new SnapshotService();
export default snapshotService;

