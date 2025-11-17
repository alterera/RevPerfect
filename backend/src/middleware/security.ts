import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { Express, Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Configure CORS based on environment
 */
export const configureCors = () => {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Default allowed origins
  const defaultOrigins = isDevelopment 
    ? ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
    : ['http://localhost:3000'];

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
    : defaultOrigins;

  // Log CORS configuration on startup
  logger.info('CORS Configuration', {
    allowedOrigins,
    environment: process.env.NODE_ENV || 'development',
  });

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      // Allow all origins in development if ALLOWED_ORIGINS is not set
      if (isDevelopment && !process.env.ALLOWED_ORIGINS) {
        // Allow localhost and 127.0.0.1 with any port
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
          return callback(null, true);
        }
      }

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        logger.warn(`Blocked CORS request from origin: ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`);
        callback(new Error(`Not allowed by CORS. Origin ${origin} is not in the allowed list.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
};

/**
 * Configure Helmet for security headers
 */
export const configureHelmet = () => {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });
};

/**
 * Rate limiter for API endpoints
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later.',
    });
  },
});

/**
 * Stricter rate limiter for file uploads
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: 'Too many file uploads, please try again later.',
  handler: (req: Request, res: Response) => {
    logger.warn(`Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: 'Too many uploads',
      message: 'Please try again later.',
    });
  },
});

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
};

/**
 * Global error handler
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // next: NextFunction
) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  // Don't leak error details in production
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.status(500).json({
    error: 'Internal server error',
    message: isProduction ? 'Something went wrong' : err.message,
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'Not found',
    message: `Cannot ${req.method} ${req.path}`,
  });
};

/**
 * Setup all security middleware on Express app
 */
export const setupSecurityMiddleware = (app: Express) => {
  // Helmet for security headers
  app.use(configureHelmet());

  // CORS configuration
  app.use(configureCors());

  // Request logging
  if (process.env.NODE_ENV === 'production') {
    app.use(requestLogger);
  }

  // Trust proxy (important for rate limiting behind reverse proxy)
  app.set('trust proxy', 1);
};

