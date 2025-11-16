import cron from 'node-cron';
import { config } from '../config/index.js';
import { processEmails } from './emailWatcher.job.js';

// Job locks to prevent overlapping runs
let isRunning = false;

/**
 * Start the email watcher scheduler
 * Runs the email processing job at specified intervals
 */
export function startScheduler(): void {
  const cronExpression = config.scheduler.emailCheckCron;

  console.log(`\n${'='.repeat(80)}`);
  console.log('Starting Email Watcher Scheduler');
  console.log(`Cron Expression: ${cronExpression}`);
  console.log(`Description: Runs every 5 minutes (default)`);
  console.log(`Next run will be at: ${getNextRunTime(cronExpression)}`);
  console.log('='.repeat(80));

  // Validate cron expression
  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid cron expression: ${cronExpression}`);
  }

  // Schedule the job
  cron.schedule(cronExpression, async () => {
    // Check if previous job is still running
    if (isRunning) {
      console.log(
        '\n⚠ Previous job still running, skipping this execution...'
      );
      return;
    }

    isRunning = true;

    try {
      await processEmails();
    } catch (error) {
      console.error('Error in scheduled job:', error);
    } finally {
      isRunning = false;
    }
  });

  console.log('✓ Scheduler started successfully\n');
}

/**
 * Stop the scheduler (for graceful shutdown)
 */
export function stopScheduler(): void {
  // node-cron doesn't provide a direct stop method for individual tasks
  // but we can rely on process exit
  console.log('Stopping scheduler...');
}

/**
 * Get the next run time for a cron expression
 * @param _cronExpression - Cron expression (currently unused, assumes every-5-minutes format)
 * @returns Human-readable next run time
 */
function getNextRunTime(_cronExpression: string): string {
  // Simple estimation for */5 * * * * (every 5 minutes)
  const now = new Date();
  const minutes = now.getMinutes();
  const nextMinute = Math.ceil(minutes / 5) * 5;

  if (nextMinute >= 60) {
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
  } else {
    now.setMinutes(nextMinute);
  }

  now.setSeconds(0);
  now.setMilliseconds(0);

  return now.toLocaleString();
}

/**
 * Run job immediately (useful for testing)
 */
export async function runJobNow(): Promise<void> {
  console.log('\nRunning email watcher job immediately...\n');

  if (isRunning) {
    console.log('⚠ Job is already running!');
    return;
  }

  isRunning = true;

  try {
    await processEmails();
  } catch (error) {
    console.error('Error running job:', error);
  } finally {
    isRunning = false;
  }
}

export default {
  startScheduler,
  stopScheduler,
  runJobNow,
};

