/**
 * Column Mapping for History Forecast Files
 * 
 * The files are tab-separated with 30 columns total (we skip column 0).
 * We extract all 30 columns and store them as raw text.
 * Based on analysis of the sample file history_forecast99383127.txt
 * 
 * Date Format Conversion:
 * - File format: DD/MM/YY Day (e.g., "01/11/25 Sat")
 * - Database format: YYYY-MM-DD (e.g., "2025-11-01")
 * - Conversion handled by parseStayDate() function
 */

export const COLUMN_INDICES = {
  DATA_TYPE: 1,        // Column 1: "History" or "Forecast"
  STAY_DATE: 2,        // Column 2: Input: "DD/MM/YY Day" -> Output: YYYY-MM-DD
  ROOM_NIGHTS: 3,      // Column 3: Room nights sold
  COL_A: 4,            // Column 4
  COL_B: 5,            // Column 5
  COL_C: 6,            // Column 6
  COL_D: 7,            // Column 7
  COL_E: 8,            // Column 8
  COL_F: 9,            // Column 9
  ROOM_REVENUE: 10,    // Column 10: Total room revenue
  COL_G: 11,           // Column 11
  COL_H: 12,           // Column 12
  COL_I: 13,           // Column 13
  COL_J: 14,           // Column 14
  OO_ROOMS: 15,        // Column 15: Out of order rooms
  COL_K: 16,           // Column 16
  COL_L: 17,           // Column 17
  COL_M: 18,           // Column 18
  COL_N: 19,           // Column 19
  COL_O: 20,           // Column 20
  COL_P: 21,           // Column 21
  COL_Q: 22,           // Column 22
  COL_R: 23,           // Column 23
  COL_S: 24,           // Column 24
  COL_T: 25,           // Column 25
  COL_U: 26,           // Column 26
  COL_V: 27,           // Column 27
  COL_W: 28,           // Column 28
  COL_X: 29,           // Column 29
  COL_Y: 30,           // Column 30
} as const;

/**
 * Parse date from DD/MM/YY format to Date object
 * 
 * Input format: "DD/MM/YY Day" (e.g., "01/11/25 Sat")
 * Output: JavaScript Date object
 * Database storage: YYYY-MM-DD (e.g., "2025-11-01")
 * 
 * @param dateStr - Date string from file in "DD/MM/YY Day" format
 * @returns Date object that will be stored as YYYY-MM-DD in PostgreSQL
 * 
 * @example
 * parseStayDate("01/11/25 Sat") // Returns Date object for 2025-11-01
 * parseStayDate("15/12/24 Mon") // Returns Date object for 2024-12-15
 */
export function parseStayDate(dateStr: string): Date {
  // Extract just the date part (DD/MM/YY), removing the day name
  const datePart = dateStr.split(' ')[0];
  const [day, month, year] = datePart.split('/').map(Number);
  
  // Validate date components
  if (!day || !month || !year) {
    throw new Error(`Invalid date format: ${dateStr}. Expected DD/MM/YY Day`);
  }
  
  if (day < 1 || day > 31) {
    throw new Error(`Invalid day: ${day} in date ${dateStr}`);
  }
  
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month} in date ${dateStr}`);
  }
  
  // Convert 2-digit year to 4-digit (assuming 20xx)
  const fullYear = 2000 + year;
  
  // Create Date object (month is 0-indexed in JavaScript)
  // This will be stored as YYYY-MM-DD in PostgreSQL DATE column
  const date = new Date(fullYear, month - 1, day);
  
  // Validate the date is valid (e.g., not Feb 30)
  if (date.getDate() !== day || date.getMonth() !== month - 1) {
    throw new Error(`Invalid date: ${dateStr} results in ${date.toISOString()}`);
  }
  
  return date;
}

/**
 * Format Date object to YYYY-MM-DD string
 * 
 * Useful for logging and debugging to see the exact date format
 * that will be stored in the database
 * 
 * @param date - JavaScript Date object
 * @returns Date string in YYYY-MM-DD format
 * 
 * @example
 * formatDateToYYYYMMDD(new Date(2025, 10, 1)) // Returns "2025-11-01"
 */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Parse numeric value that might have commas, spaces, or percentage signs
 */
export function parseNumericValue(value: string): number {
  if (!value || value.trim() === '') return 0;
  
  // Remove commas, spaces, and percentage signs
  const cleaned = value.replace(/[,\s%]/g, '');
  const parsed = parseFloat(cleaned);
  
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse data type from string to enum
 */
export function parseDataType(type: string): 'HISTORY' | 'FORECAST' {
  const normalized = type.trim().toUpperCase();
  return normalized === 'HISTORY' ? 'HISTORY' : 'FORECAST';
}

/**
 * Calculate Occupancy Percent
 * Formula: (Total Room Nights / Total Available Room Nights) * 100
 */
export function calculateOccupancyPercent(roomNights: number, totalAvailableRooms: number): number {
  if (totalAvailableRooms === 0) return 0;
  return (roomNights / totalAvailableRooms) * 100;
}

/**
 * Calculate ADR (Average Daily Rate)
 * Formula: Total Room Revenue / Total Room Nights
 */
export function calculateADR(roomRevenue: number, roomNights: number): number {
  if (roomNights === 0) return 0;
  return roomRevenue / roomNights;
}

/**
 * Calculate RevPAR (Revenue Per Available Room)
 * Formula: Total Room Revenue / Total Available Room Nights
 */
export function calculateRevPAR(roomRevenue: number, totalAvailableRooms: number): number {
  if (totalAvailableRooms === 0) return 0;
  return roomRevenue / totalAvailableRooms;
}

