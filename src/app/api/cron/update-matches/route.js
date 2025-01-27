// app/api/cron/update-matches/route.js
import { CricketService } from '@/app/services/cricketService';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  try {
    // Log the headers for debugging purposes
    console.log('Request Headers:', request.headers);

    // Verify the request is from the authorized cron job
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Authorized request. Starting match data sync...');

    // Sync match data
    const results = await CricketService.syncMatchData();

    console.log('Match data successfully updated:', results);
    return NextResponse.json({
      success: true,
      message: 'Match data successfully updated',
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error('Error during match update cron job:', error);
    return NextResponse.json(
      { error: 'Failed to update match data', details: error.message },
      { status: 500 }
    );
  }
}
