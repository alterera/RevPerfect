import { prisma } from '../utils/prisma.js';

/**
 * Partition Manager Service
 * 
 * Manages monthly partitions for history_forecast_data table.
 * - Creates future partitions automatically
 * - Archives completed months (removes write-optimized indexes)
 * - Optimizes storage for read-only partitions
 */
class PartitionManagerService {
  /**
   * Create partitions for the next N months
   * Should be run monthly to ensure partitions exist before data arrives
   * @param monthsAhead - Number of months ahead to create partitions (default: 3)
   */
  async createFuturePartitions(monthsAhead: number = 3): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(`
        SELECT create_monthly_partition();
      `);

      console.log(
        `✓ Created partitions for the next ${monthsAhead} months`
      );
    } catch (error) {
      console.error('Error creating future partitions:', error);
      throw error;
    }
  }

  /**
   * Archive a completed month
   * Removes write-optimized indexes and optimizes storage for read-only access
   * Should be run after a month is complete and no more data will be written
   * @param archiveDate - Date within the month to archive (e.g., first day of completed month)
   */
  async archiveCompletedMonth(archiveDate: Date): Promise<void> {
    try {
      await prisma.$executeRawUnsafe(
        `SELECT archive_completed_month($1::DATE)`,
        archiveDate
      );

      console.log(
        `✓ Archived month: ${archiveDate.toISOString().split('T')[0]}`
      );
    } catch (error) {
      console.error('Error archiving completed month:', error);
      throw error;
    }
  }

  /**
   * Archive the previous month (convenience method)
   * Gets the first day of last month and archives it
   */
  async archivePreviousMonth(): Promise<void> {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    await this.archiveCompletedMonth(lastMonth);
  }

  /**
   * Get list of all partitions
   * @returns Array of partition names and their date ranges
   */
  async listPartitions(): Promise<
    Array<{ name: string; startDate: Date; endDate: Date }>
  > {
    try {
      const partitions = await prisma.$queryRawUnsafe<Array<{
        schemaname: string;
        tablename: string;
        tableowner: string;
      }>>(`
        SELECT schemaname, tablename, tableowner
        FROM pg_tables
        WHERE tablename LIKE 'history_forecast_data_%'
        ORDER BY tablename;
      `);

      // Extract date ranges from partition names
      const partitionInfo = partitions.map((p) => {
        const match = p.tablename.match(/history_forecast_data_(\d{4})_(\d{2})/);
        if (match) {
          const year = parseInt(match[1], 10);
          const month = parseInt(match[2], 10);
          const startDate = new Date(year, month - 1, 1);
          const endDate = new Date(year, month, 1);

          return {
            name: p.tablename,
            startDate,
            endDate,
          };
        }
        return null;
      });

      return partitionInfo.filter((p): p is NonNullable<typeof p> => p !== null);
    } catch (error) {
      console.error('Error listing partitions:', error);
      throw error;
    }
  }

  /**
   * Get partition statistics
   * @param partitionName - Name of the partition
   * @returns Statistics about the partition
   */
  async getPartitionStats(partitionName: string): Promise<{
    rowCount: number;
    tableSize: string;
    indexSize: string;
    totalSize: string;
  }> {
    try {
      const stats = await prisma.$queryRawUnsafe<Array<{
        row_count: bigint;
        table_size: string;
        indexes_size: string;
        total_size: string;
      }>>(`
        SELECT 
          pg_class.reltuples::BIGINT AS row_count,
          pg_size_pretty(pg_total_relation_size($1::regclass)) AS total_size,
          pg_size_pretty(pg_relation_size($1::regclass)) AS table_size,
          pg_size_pretty(pg_total_relation_size($1::regclass) - pg_relation_size($1::regclass)) AS indexes_size
        FROM pg_class
        WHERE relname = $1;
      `, partitionName);

      if (stats.length === 0) {
        throw new Error(`Partition ${partitionName} not found`);
      }

      return {
        rowCount: Number(stats[0].row_count),
        tableSize: stats[0].table_size,
        indexSize: stats[0].indexes_size,
        totalSize: stats[0].total_size,
      };
    } catch (error) {
      console.error(`Error getting stats for partition ${partitionName}:`, error);
      throw error;
    }
  }

  /**
   * Check if a partition exists for a given date
   * @param date - Date to check
   * @returns True if partition exists
   */
  async partitionExists(date: Date): Promise<boolean> {
    try {
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const month = monthStart.getMonth() + 1;
      const monthStr = month < 10 ? `0${month}` : `${month}`;
      const partitionName = `history_forecast_data_${monthStart.getFullYear()}_${monthStr}`;

      const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(`
        SELECT EXISTS (
          SELECT 1 FROM pg_class WHERE relname = $1
        ) AS exists;
      `, partitionName);

      return result[0]?.exists ?? false;
    } catch (error) {
      console.error('Error checking partition existence:', error);
      throw error;
    }
  }

  /**
   * Ensure partition exists for a given date (create if missing)
   * @param date - Date to ensure partition for
   */
  async ensurePartitionExists(date: Date): Promise<void> {
    const exists = await this.partitionExists(date);
    if (!exists) {
      // Create partition manually for the specific date
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const partitionName = `history_forecast_data_${year}_${month.toString().padStart(2, '0')}`;
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      // Create partition
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF history_forecast_data
        FOR VALUES FROM ('${startStr}') TO ('${endStr}');
      `);
      
      // Create indexes for active/future partitions only
      const now = new Date();
      const isFuture = date >= new Date(now.getFullYear(), now.getMonth(), 1);
      
      if (isFuture) {
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS ${partitionName}_occupancyPercent_idx 
          ON ${partitionName}("occupancyPercent");
        `);
        
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS ${partitionName}_adr_idx 
          ON ${partitionName}("adr");
        `);
        
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS ${partitionName}_revPAR_idx 
          ON ${partitionName}("revPAR");
        `);
        
        console.log(`✓ Created partition ${partitionName} with write-optimized indexes`);
      } else {
        console.log(`✓ Created partition ${partitionName} (cold storage - no calculated field indexes)`);
      }
    }
  }
}

// Export singleton instance
export const partitionManagerService = new PartitionManagerService();
export default partitionManagerService;

