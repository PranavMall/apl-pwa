// app/api/cron/update-matches/route.js
import { cricketService } from '@/app/services/cricketService';
import { PointService } from '@/app/services/pointService';
import { PlayerMasterService } from '@/app/services/PlayerMasterService'; 
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
    const matchesToRestore = ['112469','112455']; // Add all your match IDs
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

        // Initialize the players with match points tracking Set HERE
        const playersWithMatchPoints = new Set();
        
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

              // Track that this player received match participation points
              playersWithMatchPoints.add(batsman.name);
              
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
              // Check if this player already got match points
              const hasMatchPoints = playersWithMatchPoints.has(bowler.name);

              // Get basic bowling points
              const bowlingPoints = PointService.calculateBowlingPoints(bowler);
              
              // If they haven't got match points yet, add them
              const finalPoints = hasMatchPoints ? 
                bowlingPoints : 
                bowlingPoints + PointService.POINTS.MATCH.PLAYED;
              
              // Mark that they've received match points
              if (!hasMatchPoints) {
                playersWithMatchPoints.add(bowler.name);
              }
              
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(bowler.name),
                matchId,
                finalPoints,
                {
                  type: 'bowling',
                  innings: inningsIndex + 1,
                  includesMatchPoints: !hasMatchPoints,
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
