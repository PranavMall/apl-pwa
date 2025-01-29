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

    // Log incoming request URL to check for query parameters
    console.log('Incoming request URL:', request.url);

    // Parse URL and retrieve match IDs if provided
    const url = new URL(request.url, `https://${request.headers.get('host')}`);
    const matchIdsParam = url.searchParams.get('matchIds');
    let matchIds;

    if (matchIdsParam) {
      matchIds = matchIdsParam.split(',').map(id => id.trim()); // Convert "106596,106588" to ["106596", "106588"]
      console.log(`Received matchIds from query params: ${matchIds}`);
    } else {
      matchIds = ['106596', '106588', '106580', '106569', '106572']; // Default match IDs
      console.log(`Using default matchIds: ${matchIds}`);
    }

    if (!Array.isArray(matchIds) || matchIds.length === 0) {
      throw new Error('matchIds array is empty or invalid.');
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
