// src/app/api/player-performance/route.js
import { NextResponse } from 'next/server';
import { SheetsSyncService } from '@/app/services/sheetsSyncSimple';

export async function GET(request) {
  try {
    // Extract sheetId from query parameters
    const url = new URL(request.url);
    const sheetId = url.searchParams.get('sheetId') || '1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM';
    const weekNumber = url.searchParams.get('week'); // Optional week filter
    
    // Log the start of process
    console.log(`Fetching player performance data from Google Sheet ID: ${sheetId}${weekNumber ? ` for week ${weekNumber}` : ''}`);
    const startTime = Date.now();
    
    // Fetch raw performance data from the sheet
    const performanceData = await SheetsSyncService.fetchPerformanceData(sheetId);
    
    if (!performanceData || performanceData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No data found in the sheet' 
      }, { status: 404 });
    }
    
    // Optional filtering by week
    let filteredData = performanceData;
    if (weekNumber) {
      filteredData = performanceData.filter(row => 
        row.Week === weekNumber || row.Week === parseInt(weekNumber)
      );
      
      if (filteredData.length === 0) {
        return NextResponse.json({ 
          success: false, 
          error: `No data found for week ${weekNumber}` 
        }, { status: 404 });
      }
    }
    
    // Log performance metrics
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`Processed ${filteredData.length} player records in ${duration.toFixed(2)} seconds`);
    
    return NextResponse.json({
      success: true,
      processedRows: filteredData,
      recordCount: filteredData.length,
      processingTime: `${duration.toFixed(2)} seconds`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching player performance data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch player performance data', details: error.message },
      { status: 500 }
    );
  }
}
