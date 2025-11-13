import {
  BlobServiceClient,
  ContainerClient,
  BlockBlobClient,
} from '@azure/storage-blob';
import { config } from '../config/index.js';

class BlobStorageService {
  private blobServiceClient: BlobServiceClient;
  private containerClient: ContainerClient;
  private initialized: boolean = false;

  constructor() {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(
      config.azure.storageConnectionString
    );
    this.containerClient = this.blobServiceClient.getContainerClient(
      config.azure.containerName
    );
  }

  /**
   * Initialize blob storage and ensure container exists
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create container if it doesn't exist
      const exists = await this.containerClient.exists();
      if (!exists) {
        await this.containerClient.create();
        console.log(
          `Container '${config.azure.containerName}' created successfully`
        );
      } else {
        console.log(
          `Container '${config.azure.containerName}' already exists`
        );
      }

      this.initialized = true;
    } catch (error) {
      console.error('Error initializing blob storage:', error);
      throw error;
    }
  }

  /**
   * Upload file to Azure Blob Storage
   * @param hotelId - Hotel identifier
   * @param filename - Original filename
   * @param buffer - File content as buffer
   * @returns Blob URL
   */
  async uploadFile(
    hotelId: string,
    filename: string,
    buffer: Buffer
  ): Promise<string> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const blobName = `history-forecast/${hotelId}/${timestamp}_${filename}`;

      const blockBlobClient: BlockBlobClient =
        this.containerClient.getBlockBlobClient(blobName);

      // Upload with metadata (Azure requires all values to be strings)
      await blockBlobClient.upload(buffer, buffer.length, {
        metadata: {
          hotelId: String(hotelId),
          originalFilename: String(filename),
          uploadedAt: String(new Date().toISOString()),
        },
      });

      console.log(`File uploaded successfully: ${blobName}`);
      return blockBlobClient.url;
    } catch (error) {
      console.error('Error uploading file to blob storage:', error);
      throw error;
    }
  }

  /**
   * Get blob URL
   * @param blobPath - Path to the blob
   * @returns Blob URL
   */
  getFileUrl(blobPath: string): string {
    const blockBlobClient =
      this.containerClient.getBlockBlobClient(blobPath);
    return blockBlobClient.url;
  }

  /**
   * Check if file exists in blob storage
   * @param blobPath - Path to the blob
   * @returns True if exists, false otherwise
   */
  async fileExists(blobPath: string): Promise<boolean> {
    try {
      const blockBlobClient =
        this.containerClient.getBlockBlobClient(blobPath);
      return await blockBlobClient.exists();
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  }

  /**
   * Download file from blob storage
   * @param blobPath - Path to the blob
   * @returns File content as buffer
   */
  async downloadFile(blobPath: string): Promise<Buffer> {
    try {
      const blockBlobClient =
        this.containerClient.getBlockBlobClient(blobPath);
      const downloadResponse = await blockBlobClient.download();

      if (!downloadResponse.readableStreamBody) {
        throw new Error('No content in blob');
      }

      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error downloading file from blob storage:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const blobStorageService = new BlobStorageService();
export default blobStorageService;

