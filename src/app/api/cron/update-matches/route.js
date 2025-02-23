// app/api/cron/update-matches/route.js
// app/api/cron/update-matches/route.js
import { cricketService } from '@/app/services/cricketService';
import { PointService } from '@/app/services/pointService';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // First restore the specific matches
    const matchesToRestore = ['112395','112413','112409','112402','112420']; // Add your match IDs here
    console.log('Starting match restoration process...');

    try {
      // First try to restore specific matches
      console.log('Restoring specific matches:', matchesToRestore);
      const restoreResult = await cricketService.restoreMatchPoints(matchesToRestore);
      console.log('Restore result:', restoreResult);
    } catch (restoreError) {
      console.error('Error during match restoration:', restoreError);
      // Continue with sync even if restore fails
    }
    
    await cricketService.restoreMatchPoints(matchesToRestore);
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const authHeader = request.headers.get('authorization');
    const result = await cricketService.recalculateAllPlayerStats();
    return NextResponse.json(result);
    
    console.log('Request context:', {
      isVercelCron,
      hasAuthHeader: !!authHeader,
      url: request.url,
      method: request.method
    });

    if (!isVercelCron) {
      if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.error('External request authentication failed');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('Authentication successful, starting match and player data sync...');
    const results = await cricketService.syncMatchData();

    return NextResponse.json({
      success: true,
      message: 'Match and player data successfully updated',
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('Error in recalculation route:', error);
    console.error('Error in cron job:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { error: 'Failed to update match and player data', details: error.message },
      { status: 500 }
    );
  }
}
