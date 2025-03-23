// src/app/api/sync/player-stats/route.js
import { NextResponse } from 'next/server';
import { SheetsSyncService } from '@/app/services/sheetsSyncService';

export async function GET(request) {
  try {
    // Get the sheet ID from environment variables or query parameters
    const url = new URL(request.url);
    const sheetId = url.searchParams.get('sheetId') || process.env.PLAYER_STATS_SHEET_ID || '1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM';
    
    if (!sheetId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No sheet ID provided' 
      }, { status: 400 });
    }
    
    // Log the start of process
    console.log(`Starting sync from Google Sheet ID: ${sheetId}`);
    
    // Fetch performance data from the sheet
    const performanceData = await SheetsSyncService.fetchPerformanceData(sheetId);
    
    if (!performanceData || performanceData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No data found in the sheet' 
      }, { status: 404 });
    }
    
    console.log(`Successfully fetched ${performanceData.length} rows of player data`);
    
    // Update user stats with the performance data
    const result = await SheetsSyncService.updateUserStats(performanceData);
    
    return NextResponse.json({
      success: true,
      message: 'Player stats sync completed',
      processedRows: performanceData.length,
      results: result.results || [],
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error syncing player stats:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync player stats', details: error.message },
      { status: 500 }
    );
  }
}
