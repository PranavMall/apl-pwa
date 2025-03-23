// app/api/cron/update-matches/route.js
import { cricketService } from '@/app/services/cricketService';
import { PointService } from '@/app/services/pointService';
import { transferService } from "@/app/services/transferService";
import { PlayerMasterService } from '@/app/services/PlayerMasterService'; 
import { NextResponse } from 'next/server';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../../../../firebase';

// Set a safety margin before Vercel's 10s timeout
const TIMEOUT_MARGIN = 9000; // 9 seconds
const processStateRef = doc(processingStatesRef, matchId);
const processStateDoc = await getDoc(processStateRef);

export async function GET(request) {
  if (global.gc) {
  global.gc();
}
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
    
    // Parse URL parameters
    const url = new URL(request.url);
    const syncRequested = url.searchParams.get('sync') === 'true';
    const specificMatchId = url.searchParams.get('matchId'); // Parameter for a specific match
    const matchIdsParam = url.searchParams.get('matchIds'); // Parameter for multiple matches
    
    // Get match IDs from environment variables if available
    const envMatchIds = process.env.CRICKET_MATCH_IDS || '';
    
    // Determine which match IDs to process
    // Priority: 1. URL parameter 2. Environment variable 3. Default list
    let matchesToProcess = [];
    
    if (specificMatchId) {
      // Process a single match from URL parameter
      matchesToProcess = [specificMatchId];
    } else if (matchIdsParam) {
      // Process multiple matches from URL parameter
      matchesToProcess = matchIdsParam.split(',').map(id => id.trim());
    } else if (envMatchIds) {
      // Process matches from environment variable
      matchesToProcess = envMatchIds.split(',').map(id => id.trim());
    } else {
      // Fallback to a default list if no other source is available
      matchesToProcess = [];
    }
    
    console.log(`Will process ${matchesToProcess.length} match(es): ${matchesToProcess.join(', ')}`);
    
    // Result array to track what we've done
    const results = [];
    
    // Optionally sync all matches if requested
    if (syncRequested) {
      console.log('Starting match data sync...');
      await cricketService.syncMatchData();
      results.push({ action: 'sync', success: true });
    }

    // Create a processing state collection to track progress
    const processingStatesRef = collection(db, 'processingState');

    try {
      // Process each match directly
      for (const matchId of matchesToProcess) {
        // Check for timeout before processing each match
        if (!shouldContinueProcessing()) {
          const elapsedSeconds = (Date.now() - requestStartTime) / 1000;
          return NextResponse.json({
            success: true,
            message: `Timeout prevention: processing stopped after ${elapsedSeconds.toFixed(2)} seconds`,
            results,
            timestamp: new Date().toISOString()
          });
        }
        
        try {
          console.log(`Processing match ID: ${matchId}`);
          
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
            results.push({ matchId, status: 'skipped', reason: 'already completed' });
            continue;
          }
          if (processStateDoc.exists() && processStateDoc.data().resetInProgress) {
  console.log(`Match ${matchId} is being reset, skipping processing`);
  results.push({ matchId, status: 'skipped', reason: 'reset in progress' });
  continue;  // Skip to next match
}
  
          // Get match data
          const matchesRef = collection(db, 'matches');
          const matchQuery = query(matchesRef, where('matchId', '==', matchId));
          const matchSnapshot = await getDocs(matchQuery);
          
          // If match doesn't exist in DB, fetch it from API first
          if (matchSnapshot.empty) {
            console.log(`Match ${matchId} not found in database. Fetching from API...`);
            
            try {
              // Try to fetch this match directly from the API
              const fetchResult = await cricketService.fetchAndSyncSpecificMatch(matchId);
              console.log(`API fetch result for match ${matchId}:`, fetchResult);
              
              if (fetchResult.success) {
                results.push({ matchId, status: 'fetched-and-processed', success: true });
              } else {
                results.push({ 
                  matchId, 
                  status: 'fetch-failed', 
                  error: fetchResult.error || 'Unknown error' 
                });
              }
              
              // Skip to next match since we've either processed it or failed
              continue;
            } catch (fetchError) {
              console.error(`Error fetching match ${matchId} from API:`, fetchError);
              results.push({ 
                matchId, 
                status: 'failed', 
                reason: 'API fetch error', 
                error: fetchError.message 
              });
              continue;
            }
          }
  
          // If we got here, the match exists in the database
          const matchData = matchSnapshot.docs[0].data();
          console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);
          
          // Rest of your existing match processing code...
          // [Your match processing logic here]
          
          // For brevity, I'll add a placeholder indicating where your existing code should go
          console.log(`Current state: innings=${processingState.currentInnings}, batsmen=${processingState.currentBatsmenIndex}, bowlers=${processingState.currentBowlersIndex}`);

          // Initialize the players with match points tracking Set
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
            results.push({ matchId, status: 'abandoned', success: true });
            continue;
          }

          // Ensure the scorecard exists and has the expected structure
          if (!matchData.scorecard || !matchData.scorecard.team1 || !matchData.scorecard.team2) {
            console.error(`Invalid scorecard structure for match ${matchId}`);
            processingState.error = 'Invalid scorecard structure';
            await setDoc(processStateRef, processingState);
            results.push({ matchId, status: 'failed', reason: 'invalid scorecard structure' });
            continue;
          }

          // Process match data
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
                results,
                timestamp: new Date().toISOString()
              });
            }
            
            const battingTeam = innings[inningsIndex];
            console.log(`Processing innings ${inningsIndex + 1}`);

            // Process batting performances first
            const batsmen = Array.isArray(battingTeam.batsmen) ? battingTeam.batsmen : Object.values(battingTeam.batsmen || {});
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
                  results,
                  timestamp: new Date().toISOString()
                });
              }
              
              const batsman = batsmen[batsmanIndex];
              if (!batsman?.name) continue;

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
            const bowlers = Array.isArray(battingTeam.bowlers) ? battingTeam.bowlers : Object.values(battingTeam.bowlers || {});
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
                  results,
                  timestamp: new Date().toISOString()
                });
              }
              
              const bowler = bowlers[bowlerIndex];
              if (!bowler?.name) continue;

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
          results.push({ matchId, status: 'completed', success: true });

          console.log(`Successfully completed processing match ${matchId}`);
        } catch (matchError) {
          console.error(`Error processing match ${matchId}:`, matchError);
          results.push({ 
            matchId, 
            status: 'error', 
            error: matchError.message 
          });
        }
      }
      // Add this code before the final return statement:
