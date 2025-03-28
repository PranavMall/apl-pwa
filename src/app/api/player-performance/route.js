// src/app/api/player-performance/route.js
import { NextResponse } from 'next/server';
import { SheetsSyncService } from '@/app/services/sheetsSyncSimple';

export async function GET(request) {
  try {
    // Extract sheetId from query parameters
    const url = new URL(request.url);
    const sheetId = url.searchParams.get('sheetId') || '1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM';
    
    // Log the start of process
    console.log(`Fetching player performance data from Google Sheet ID: ${sheetId}`);
    
    // Fetch raw performance data from the sheet
    const performanceData = await SheetsSyncService.fetchPerformanceData(sheetId);
    
    if (!performanceData || performanceData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No data found in the sheet' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      processedRows: performanceData,
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
