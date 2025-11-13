import type { ParsedRow } from '../types/fileProcessor.types.js';
import {
  COLUMN_INDICES,
  parseStayDate,
  parseNumericValue,
  parseDataType,
  calculateOccupancyPercent,
  calculateADR,
  calculateRevPAR,
} from '../config/columnMapping.js';

class FileProcessorService {
  /**
   * Parse history forecast file (tab-separated text)
   * @param buffer - File content as buffer
   * @param totalAvailableRooms - Total available rooms for calculations
   * @returns Array of parsed rows
   */
  parseHistoryForecastFile(buffer: Buffer, totalAvailableRooms: number): ParsedRow[] {
    try {
      // Convert buffer to string
      const content = buffer.toString('utf-8');

      // Split by lines
      const lines = content.split('\n').filter((line) => line.trim() !== '');

      const parsedRows: ParsedRow[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        try {
          const row = this.parseLine(line, i, totalAvailableRooms);
          if (row) {
            parsedRows.push(row);
          }
        } catch (error) {
          console.warn(
            `Error parsing line ${i + 1}: ${error}. Skipping...`
          );
          // Continue processing other lines
        }
      }

      console.log(
        `Successfully parsed ${parsedRows.length} rows from file`
      );
      return parsedRows;
    } catch (error) {
      console.error('Error parsing history forecast file:', error);
      throw error;
    }
  }

  /**
   * Parse a single line from the file
   * @param line - Line content
   * @param rowIndex - Line number (0-indexed)
   * @param totalAvailableRooms - Total available rooms for calculations
   * @returns Parsed row or null if invalid
   */
  private parseLine(line: string, rowIndex: number, totalAvailableRooms: number): ParsedRow | null {
    // Split by tab
    const columns = line.split('\t');

    // Validate minimum columns (need at least 16 to access column 15)
    if (!this.validateRow(columns)) {
      return null;
    }

    try {
      // Extract ONLY the 5 columns we need
      const dataTypeStr = columns[COLUMN_INDICES.DATA_TYPE]?.trim() || '';
      const stayDateStr = columns[COLUMN_INDICES.STAY_DATE]?.trim() || '';
      const roomNightsStr = columns[COLUMN_INDICES.ROOM_NIGHTS]?.trim() || '0';
      const roomRevenueStr = columns[COLUMN_INDICES.ROOM_REVENUE]?.trim() || '0';
      const ooRoomsStr = columns[COLUMN_INDICES.OO_ROOMS]?.trim() || '0';

      // Parse values
      const dataType = parseDataType(dataTypeStr);
      const stayDate = parseStayDate(stayDateStr);
      const roomNights = parseNumericValue(roomNightsStr);
      const roomRevenue = parseNumericValue(roomRevenueStr);
      const ooRooms = parseNumericValue(ooRoomsStr);

      // Calculate the 3 metrics
      const occupancyPercent = calculateOccupancyPercent(roomNights, totalAvailableRooms);
      const adr = calculateADR(roomRevenue, roomNights);
      const revPAR = calculateRevPAR(roomRevenue, totalAvailableRooms);

      const parsedRow: ParsedRow = {
        dataType,
        stayDate,
        roomNights,
        roomRevenue,
        ooRooms,
        occupancyPercent,
        adr,
        revPAR,
        rowIndex,
      };

      return parsedRow;
    } catch (error) {
      console.warn(`Error parsing row ${rowIndex}: ${error}`);
      return null;
    }
  }

  /**
   * Validate if a row has minimum required columns
   * @param columns - Array of column values
   * @returns True if valid, false otherwise
   */
  private validateRow(columns: string[]): boolean {
    // Check minimum column count (need at least 16 columns to access column 15)
    if (columns.length < 16) {
      return false;
    }

    // Check if essential fields are not empty
    const hasDataType =
      columns[COLUMN_INDICES.DATA_TYPE]?.trim() !== '';
    const hasStayDate =
      columns[COLUMN_INDICES.STAY_DATE]?.trim() !== '';
    const hasRoomNights =
      columns[COLUMN_INDICES.ROOM_NIGHTS]?.trim() !== '';

    return hasDataType && hasStayDate && hasRoomNights;
  }

  /**
   * Extract snapshot time from filename
   * Example: "history_forecast99383127.txt" -> parse the number as timestamp
   * If not parseable, return current time
   * @param filename - Original filename
   * @returns Date object
   */
  extractSnapshotTime(filename: string): Date {
    try {
      // Try to extract timestamp from filename
      // Pattern: history_forecast[TIMESTAMP].txt
      const match = filename.match(/history_forecast(\d+)/i);
      if (match && match[1]) {
        const timestamp = parseInt(match[1], 10);
        // Check if it's a valid timestamp (Unix timestamp in seconds or milliseconds)
        if (timestamp > 1000000000 && timestamp < 9999999999) {
          // Likely seconds
          return new Date(timestamp * 1000);
        } else if (timestamp > 1000000000000) {
          // Likely milliseconds
          return new Date(timestamp);
        }
      }

      // If can't parse, return current time
      return new Date();
    } catch (error) {
      console.warn(
        `Could not extract snapshot time from filename: ${filename}`
      );
      return new Date();
    }
  }
}

// Export singleton instance
export const fileProcessorService = new FileProcessorService();
export default fileProcessorService;

