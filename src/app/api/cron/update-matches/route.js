// app/api/cron/update-matches/route.js
import { CricketService } from '@/app/services/cricketService';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

const RAPID_API_KEY = process.env.NEXT_PUBLIC_RAPID_API_KEY;
const CRICKET_API_HOST = 'cricbuzz-cricket.p.rapidapi.com';

export async function GET(request) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Sync match data
    await CricketService.syncMatchData();

    return NextResponse.json({
      success: true,
      message: 'Match data successfully updated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Failed to update match data' },
      { status: 500 }
    );
  }
}
