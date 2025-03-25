// src/app/api/sync/player-stats/route.js

import { NextResponse } from 'next/server';
import { SheetsSyncService } from '@/app/services/sheetsSyncSimple';

export async function GET(request) {
  try {
    // Get parameters
    const url = new URL(request.url);
    const sheetId = url.searchParams.get('sheetId') || process.env.PLAYER_STATS_SHEET_ID;
    
    // New pagination parameters
    const weekParam = url.searchParams.get('week');
    const weekNumber = weekParam ? parseInt(weekParam) : null;
    const userStartIndex = url.searchParams.get('startIndex') ? parseInt(url.searchParams.get('startIndex')) : 0;
    const batchSize = url.searchParams.get('batchSize') ? parseInt(url.searchParams.get('batchSize')) : 50;
    
    if (!sheetId) {
      return NextResponse.json({ 
        success: false, 
        error: 'No sheet ID provided' 
      }, { status: 400 });
    }
    
    console.log(`Starting sync from Google Sheet ID: ${sheetId}`);
    console.log(`Pagination: ${weekNumber ? 'Week ' + weekNumber : 'All weeks'}, Starting from user ${userStartIndex}, Batch size ${batchSize}`);
    
    // Fetch performance data from the sheet
    const performanceData = await SheetsSyncService.fetchPerformanceData(sheetId);
    
    if (!performanceData || performanceData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No data found in the sheet' 
      }, { status: 404 });
    }
    
    console.log(`Successfully fetched ${performanceData.length} rows of player data`);
    
    // Filter data to specific week if provided
    const filteredData = weekNumber 
      ? performanceData.filter(row => parseInt(row.Week) === weekNumber)
      : performanceData;
    
    console.log(`Processing ${filteredData.length} rows ${weekNumber ? `for week ${weekNumber}` : 'across all weeks'}`);
    
    // Update user stats with pagination
    const result = await SheetsSyncService.updateUserStatsWithPagination(
      filteredData, 
      weekNumber,
      userStartIndex,
      batchSize
    );
    
    // Determine if there's more data to process
    const hasMoreUsers = result.hasMoreUsers || false;
    const nextStartIndex = result.nextStartIndex || 0;
    
    // Return information about sync progress and next batch
    return NextResponse.json({
      success: true,
      message: hasMoreUsers 
        ? `Partial sync completed (batch ${userStartIndex/batchSize + 1}). Please run next batch.` 
        : 'Complete sync finished successfully',
      processedRows: filteredData.length,
      processedUsers: result.processedUsers || 0,
      totalUsers: result.totalUsers || 0,
      weekNumber: weekNumber,
      hasMoreUsers,
      nextStartIndex,
      nextBatchUrl: hasMoreUsers
        ? `/api/sync/player-stats?sheetId=${sheetId}${weekNumber ? `&week=${weekNumber}` : ''}&startIndex=${nextStartIndex}&batchSize=${batchSize}`
        : null,
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
