export interface ParsedRow {
  dataType: 'HISTORY' | 'FORECAST';
  stayDate: Date;
  
  // 5 extracted columns
  roomNights: number;
  roomRevenue: number;
  ooRooms: number;
  
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