if (results.some(r => r.status === 'completed' || r.pointsCalculated)) {
  // For each processed match, update user team points
  for (const result of results) {
    if (result.status === 'completed' || result.pointsCalculated) {
      try {
        await transferService.updateUserWeeklyStats(result.matchId);
        console.log(`Updated user weekly stats for match ${result.matchId}`);
      } catch (error) {
        console.error(`Error updating user weekly stats for match ${result.matchId}:`, error);
      }
    }
  }
  try {
    // Get the active tournament
    const tournament = await transferService.getActiveTournament();
    try {
  await transferService.updateUserTeamPoints(tournament.id);
  console.log('User teams synchronized with latest player data');
} catch (error) {
  console.error('Error synchronizing user teams:', error);
}
    if (tournament) {
      // Update rankings for all affected weeks
      const affectedWeeks = new Set();
      for (const result of results) {
        if (result.status === 'completed' || result.pointsCalculated) {
          // Get week number for this match
          const matchWeekRef = doc(db, 'matchWeeks', result.matchId);
          const matchWeekDoc = await getDoc(matchWeekRef);
          if (matchWeekDoc.exists()) {
            affectedWeeks.add(matchWeekDoc.data().weekNumber);
          }
        }
      }
      
      // Update rankings for each affected week
      for (const weekNumber of affectedWeeks) {
        await transferService.updateWeeklyRankings(tournament.id, weekNumber);
      }
      
      // Update overall rankings
      await transferService.updateOverallRankings(tournament.id);
      
      console.log('Rankings updated successfully');
    }
    
  } catch (error) {
    console.error('Error updating rankings:', error);
  }
}

      const totalElapsedSeconds = (Date.now() - requestStartTime) / 1000;
      return NextResponse.json({
        success: true,
        message: 'Match and player data update process completed',
        processingTime: `${totalElapsedSeconds.toFixed(2)} seconds`,
        results,
        matchesProcessed: matchesToProcess,
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
