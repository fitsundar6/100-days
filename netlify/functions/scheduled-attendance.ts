import { schedule } from '@netlify/functions';
import { processAutomaticAbsentJob } from '../../src/services/attendance-scheduler';

/**
 * Netlify Scheduled Function: Executes daily at 22:00 IST (16:30 UTC)
 * Cron expression: "30 16 * * *"
 */
export const handler = schedule('30 16 * * *', async () => {
  try {
    console.log('⏰ Running Netlify scheduled attendance job for Alpha X Gym...');
    const result = await processAutomaticAbsentJob();
    console.log('✅ Netlify scheduled attendance job completed successfully:', result);
    return {
      statusCode: 200,
    };
  } catch (error: any) {
    console.error('❌ Error executing scheduled attendance job:', error);
    return {
      statusCode: 500,
    };
  }
});
