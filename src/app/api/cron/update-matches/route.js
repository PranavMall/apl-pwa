// app/api/cron/update-matches/route.js
import { cricketService } from '@/app/services/cricketService';
import { PointService } from '@/app/services/pointService';
import { NextResponse } from 'next/server';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc 
} from 'firebase/firestore';
import { db } from '../../../../firebase';  // Make sure path matches your firebase config

// Set a safety margin before Vercel's 10s timeout
const TIMEOUT_MARGIN = 9000; // 9 seconds

export async function GET(request) {
  // Reset timer at the start of each function invocation
  const startTime = Date.now();
  
  // Define the function inside GET to ensure it uses the fresh startTime
  function shouldContinueProcessing() {
    const elapsed = Date.now() - startTime;
    const shouldContinue = elapsed < TIMEOUT_MARGIN;
    
    if (!shouldContinue) {
      console.log(`Approaching timeout after ${elapsed}ms, will gracefully stop processing`);
    }
    
    return shouldContinue;
  }

  try {
    // Reset global timing variables at the start of each request
    global._lastCheckTime = undefined;
    const requestStartTime = Date.now();
    
    // Only sync if explicitly requested via query parameter
    const url = new URL(request.url);
    const syncRequested = url.searchParams.get('sync') === 'true';
    
    if (syncRequested) {
      // First, sync match data from the API to get the latest matches
      console.log('Starting match data sync...');
      await cricketService.syncMatchData();
    }

    // Now process player points for all matches
    const matchesToRestore = ['112395','112413','112409','112402','112420','112427','112430','112451','112444']; // Add all your match IDs
    console.log('Starting match restoration process...');

    // Create a processing state collection to track progress
    const processingStatesRef = collection(db, 'processingState');

    try {
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        // Check for timeout before processing each match
        if (!shouldContinueProcessing()) {
          const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
          return NextResponse.json({
            success: true,
            message: `Timeout prevention: processing stopped after ${elapsedSeconds.toFixed(2)} seconds`,
            timestamp: new Date().toISOString()
          });
        }
        
        // Get or create processing state for this match
        const processStateRef = doc(processingStatesRef, matchId);
        const processStateDoc = await getDoc(processStateRef);
        let processingState = processStateDoc.exists() 
          ? processStateDoc.data() 
          : {
              currentInnings: 0,
              currentBatsmenIndex: 0,
              currentBowlersIndex: 0,
              fieldingProcessed: false,
              completed: false
            };

        // Skip if already completed
        if (processingState.completed) {
          console.log(`Match ${matchId} already completed, skipping...`);
          continue;
        }

        // Get match data
        const matchQuery = query(matchesRef, where('matchId', '==', matchId));
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);
        console.log(`Current state: innings=${processingState.currentInnings}, batsmen=${processingState.currentBatsmenIndex}, bowlers=${processingState.currentBowlersIndex}`);

        // Check if match is abandoned
        if (matchData.matchInfo?.state === 'Abandon' || 
            matchData.matchHeader?.state === 'Abandon' ||
            matchData.isAbandoned === true ||
            matchData.scorecard?.isAbandoned === true ||
            (matchData.status && matchData.status.toLowerCase().includes('abandon'))) {
          console.log(`Match ${matchId} was abandoned, marking as completed without processing points`);
          
          // Mark as completed without processing
          processingState.completed = true;
          processingState.abandonedMatch = true;
          await setDoc(processStateRef, processingState);
          continue;
        }

        // Ensure the scorecard exists and has the expected structure
        if (!matchData.scorecard || !matchData.scorecard.team1 || !matchData.scorecard.team2) {
          console.error(`Invalid scorecard structure for match ${matchId}`);
          processingState.error = 'Invalid scorecard structure';
          await setDoc(processStateRef, processingState);
          continue;
        }

        // Track fielding contributions
        const fieldingPoints = new Map();

        // Use the same structure as your working code
        const innings = [matchData.scorecard.team1, matchData.scorecard.team2];
        console.log(`Found ${innings.length} innings to process`);
        
        // Process only remaining innings based on processing state
        for (let inningsIndex = processingState.currentInnings; inningsIndex < innings.length; inningsIndex++) {
          // Check for timeout before processing each innings
          if (!shouldContinueProcessing()) {
            const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
            console.log(`Timeout prevention: stopping during match ${matchId}, innings ${inningsIndex + 1} after ${elapsedSeconds.toFixed(2)} seconds`);
            return NextResponse.json({
              success: true,
              message: `Processing stopped at match ${matchId}, innings ${inningsIndex + 1} to prevent timeout`,
              timestamp: new Date().toISOString()
            });
          }
          
          const battingTeam = innings[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);

          // Process batting performances first
          const batsmen = Object.values(battingTeam.batsmen || {});
          console.log(`Processing ${batsmen.length} batsmen`);
          
          // Start from where we left off
          for (let batsmanIndex = processingState.currentBatsmenIndex; batsmanIndex < batsmen.length; batsmanIndex++) {
            // Check for timeout before processing each batsman
            if (!shouldContinueProcessing()) {
              // Save progress before exiting
              processingState.currentBatsmenIndex = batsmanIndex;
              processingState.currentInnings = inningsIndex;
              await setDoc(processStateRef, processingState);
              
              const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
              console.log(`Timeout prevention: saving progress at match ${matchId}, innings ${inningsIndex + 1}, batsman ${batsmanIndex} after ${elapsedSeconds.toFixed(2)} seconds`);
              
              return NextResponse.json({
                success: true,
                message: `Processing saved at match ${matchId}, innings ${inningsIndex + 1}, batsman ${batsmanIndex}`,
                timestamp: new Date().toISOString()
              });
            }
            
            const batsman = batsmen[batsmanIndex];
            if (!batsman.name) continue;

            try {
              // Process batting points
              const battingPoints = PointService.calculateBattingPoints(batsman);
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(batsman.name),
                matchId,
                battingPoints,
                {
                  type: 'batting',
                  innings: inningsIndex + 1,
                  ...batsman
                }
              );

              // Process fielding stats from dismissal
              const dismissal = batsman.outDesc || batsman.dismissal;
              const wicketCode = batsman.wicketCode || '';
              if (dismissal) {
                const fielder = PointService.extractFielderFromDismissal(dismissal, wicketCode);
                if (fielder) {
                  // Make sure fielder.id exists
                  const fielderId = fielder.id;
                  console.log(`Extracted fielder info: Name=${fielder.name}, ID=${fielderId}, Type=${fielder.type}`);
                  
                  if (!fieldingPoints.has(fielderId)) {
                    fieldingPoints.set(fielderId, {
                      id: fielderId,
                      name: fielder.name, // Keep original name for display
                      catches: 0,
                      stumpings: 0,
                      runouts: 0
                    });
                  }
                  
                  const stats = fieldingPoints.get(fielderId);
                  switch (fielder.type) {
                    case 'catch': stats.catches++; break;
                    case 'stumping': stats.stumpings++; break;
                    case 'runout': stats.runouts++; break;
                  }
                  
                  console.log(`Updated fielding stats for ${fielder.name} (ID: ${fielderId}): catches=${stats.catches}, stumpings=${stats.stumpings}, runouts=${stats.runouts}`);
                }
              }

              // Update processing state after each batsman
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing batsman ${batsman.name}:`, error);
            }
          }

          // Reset batsmen index and move to bowlers
          processingState.currentBatsmenIndex = 0;
          await setDoc(processStateRef, processingState);

          // Process bowling performances
          const bowlers = Object.values(battingTeam.bowlers || {});
          console.log(`Processing ${bowlers.length} bowlers`);
          
          // Start from where we left off
          for (let bowlerIndex = processingState.currentBowlersIndex; bowlerIndex < bowlers.length; bowlerIndex++) {
            // Check for timeout before processing each bowler
            if (!shouldContinueProcessing()) {
              // Save progress before exiting
              processingState.currentBowlersIndex = bowlerIndex;
              processingState.currentInnings = inningsIndex;
              await setDoc(processStateRef, processingState);
              
              const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
              console.log(`Timeout prevention: saving progress at match ${matchId}, innings ${inningsIndex + 1}, bowler ${bowlerIndex} after ${elapsedSeconds.toFixed(2)} seconds`);
              
              return NextResponse.json({
                success: true,
                message: `Processing saved at match ${matchId}, innings ${inningsIndex + 1}, bowler ${bowlerIndex}`,
                timestamp: new Date().toISOString()
              });
            }
            
            const bowler = bowlers[bowlerIndex];
            if (!bowler.name) continue;

            try {
              const bowlingPoints = PointService.calculateBowlingPoints(bowler);
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(bowler.name),
                matchId,
                bowlingPoints,
                {
                  type: 'bowling',
                  innings: inningsIndex + 1,
                  ...bowler
                }
              );

              // Update processing state after each bowler
              processingState.currentBowlersIndex = bowlerIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing bowler ${bowler.name}:`, error);
            }
          }

          // Move to next innings after completing this one
          processingState.currentInnings = inningsIndex + 1;
          processingState.currentBatsmenIndex = 0;
          processingState.currentBowlersIndex = 0;
          await setDoc(processStateRef, processingState);
        }

        // Process fielding if not already done
        if (!processingState.fieldingProcessed) {
          // Check for timeout before processing fielding points
          if (!shouldContinueProcessing()) {
            const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
            console.log(`Timeout prevention: stopping before fielding processing for match ${matchId} after ${elapsedSeconds.toFixed(2)} seconds`);
            return NextResponse.json({
              success: true,
              message: `Processing stopped before fielding for match ${matchId}`,
              timestamp: new Date().toISOString()
            });
          }
          
          console.log(`Processing fielding points for ${fieldingPoints.size} players`);
          for (const [fielderId, stats] of fieldingPoints.entries()) {
            // Check for timeout before processing each fielder
            if (!shouldContinueProcessing()) {
              const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
              console.log(`Timeout prevention: stopping during fielding processing for match ${matchId} after ${elapsedSeconds.toFixed(2)} seconds`);
              return NextResponse.json({
                success: true,
                message: `Processing stopped during fielding for match ${matchId}`,
                timestamp: new Date().toISOString()
              });
            }
            
            try {
              console.log(`Processing fielding for ${stats.name} (ID: ${fielderId})`);
              const fieldingPts = PointService.calculateFieldingPoints(stats);
              console.log(`Calculated ${fieldingPts} fielding points for ${stats.name} (ID: ${fielderId})`);
              
              await PointService.storePlayerMatchPoints(
                fielderId, // Already properly formatted
                matchId,
                fieldingPts,
                {
                  type: 'fielding',
                  name: stats.name, // Original name from the stats object
                  ...stats
                }
              );
              
              console.log(`Successfully stored ${fieldingPts} fielding points for ${stats.name} (ID: ${fielderId})`);
            } catch (error) {
              console.error(`Error processing fielding points for ${stats.name} (ID: ${fielderId}):`, error);
            }
          }

          processingState.fieldingProcessed = true;
          await setDoc(processStateRef, processingState);
        }

        // Mark match as completed
        processingState.completed = true;
        await setDoc(processStateRef, processingState);

        console.log(`Successfully completed processing match ${matchId}`);
      }

      const totalElapsedSeconds = (Date.now() - requestStartTime) / 1000;
      return NextResponse.json({
        success: true,
        message: 'Match and player data update process completed',
        processingTime: `${totalElapsedSeconds.toFixed(2)} seconds`,
        timestamp: new Date().toISOString()
      });
    } catch (restoreError) {
      console.error('Error during match restoration:', restoreError);
      throw restoreError;
    }
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json(
      { error: 'Failed to update match and player data', details: error.message },
      { status: 500 }
    );
  }
}
