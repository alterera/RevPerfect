export interface ParsedRow {
  dataType: 'HISTORY' | 'FORECAST';
  stayDate: Date;
  
  // 30 raw columns (stored as strings)
  col1: string;   // Column 1: Data Type
  col2: string;   // Column 2: Stay Date
  col3: string;   // Column 3: Room nights sold
  col4: string;   // Column 4
  col5: string;   // Column 5
  col6: string;   // Column 6
  col7: string;   // Column 7
  col8: string;   // Column 8
  col9: string;   // Column 9
  col10: string;  // Column 10: Room revenue
  col11: string;  // Column 11
  col12: string;  // Column 12
  col13: string;  // Column 13
  col14: string;  // Column 14
  col15: string;  // Column 15: Out of order rooms
  col16: string;  // Column 16
  col17: string;  // Column 17
  col18: string;  // Column 18
  col19: string;  // Column 19
  col20: string;  // Column 20
  col21: string;  // Column 21
  col22: string;  // Column 22
  col23: string;  // Column 23
  col24: string;  // Column 24
  col25: string;  // Column 25
  col26: string;  // Column 26
  col27: string;  // Column 27
  col28: string;  // Column 28
  col29: string;  // Column 29
  col30: string;  // Column 30
  
  // Parsed numeric values (for calculations and backward compatibility)
  roomNights: number;   // Parsed from col3
  roomRevenue: number;  // Parsed from col10
  ooRooms: number;     // Parsed from col15
  
  // 3 calculated metrics
  occupancyPercent: number;
  adr: number;
  revPAR: number;
  
  rowIndex: number;
}

export interface Email {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
}

export interface Attachment {
  name: string;
  contentBytes: Buffer;
  contentType: string;
}

export interface SnapshotMetadata {
  hotelId: string;
  snapshotTime: Date;
  originalFilename: string;
  blobUrl: string;
  fileHash: string;
  uploadedAt: Date;
}

export interface EmailMetadata {
  messageId: string;
  sender: string;
  subject: string;
  receivedAt: Date;
  processedAt: Date;
  fileHash: string;
}

