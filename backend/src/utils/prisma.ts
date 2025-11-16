import { createRequire } from 'module';
import type { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const { PrismaClient: PrismaClientConstructor } = require('@prisma/client');

// Singleton pattern for Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClientConstructor({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
