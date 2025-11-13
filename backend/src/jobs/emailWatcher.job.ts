import { emailService } from '../services/email.service.js';
import { hotelService } from '../services/hotel.service.js';
import { processedEmailService } from '../services/processedEmail.service.js';
import { blobStorageService } from '../services/blobStorage.service.js';
import { fileProcessorService } from '../services/fileProcessor.service.js';
import { snapshotService } from '../services/snapshot.service.js';
import { calculateFileHash } from '../utils/fileHash.js';

interface ProcessingSummary {
  totalEmails: number;
  processedEmails: number;
  skippedEmails: number;
  snapshotsCreated: number;
  errors: number;
  errorDetails: string[];
}

/**
 * Main email processing job
 * Orchestrates the entire pipeline from email to database
 */
export async function processEmails(): Promise<ProcessingSummary> {
  const summary: ProcessingSummary = {
    totalEmails: 0,
    processedEmails: 0,
    skippedEmails: 0,
    snapshotsCreated: 0,
    errors: 0,
    errorDetails: [],
  };

  try {
    console.log('='.repeat(80));
    console.log('Starting email processing job...');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    // Step 1: Fetch new emails
    const emails = await emailService.getNewEmails();
    summary.totalEmails = emails.length;

    if (emails.length === 0) {
      console.log('No new emails found.');
      return summary;
    }

    console.log(`Found ${emails.length} new email(s) to process`);

    // Step 2: Process each email
    for (const email of emails) {
      try {
        console.log(`\nProcessing email: ${email.messageId}`);
        console.log(`  From: ${email.sender}`);
        console.log(`  Subject: ${email.subject}`);
        console.log(`  Received: ${email.receivedAt.toISOString()}`);

        // Check if already processed
        const isProcessed = await processedEmailService.isEmailProcessed(
          email.messageId
        );
        if (isProcessed) {
          console.log(`  ⊘ Email already processed, skipping...`);
          summary.skippedEmails++;
          continue;
        }

        // Identify hotel
        const hotel = await hotelService.getHotelByEmail(email.sender);
        if (!hotel) {
          console.warn(
            `  ⚠ No hotel found for sender: ${email.sender}, skipping...`
          );
          summary.skippedEmails++;
          continue;
        }

        if (!hotel.isActive) {
          console.warn(
            `  ⚠ Hotel ${hotel.name} is inactive, skipping...`
          );
          summary.skippedEmails++;
          continue;
        }

        console.log(`  ✓ Hotel identified: ${hotel.name} (${hotel.id})`);

        // Get attachments
        const attachments = await emailService.getAttachments(
          email.messageId
        );

        if (attachments.length === 0) {
          console.warn(`  ⚠ No attachments found in email, skipping...`);
          summary.skippedEmails++;
          continue;
        }

        console.log(`  ✓ Found ${attachments.length} attachment(s)`);

        // Process each attachment (txt files only)
        for (const attachment of attachments) {
          try {
            // Filter for .txt files
            if (!attachment.name.toLowerCase().endsWith('.txt')) {
              console.log(
                `  ⊘ Skipping non-txt file: ${attachment.name}`
              );
              continue;
            }

            console.log(`\n  Processing attachment: ${attachment.name}`);

            // Calculate file hash
            const fileHash = calculateFileHash(attachment.contentBytes);
            console.log(`  ✓ File hash: ${fileHash.substring(0, 16)}...`);

            // Check for duplicate by hash
            const existingSnapshot =
              await snapshotService.checkDuplicateByHash(fileHash);
            if (existingSnapshot) {
              console.log(
                `  ⊘ Duplicate file detected (snapshot ${existingSnapshot.id}), skipping...`
              );
              continue;
            }

            // Upload to Azure Blob Storage
            console.log(`  ↑ Uploading to Azure Blob Storage...`);
            const blobUrl = await blobStorageService.uploadFile(
              hotel.id,
              attachment.name,
              attachment.contentBytes
            );
            console.log(`  ✓ Uploaded to: ${blobUrl}`);

            // Mark email as read immediately after successful upload
            // This prevents re-processing even if parsing fails later
            await emailService.markAsProcessed(email.messageId);
            console.log(`  ✓ Email marked as read (file safely stored in blob)`);

            // Extract snapshot time from filename or use email received time
            const snapshotTime = fileProcessorService.extractSnapshotTime(
              attachment.name
            );
            console.log(
              `  ✓ Snapshot time: ${snapshotTime.toISOString()}`
            );

            // Phase 1: Register snapshot
            console.log(`  ⚙ Creating snapshot record...`);
            const totalAvailableRooms = hotel.totalAvailableRooms || 0;
            const snapshot = await snapshotService.createSnapshotRecord(
              {
                hotelId: hotel.id,
                snapshotTime,
                originalFilename: attachment.name,
                blobUrl,
                fileHash,
                uploadedAt: new Date(),
              },
              totalAvailableRooms
            );
            console.log(`  ✓ Snapshot created: ${snapshot.id}`);

            // Phase 2: Parse and save data
            try {
              console.log(`  ⚙ Parsing file...`);
              const parsedRows =
                fileProcessorService.parseHistoryForecastFile(
                  attachment.contentBytes,
                  totalAvailableRooms
                );
              console.log(`  ✓ Parsed ${parsedRows.length} rows`);

              console.log(`  ⚙ Saving data to database...`);
              await snapshotService.saveSnapshotData(
                snapshot.id,
                parsedRows
              );
              console.log(
                `  ✓ Data saved successfully (${parsedRows.length} rows)`
              );

              summary.snapshotsCreated++;
            } catch (parseError) {
              const errorMsg =
                parseError instanceof Error
                  ? parseError.message
                  : 'Unknown parsing error';
              console.error(`  ✗ Error parsing/saving data: ${errorMsg}`);
              await snapshotService.markSnapshotFailed(
                snapshot.id,
                errorMsg
              );
              summary.errors++;
              summary.errorDetails.push(
                `${attachment.name}: ${errorMsg}`
              );
              // Continue processing other attachments
              continue;
            }

            // Record processed email (after successful processing)
            await processedEmailService.recordProcessedEmail({
              messageId: email.messageId,
              sender: email.sender,
              subject: email.subject,
              receivedAt: email.receivedAt,
              processedAt: new Date(),
              fileHash,
            });
            console.log(`  ✓ Email recorded as processed`);

            summary.processedEmails++;
          } catch (attachmentError) {
            const errorMsg =
              attachmentError instanceof Error
                ? attachmentError.message
                : 'Unknown error';
            console.error(
              `  ✗ Error processing attachment ${attachment.name}: ${errorMsg}`
            );
            summary.errors++;
            summary.errorDetails.push(`${attachment.name}: ${errorMsg}`);
            // Continue with next attachment
          }
        }
      } catch (emailError) {
        const errorMsg =
          emailError instanceof Error
            ? emailError.message
            : 'Unknown error';
        console.error(
          `✗ Error processing email ${email.messageId}: ${errorMsg}`
        );
        summary.errors++;
        summary.errorDetails.push(
          `Email ${email.messageId}: ${errorMsg}`
        );
        // Continue with next email
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('Email Processing Summary:');
    console.log(`  Total emails found: ${summary.totalEmails}`);
    console.log(`  Processed: ${summary.processedEmails}`);
    console.log(`  Skipped: ${summary.skippedEmails}`);
    console.log(`  Snapshots created: ${summary.snapshotsCreated}`);
    console.log(`  Errors: ${summary.errors}`);
    if (summary.errorDetails.length > 0) {
      console.log('  Error details:');
      summary.errorDetails.forEach((error) => {
        console.log(`    - ${error}`);
      });
    }
    console.log('='.repeat(80));

    return summary;
  } catch (error) {
    console.error('Fatal error in email processing job:', error);
    summary.errors++;
    summary.errorDetails.push(
      error instanceof Error ? error.message : 'Unknown fatal error'
    );
    throw error;
  }
}

export default processEmails;

