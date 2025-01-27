// app/api/cron/update-matches/route.js
import { CricketService } from '@/app/services/cricketService';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  try {
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    const authHeader = request.headers.get('authorization');
    
    console.log('Request context:', {
      isVercelCron,
      hasAuthHeader: !!authHeader,
      url: request.url,
      method: request.method
    });

    // For Vercel cron jobs, we trust the x-vercel-cron header
    // For external requests, we require the authorization header
    if (!isVercelCron) {
      if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        console.error('External request authentication failed');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('Authentication successful, starting match data sync...');
    const results = await CricketService.syncMatchData();

    return NextResponse.json({
      success: true,
      message: 'Match data successfully updated',
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('Error in cron job:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { error: 'Failed to update match data', details: error.message },
      { status: 500 }
    );
  }
}
