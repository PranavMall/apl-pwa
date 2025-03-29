// src/app/api/sync/player-stats/route.js
import { NextResponse } from 'next/server';
import { SheetsSyncService } from '@/app/services/sheetsSyncSimple';

export async function GET(request) {
  try {
    // Get the sheet ID from environment variables or query parameters
    const url = new URL(request.url);
    const sheetId = url.searchParams.get('sheetId') || process.env.PLAYER_STATS_SHEET_ID || '1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM';
    const weekNumber = url.searchParams.get('weekNumber'); // Get optional week number filter
    
    if (!sheetId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No sheet ID provided' 
      }, { status: 400 });
    }
    
    // Log the start of process
    console.log(`Starting sync from Google Sheet ID: ${sheetId}${weekNumber ? `, filtering for week ${weekNumber}` : ''}`);
    
    // Fetch performance data from the sheet
    const performanceData = await SheetsSyncService.fetchPerformanceData(sheetId);
    
    if (!performanceData || performanceData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No data found in the sheet' 
      }, { status: 404 });
    }
    
    // Filter data by week number if specified
    let filteredData = performanceData;
    if (weekNumber) {
      filteredData = performanceData.filter(row => row.Week === weekNumber.toString());
      console.log(`Filtered data to ${filteredData.length} rows for week ${weekNumber}`);
      
      if (filteredData.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: `No data found for week ${weekNumber}` 
        }, { status: 404 });
      }
    }
    
    console.log(`Successfully fetched ${filteredData.length} rows of player data`);
    
    // Update user stats with the performance data
    const result = await SheetsSyncService.updateUserStats(filteredData);
    
    return NextResponse.json({
      success: true,
      message: `Player stats sync completed${weekNumber ? ` for week ${weekNumber}` : ''}`,
      processedRows: filteredData.length,
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
