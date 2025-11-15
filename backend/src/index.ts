import express from 'express';
import { config } from './config/index.js';
import { prisma } from './utils/prisma.js';
import { blobStorageService } from './services/blobStorage.service.js';
import { emailService } from './services/email.service.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import apiRoutes from './routes/api.js';

// Create Express app
const app = express();
const API_PORT = process.env.API_PORT || 3001;

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  // Simple CORS for prototype (allow all origins)
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

    // Step 5: Start the API server
    app.listen(API_PORT, () => {
      console.log(`🌐 API server running on http://localhost:${API_PORT}`);
      console.log(`   Health check: http://localhost:${API_PORT}/health`);
      console.log(`   API routes: http://localhost:${API_PORT}/api`);
      console.log('');
    });

    // Step 6: Start the scheduler
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

