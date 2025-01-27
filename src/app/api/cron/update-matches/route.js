// app/api/cron/update-matches/route.js
import { CricketService } from '@/app/services/cricketService';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request) {
  try {
    // Enhanced logging for debugging
    const requestUrl = new URL(request.url);
    console.log('Request URL:', requestUrl.toString());
    console.log('Request Method:', request.method);
    
    // Comprehensive header logging
    const headers = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log('All Headers:', headers);

    // Multi-layer authentication check
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('CRON_SECRET environment variable is not set');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!authHeader) {
      console.error('No authorization header present');
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 });
    }

    const expectedAuth = `Bearer ${cronSecret}`;
    if (authHeader !== expectedAuth) {
      console.error('Invalid authorization token');
      return NextResponse.json({ error: 'Invalid authorization token' }, { status: 401 });
    }

    console.log('Authentication successful, proceeding with match sync...');

    // Perform match sync with enhanced error handling
    const results = await CricketService.syncMatchData();
    
    // Validate sync results
    if (!results || !results.success) {
      throw new Error('Match sync completed but returned invalid results');
    }

    return NextResponse.json({
      success: true,
      message: 'Match data successfully updated',
      timestamp: new Date().toISOString(),
      results
    });
  } catch (error) {
    console.error('Detailed error in match update cron job:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    return NextResponse.json({
      error: 'Failed to update match data',
      details: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
