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
    // Split by tab (skip column 0, so we start from index 1)
    const allColumns = line.split('\t');
    
    // Skip column 0, so columns array starts from index 1
    const columns = allColumns.slice(1);

    // Validate minimum columns (need at least 30 columns after skipping column 0)
    if (!this.validateRow(columns)) {
      return null;
    }

    try {
      // Extract all 30 columns as raw strings
      const col1 = columns[COLUMN_INDICES.DATA_TYPE - 1]?.trim() || '';
      const col2 = columns[COLUMN_INDICES.STAY_DATE - 1]?.trim() || '';
      const col3 = columns[COLUMN_INDICES.ROOM_NIGHTS - 1]?.trim() || '0';
      const col4 = columns[COLUMN_INDICES.COL_A - 1]?.trim() || '';
      const col5 = columns[COLUMN_INDICES.COL_B - 1]?.trim() || '';
      const col6 = columns[COLUMN_INDICES.COL_C - 1]?.trim() || '';
      const col7 = columns[COLUMN_INDICES.COL_D - 1]?.trim() || '';
      const col8 = columns[COLUMN_INDICES.COL_E - 1]?.trim() || '';
      const col9 = columns[COLUMN_INDICES.COL_F - 1]?.trim() || '';
      const col10 = columns[COLUMN_INDICES.ROOM_REVENUE - 1]?.trim() || '0';
      const col11 = columns[COLUMN_INDICES.COL_G - 1]?.trim() || '';
      const col12 = columns[COLUMN_INDICES.COL_H - 1]?.trim() || '';
      const col13 = columns[COLUMN_INDICES.COL_I - 1]?.trim() || '';
      const col14 = columns[COLUMN_INDICES.COL_J - 1]?.trim() || '';
      const col15 = columns[COLUMN_INDICES.OO_ROOMS - 1]?.trim() || '0';
      const col16 = columns[COLUMN_INDICES.COL_K - 1]?.trim() || '';
      const col17 = columns[COLUMN_INDICES.COL_L - 1]?.trim() || '';
      const col18 = columns[COLUMN_INDICES.COL_M - 1]?.trim() || '';
      const col19 = columns[COLUMN_INDICES.COL_N - 1]?.trim() || '';
      const col20 = columns[COLUMN_INDICES.COL_O - 1]?.trim() || '';
      const col21 = columns[COLUMN_INDICES.COL_P - 1]?.trim() || '';
      const col22 = columns[COLUMN_INDICES.COL_Q - 1]?.trim() || '';
      const col23 = columns[COLUMN_INDICES.COL_R - 1]?.trim() || '';
      const col24 = columns[COLUMN_INDICES.COL_S - 1]?.trim() || '';
      const col25 = columns[COLUMN_INDICES.COL_T - 1]?.trim() || '';
      const col26 = columns[COLUMN_INDICES.COL_U - 1]?.trim() || '';
      const col27 = columns[COLUMN_INDICES.COL_V - 1]?.trim() || '';
      const col28 = columns[COLUMN_INDICES.COL_W - 1]?.trim() || '';
      const col29 = columns[COLUMN_INDICES.COL_X - 1]?.trim() || '';
      const col30 = columns[COLUMN_INDICES.COL_Y - 1]?.trim() || '';

      // Parse key values for calculations
      const dataType = parseDataType(col1);
      const stayDate = parseStayDate(col2);
      const roomNights = parseNumericValue(col3);
      const roomRevenue = parseNumericValue(col10);
      const ooRooms = parseNumericValue(col15);

      // Calculate the 3 metrics
      const occupancyPercent = calculateOccupancyPercent(roomNights, totalAvailableRooms);
      const adr = calculateADR(roomRevenue, roomNights);
      const revPAR = calculateRevPAR(roomRevenue, totalAvailableRooms);

      const parsedRow: ParsedRow = {
        dataType,
        stayDate,
        col1,
        col2,
        col3,
        col4,
        col5,
        col6,
        col7,
        col8,
        col9,
        col10,
        col11,
        col12,
        col13,
        col14,
        col15,
        col16,
        col17,
        col18,
        col19,
        col20,
        col21,
        col22,
        col23,
        col24,
        col25,
        col26,
        col27,
        col28,
        col29,
        col30,
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
   * @param columns - Array of column values (after skipping column 0)
   * @returns True if valid, false otherwise
   */
  private validateRow(columns: string[]): boolean {
    // Check minimum column count (need at least 30 columns after skipping column 0)
    if (columns.length < 30) {
      return false;
    }

    // Check if essential fields are not empty
    const hasDataType =
      columns[COLUMN_INDICES.DATA_TYPE - 1]?.trim() !== '';
    const hasStayDate =
      columns[COLUMN_INDICES.STAY_DATE - 1]?.trim() !== '';
    const hasRoomNights =
      columns[COLUMN_INDICES.ROOM_NIGHTS - 1]?.trim() !== '';

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

