import { prisma } from '../utils/prisma.js';
import type { ParsedRow, SnapshotMetadata } from '../types/fileProcessor.types.js';
import type {
  HistoryForecastSnapshot,
  HistoryForecastData,
} from '@prisma/client';
import { partitionManagerService } from './partitionManager.service.js';

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
   * @returns Created snapshot
   */
  async createSnapshotRecord(
    metadata: SnapshotMetadata,
    totalAvailableRoomsSnapshot: number
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
          uploadedAt: metadata.uploadedAt,
          processed: false,
          processingStatus: 'PENDING',
        },
      });

      console.log(
        `Snapshot record created: ${snapshot.id} for hotel ${metadata.hotelId}`
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

      // Ensure partitions exist for all dates in the data (BEFORE transaction)
      // Get unique months from the rows
      const uniqueMonths = new Set<string>();
      rows.forEach((row) => {
        const monthStart = new Date(
          row.stayDate.getFullYear(),
          row.stayDate.getMonth(),
          1
        );
        uniqueMonths.add(monthStart.toISOString());
      });

      // Ensure partitions exist for each month (must be done outside transaction)
      console.log(`Ensuring partitions exist for ${uniqueMonths.size} unique months...`);
      for (const monthStr of uniqueMonths) {
        const monthDate = new Date(monthStr);
        await partitionManagerService.ensurePartitionExists(monthDate);
      }
      console.log('✓ All required partitions are available');

      // Use transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Update snapshot status to processing
        await tx.historyForecastSnapshot.update({
          where: { id: snapshotId },
          data: { processingStatus: 'PROCESSING' },
        });

        // Bulk insert data rows with hotelId
        const dataRecords = rows.map((row) => ({
          snapshotId,
          hotelId: snapshot.hotelId,
          stayDate: row.stayDate,
          dataType: row.dataType,
          roomNights: row.roomNights,
          roomRevenue: row.roomRevenue,
          ooRooms: row.ooRooms,
          occupancyPercent: row.occupancyPercent,
          adr: row.adr,
          revPAR: row.revPAR,
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
      // Mark snapshot as failed
      await this.markSnapshotFailed(
        snapshotId,
        error instanceof Error ? error.message : 'Unknown error'
      );
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
}

// Export singleton instance
export const snapshotService = new SnapshotService();
export default snapshotService;

