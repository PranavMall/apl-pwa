// route.js
import { CricketService } from '@/app/services/cricketService';
import { PlayerService } from '@/app/services//playerService';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Authentication check
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const authHeader = request.headers.get('authorization');
    
    if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // You can specify match IDs or use defaults
    const matchIds = ['106596', '106588', '106580', '106569', '106572']; // Example match IDs
    const results = await CricketService.syncMatchData(matchIds);

    return NextResponse.json({
      success: true,
      message: 'Match and player data successfully updated',
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json(
      { error: 'Failed to update data', details: error.message },
      { status: 500 }
    );
  }
}
