import { Client } from '@microsoft/microsoft-graph-client';
import { tokenService } from './token.service.js';
import type { Email, Attachment } from '../types/fileProcessor.types.js';

class EmailService {
  private client: Client | null = null;

  /**
   * Initialize Microsoft Graph client with user delegated permissions
   */
  initializeClient(): void {
    try {
      this.client = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            // Get access token using refresh token flow
            const token = await tokenService.getAccessToken();
            return token;
          },
        },
      });

      console.log('Microsoft Graph client initialized successfully');
    } catch (error) {
      console.error('Error initializing Microsoft Graph client:', error);
      throw error;
    }
  }

  /**
   * Get new emails from the monitored inbox
   * @returns Array of emails with attachments
   */
  async getNewEmails(): Promise<Email[]> {
    if (!this.client) {
      this.initializeClient();
    }

    try {
      // Query for unread emails with attachments
      // Using /me endpoint since we're using delegated permissions (user context)
      const response = await this.client!
        .api('/me/messages')
        .filter('hasAttachments eq true and isRead eq false')
        .select('id,subject,from,receivedDateTime')
        .top(50)
        .get();

      const emails: Email[] = response.value.map((msg: any) => ({
        messageId: msg.id,
        sender: msg.from?.emailAddress?.address || '',
        subject: msg.subject || '',
        receivedAt: new Date(msg.receivedDateTime),
      }));

      console.log(`Found ${emails.length} new email(s) with attachments`);
      return emails;
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  /**
   * Get attachments for a specific email
   * @param messageId - Email message ID
   * @returns Array of attachments
   */
  async getAttachments(messageId: string): Promise<Attachment[]> {
    if (!this.client) {
      this.initializeClient();
    }

    try {
      const response = await this.client!
        .api(`/me/messages/${messageId}/attachments`)
        .get();

      const attachments: Attachment[] = [];

      for (const attachment of response.value) {
        if (attachment['@odata.type'] === '#microsoft.graph.fileAttachment') {
          // Convert base64 content to buffer
          const contentBytes = Buffer.from(
            attachment.contentBytes,
            'base64'
          );

          attachments.push({
            name: attachment.name,
            contentBytes,
            contentType: attachment.contentType || 'application/octet-stream',
          });
        }
      }

      console.log(
        `Retrieved ${attachments.length} attachment(s) from email ${messageId}`
      );
      return attachments;
    } catch (error) {
      console.error('Error fetching attachments:', error);
      throw error;
    }
  }

  /**
   * Mark email as read/processed
   * @param messageId - Email message ID
   */
  async markAsProcessed(messageId: string): Promise<void> {
    if (!this.client) {
      this.initializeClient();
    }

    try {
      await this.client!
        .api(`/me/messages/${messageId}`)
        .patch({
          isRead: true,
        });

      console.log(`Email ${messageId} marked as read`);
    } catch (error) {
      console.error('Error marking email as read:', error);
      throw error;
    }
  }

  /**
   * Move email to a specific folder (optional, for better organization)
   * @param messageId - Email message ID
   * @param folderName - Target folder name
   */
  async moveToFolder(
    messageId: string,
    folderName: string
  ): Promise<void> {
    if (!this.client) {
      this.initializeClient();
    }

    try {
      // First, get or create the folder
      const foldersResponse = await this.client!
        .api('/me/mailFolders')
        .filter(`displayName eq '${folderName}'`)
        .get();

      let folderId: string;

      if (foldersResponse.value.length > 0) {
        folderId = foldersResponse.value[0].id;
      } else {
        // Create folder if it doesn't exist
        const newFolder = await this.client!
          .api('/me/mailFolders')
          .post({
            displayName: folderName,
          });
        folderId = newFolder.id;
      }

      // Move the message
      await this.client!
        .api(`/me/messages/${messageId}/move`)
        .post({
          destinationId: folderId,
        });

      console.log(`Email ${messageId} moved to folder '${folderName}'`);
    } catch (error) {
      console.error('Error moving email to folder:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;

