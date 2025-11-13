import { prisma } from '../utils/prisma.js';
import type { EmailMetadata } from '../types/fileProcessor.types.js';
import type { ProcessedEmail } from '@prisma/client';

class ProcessedEmailService {
  /**
   * Check if an email has already been processed
   * @param messageId - Email message ID
   * @returns True if processed, false otherwise
   */
  async isEmailProcessed(messageId: string): Promise<boolean> {
    try {
      const email = await prisma.processedEmail.findUnique({
        where: { messageId },
      });

      return email !== null;
    } catch (error) {
      console.error('Error checking if email is processed:', error);
      throw error;
    }
  }

  /**
   * Record a processed email
   * @param metadata - Email metadata
   * @returns Created ProcessedEmail record
   */
  async recordProcessedEmail(
    metadata: EmailMetadata
  ): Promise<ProcessedEmail> {
    try {
      const email = await prisma.processedEmail.create({
        data: {
          messageId: metadata.messageId,
          sender: metadata.sender,
          subject: metadata.subject,
          receivedAt: metadata.receivedAt,
          processedAt: metadata.processedAt,
          fileHash: metadata.fileHash,
        },
      });

      console.log(`Email recorded as processed: ${metadata.messageId}`);
      return email;
    } catch (error) {
      console.error('Error recording processed email:', error);
      throw error;
    }
  }

  /**
   * Get all processed emails
   * @param limit - Maximum number of emails to return
   * @returns Array of processed emails
   */
  async getAllProcessedEmails(
    limit: number = 100
  ): Promise<ProcessedEmail[]> {
    try {
      const emails = await prisma.processedEmail.findMany({
        orderBy: { processedAt: 'desc' },
        take: limit,
      });

      return emails;
    } catch (error) {
      console.error('Error fetching processed emails:', error);
      throw error;
    }
  }

  /**
   * Get processed emails by sender
   * @param sender - Sender email address
   * @param limit - Maximum number of emails to return
   * @returns Array of processed emails
   */
  async getProcessedEmailsBySender(
    sender: string,
    limit: number = 100
  ): Promise<ProcessedEmail[]> {
    try {
      const emails = await prisma.processedEmail.findMany({
        where: { sender },
        orderBy: { processedAt: 'desc' },
        take: limit,
      });

      return emails;
    } catch (error) {
      console.error('Error fetching processed emails by sender:', error);
      throw error;
    }
  }

  /**
   * Check if a file hash has been processed before
   * @param fileHash - File hash
   * @returns True if processed, false otherwise
   */
  async isFileHashProcessed(fileHash: string): Promise<boolean> {
    try {
      const email = await prisma.processedEmail.findFirst({
        where: { fileHash },
      });

      return email !== null;
    } catch (error) {
      console.error('Error checking if file hash is processed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const processedEmailService = new ProcessedEmailService();
export default processedEmailService;

