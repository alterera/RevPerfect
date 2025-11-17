import express from 'express';
import compression from 'compression';
import { config } from './config/index.js';
import { prisma } from './utils/prisma.js';
import { logger } from './utils/logger.js';
import { blobStorageService } from './services/blobStorage.service.js';
import { emailService } from './services/email.service.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import apiRoutes from './routes/api.js';
import {
  setupSecurityMiddleware,
  apiRateLimiter,
  errorHandler,
  notFoundHandler,
} from './middleware/security.js';

// Create Express app
const app = express();
const API_PORT = Number(process.env.PORT) || 3001;

// Trust proxy (important for correct IP addresses behind reverse proxy/load balancer)
app.set('trust proxy', 1);

// Setup security middleware (helmet, CORS)
setupSecurityMiddleware(app);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Health check (before rate limiting)
app.get('/health', async (_req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: config.env,
      database: 'connected',
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

// Readiness check (for Kubernetes/container orchestration)
app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

// API routes with rate limiting
app.use('/api', apiRateLimiter, apiRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Initialize the application
 */
async function initialize(): Promise<void> {
  logger.info('='.repeat(80));
  logger.info('RevPerfect Backend - Hotel Revenue Optimization System');
  logger.info('='.repeat(80));
  logger.info(`Environment: ${config.env}`);
  logger.info(`Node version: ${process.version}`);
  logger.info(`Started at: ${new Date().toISOString()}`);

  try {
    // Step 1: Test database connection
    logger.info('Testing database connection...');
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Step 2: Initialize Azure Blob Storage
    logger.info('Initializing Azure Blob Storage...');
    await blobStorageService.initialize();
    logger.info('Azure Blob Storage initialized');

    // Step 3: Initialize Microsoft Graph client
    logger.info('Initializing Microsoft Graph API...');
    emailService.initializeClient();
    logger.info('Microsoft Graph client initialized');

    // Step 4: Log configuration (without sensitive data)
    logger.info('Configuration loaded', {
      monitoredEmail: config.email.monitoredEmail,
      azureContainer: config.azure.containerName,
      cronSchedule: config.scheduler.emailCheckCron,
      port: API_PORT,
    });

    // Step 5: Start the API server
    app.listen(API_PORT, () => {
      logger.info(`API server running on port ${API_PORT}`, {
        healthCheck: `/health`,
        readyCheck: `/ready`,
        apiRoutes: `/api`,
      });
    });

    // Step 6: Start the scheduler
    startScheduler();

    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to initialize application', { error });
    throw error;
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.warn(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop scheduler
    logger.info('Stopping scheduler...');
    stopScheduler();

    // Disconnect Prisma
    logger.info('Disconnecting database...');
    await prisma.$disconnect();

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

/**
 * Error handlers
 */
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  shutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
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

