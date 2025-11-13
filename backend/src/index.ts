import { config } from './config/index.js';
import { prisma } from './utils/prisma.js';
import { blobStorageService } from './services/blobStorage.service.js';
import { emailService } from './services/email.service.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  console.clear();
  console.log('='.repeat(80));
  console.log('RevPerfect Backend - Hotel Revenue Optimization System');
  console.log('='.repeat(80));
  console.log(`Environment: ${config.env}`);
  console.log(`Started at: ${new Date().toISOString()}\n`);

  try {
    // Step 1: Test database connection
    console.log('📊 Testing database connection...');
    await prisma.$connect();
    console.log('✓ Database connected successfully\n');

    // Step 2: Initialize Azure Blob Storage
    console.log('☁️  Initializing Azure Blob Storage...');
    await blobStorageService.initialize();
    console.log('✓ Azure Blob Storage initialized\n');

    // Step 3: Initialize Microsoft Graph client
    console.log('📧 Initializing Microsoft Graph API...');
    emailService.initializeClient();
    console.log('✓ Microsoft Graph client initialized\n');

    // Step 4: Log configuration (without sensitive data)
    console.log('⚙️  Configuration:');
    console.log(`  - Monitored Email: ${config.email.monitoredEmail}`);
    console.log(`  - Azure Container: ${config.azure.containerName}`);
    console.log(`  - Cron Schedule: ${config.scheduler.emailCheckCron}`);
    console.log('');

    // Step 5: Start the scheduler
    startScheduler();

    console.log('='.repeat(80));
    console.log('✓ Application started successfully');
    console.log('  Press Ctrl+C to stop');
    console.log('='.repeat(80));
    console.log('');
  } catch (error) {
    console.error('✗ Failed to initialize application:', error);
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n\nReceived ${signal}, shutting down gracefully...`);

  try {
    // Stop scheduler
    console.log('Stopping scheduler...');
    stopScheduler();

    // Disconnect Prisma
    console.log('Disconnecting database...');
    await prisma.$disconnect();

    console.log('✓ Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Error handlers
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('UNHANDLED_REJECTION');
});

/**
 * Shutdown signals
 */
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/**
 * Start the application
 */
initialize().catch((error) => {
  console.error('Fatal error during initialization:', error);
  process.exit(1);
});

