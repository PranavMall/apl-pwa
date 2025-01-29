import { CricketService } from '@/app/services/cricketService';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // Authentication check
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const authHeader = request.headers.get('authorization');

    if (!isVercelCron && (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if match IDs are passed via query params
    const url = new URL(request.url);
    const matchIdsParam = url.searchParams.get('matchIds');
    let matchIds;

    if (matchIdsParam) {
      matchIds = matchIdsParam.split(','); // Convert "106596,106588" to ["106596", "106588"]
      console.log(`Received matchIds from query params: ${matchIds}`);
    } else {
      matchIds = ['106596', '106588', '106580', '106569', '106572']; // Default match IDs
      console.log(`Using default matchIds: ${matchIds}`);
    }

    console.log('Calling CricketService.syncMatchData() with matchIds:', matchIds);
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
