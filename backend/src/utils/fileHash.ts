import crypto from 'crypto';

/**
 * Calculate SHA-256 hash of a file buffer
 * Used for duplicate detection across uploads
 * @param buffer - File content as buffer
 * @returns Hex string representation of the hash
 */
export function calculateFileHash(buffer: Buffer): string {
  const hash = crypto.createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

export default calculateFileHash;

