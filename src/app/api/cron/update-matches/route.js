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
const TIMEOUT_MARGIN = 9000; // 9 seconds (slightly increased for better safety)
const startTime = Date.now();

// More detailed logging
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Check if we're approaching the timeout limit
function shouldContinueProcessing() {
  const elapsed = Date.now() - startTime;
  const shouldContinue = elapsed < TIMEOUT_MARGIN;
  
  if (!shouldContinue) {
    log(`Approaching timeout after ${elapsed}ms, will gracefully stop processing`);
  }
  
  return shouldContinue;
}

export async function GET(request) {
  try {
    // Only perform a match data sync if explicitly requested via query param
    // This helps focus the limited execution time on point processing
    const { searchParams } = new URL(request.url);
    const syncMatches = searchParams.get('sync') === 'true';
    
    if (syncMatches && shouldContinueProcessing()) {
      log('Starting match data sync from API...');
      await cricketService.syncMatchData();
      log('Match data sync completed');
    }
    
    // List of matches to process - add all your match IDs here
    const matchesToProcess = ['112395', '112413', '112409', '112402', '112420', '112427', '112430', '112437'];
    log(`Matches to process: ${matchesToProcess.join(', ')}`);

    // Reference to the processingState collection
    const processingStatesRef = collection(db, 'processingState');
    
    try {
      const matchesRef = collection(db, 'matches');
      let processedMatchId = null; // Track which match we're processing
      
      // Process matches one by one
      for (const matchId of matchesToProcess) {
        processedMatchId = matchId;
        
        // Check for timeout before starting each match
        if (!shouldContinueProcessing()) {
          return NextResponse.json({
            success: true,
            message: 'Partial processing completed due to timeout - will resume in next run',
            lastProcessedMatch: processedMatchId,
            timestamp: new Date().toISOString()
          });
        }
        
        // Get processing state for this match
        const processStateRef = doc(processingStatesRef, matchId);
        const processStateDoc = await getDoc(processStateRef);
        
        // Initialize the processing state if it doesn't exist
        let processingState = processStateDoc.exists() 
          ? processStateDoc.data() 
          : {
              currentInnings: 0,
              currentBatsmenIndex: 0,
              currentBowlersIndex: 0,
              fieldingProcessed: false,
              completed: false,
              lastUpdated: new Date().toISOString()
            };
            
        log(`Processing state for match ${matchId}: ${JSON.stringify(processingState)}`);

        // Skip if already completed
        if (processingState.completed) {
          log(`Match ${matchId} already completed, skipping...`);
          continue;
        }

        // Get match data
        const matchQuery = query(matchesRef, where('matchId', '==', matchId));
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          log(`Match ${matchId} not found in database, skipping...`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);
        log(`Current state: innings=${processingState.currentInnings}, batsmen=${processingState.currentBatsmenIndex}, bowlers=${processingState.currentBowlersIndex}`);

        // Check if match is abandoned
        if (matchData.matchInfo?.state === 'Abandon' || 
            matchData.matchHeader?.state === 'Abandon' ||
            matchData.isAbandoned === true ||
            matchData.scorecard?.isAbandoned === true ||
            (matchData.status && matchData.status.toLowerCase().includes('abandon'))) {
          log(`Match ${matchId} was abandoned, marking as completed without processing points`);
          
          // Mark as completed without processing
          processingState.completed = true;
          processingState.abandonedMatch = true;
          processingState.lastUpdated = new Date().toISOString();
          await setDoc(processStateRef, processingState);
          continue;
        }

        // Validate scorecard structure - this is where we need to check the actual structure
        if (!matchData.scorecard || !matchData.scorecard.scoreCard) {
          log(`Invalid scorecard structure for match ${matchId}, skipping...`);
          processingState.error = 'Invalid scorecard structure';
          processingState.lastUpdated = new Date().toISOString();
          await setDoc(processStateRef, processingState);
          continue;
        }

        // Track fielding contributions for this match
        const fieldingPoints = new Map();

        // Get innings from the scorecard structure - this matches your API response
        const innings = matchData.scorecard.scoreCard || [];
        log(`Found ${innings.length} innings to process`);
        
        // Process only remaining innings based on processing state
        let currentInningsCompleted = false;
        
        for (let inningsIndex = processingState.currentInnings; inningsIndex < innings.length; inningsIndex++) {
          // Set flag to track if we complete this innings
          currentInningsCompleted = false;
          
          // Check for timeout before starting each innings
          if (!shouldContinueProcessing()) {
            log(`Timing out during match ${matchId}, innings ${inningsIndex + 1} - will resume here next time`);
            return NextResponse.json({
              success: true,
              message: 'Partial processing completed due to timeout - will resume from current innings',
              lastProcessedMatch: matchId,
              timestamp: new Date().toISOString()
            });
          }
          
          const inningData = innings[inningsIndex];
          log(`Processing innings ${inningsIndex + 1}`);

          // Get batsmen data from the correct structure
          const batsmenData = inningData.batTeamDetails?.batsmenData || {};
          const batsmen = Object.values(batsmenData);
          log(`Processing ${batsmen.length} batsmen starting from index ${processingState.currentBatsmenIndex}`);
          
          let batsmenCompleted = true; // Will be set to false if we break out early
          
          // Start from where we left off
          for (let batsmanIndex = processingState.currentBatsmenIndex; batsmanIndex < batsmen.length; batsmanIndex++) {
            // Check for timeout before processing each player
            if (!shouldContinueProcessing()) {
              log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, batsman ${batsmanIndex} - will resume here next time`);
              
              // Update the processing state before exiting
              processingState.currentInnings = inningsIndex;
              processingState.currentBatsmenIndex = batsmanIndex;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
              return NextResponse.json({
                success: true, 
                message: `Partial processing completed due to timeout - will resume from batsman ${batsmanIndex}`,
                lastProcessedMatch: matchId,
                timestamp: new Date().toISOString()
              });
            }
            
            const batsman = batsmen[batsmanIndex];
            log(`Processing batsman ${batsmanIndex + 1}/${batsmen.length}: ${batsman?.batName || 'Unknown'}`);
            
            if (!batsman || !batsman.batName) {
              log(`Skipping invalid batsman data at index ${batsmanIndex}`);
              continue;
            }

            try {
              // Process batting points
              const playerName = batsman.batName;
              const playerId = PointService.createPlayerDocId(playerName);
              log(`Calculating batting points for ${playerName} (${playerId})`);
              
              const battingPoints = PointService.calculateBattingPoints({
                runs: parseInt(batsman.runs) || 0,
                balls: parseInt(batsman.balls) || 0,
                fours: parseInt(batsman.fours) || 0,
                sixes: parseInt(batsman.sixes) || 0,
                dismissal: batsman.outDesc
              });
              
              log(`Storing batting points for ${playerName}: ${battingPoints}`);
              
              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                battingPoints,
                {
                  type: 'batting',
                  innings: inningsIndex + 1,
                  name: playerName,
                  runs: batsman.runs,
                  balls: batsman.balls,
                  fours: batsman.fours,
                  sixes: batsman.sixes
                }
              );

              // Process fielding stats from dismissal
              if (batsman.outDesc && batsman.wicketCode) {
                const fielder = PointService.extractFielderFromDismissal(batsman.outDesc, batsman.wicketCode);
                if (fielder) {
                  const fielderId = PointService.createPlayerDocId(fielder.name);
                  log(`Recording fielding contribution for ${fielder.name}: ${fielder.type}`);
                  
                  if (!fieldingPoints.has(fielderId)) {
                    fieldingPoints.set(fielderId, { 
                      name: fielder.name,
                      catches: 0, 
                      stumpings: 0, 
                      runouts: 0 
                    });
                  }
                  
                  const stats = fieldingPoints.get(fielderId);
                  switch (fielder.type) {
                    case 'catch': 
                      stats.catches++; 
                      log(`Recorded catch for ${fielder.name}, total: ${stats.catches}`);
                      break;
                    case 'stumping': 
                      stats.stumpings++;
                      log(`Recorded stumping for ${fielder.name}, total: ${stats.stumpings}`);
                      break;
                    case 'runout': 
                      stats.runouts++;
                      log(`Recorded runout for ${fielder.name}, total: ${stats.runouts}`);
                      break;
                  }
                }
              }

              // Update processing state after each batsman
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              log(`Error processing batsman ${batsman.batName}: ${error.message}`);
              // Still update state so we can continue from next player
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              processingState.lastBatsmanError = error.message;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
            }
          }
          
          // Reset batsmen index and move to bowlers
          processingState.currentBatsmenIndex = 0;
          processingState.lastUpdated = new Date().toISOString();
          await setDoc(processStateRef, processingState);
          log('Completed processing batsmen for this innings');

          // Process bowling performances - using the correct API structure
          const bowlersData = inningData.bowlTeamDetails?.bowlersData || {};
          const bowlers = Object.values(bowlersData);
          log(`Processing ${bowlers.length} bowlers starting from index ${processingState.currentBowlersIndex}`);
          
          let bowlersCompleted = true; // Will be set to false if we break out early
          
          // Start from where we left off
          for (let bowlerIndex = processingState.currentBowlersIndex; bowlerIndex < bowlers.length; bowlerIndex++) {
            // Check for timeout before processing each bowler
            if (!shouldContinueProcessing()) {
              log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, bowler ${bowlerIndex} - will resume here next time`);
              
              // Update the processing state before exiting
              processingState.currentInnings = inningsIndex;
              processingState.currentBowlersIndex = bowlerIndex;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
              return NextResponse.json({
                success: true,
                message: `Partial processing completed due to timeout - will resume from bowler ${bowlerIndex}`,
                lastProcessedMatch: matchId,
                timestamp: new Date().toISOString()
              });
            }
            
            const bowler = bowlers[bowlerIndex];
            log(`Processing bowler ${bowlerIndex + 1}/${bowlers.length}: ${bowler?.bowlName || 'Unknown'}`);
            
            if (!bowler || !bowler.bowlName) {
              log(`Skipping invalid bowler data at index ${bowlerIndex}`);
              continue;
            }

            try {
              const playerName = bowler.bowlName;
              const playerId = PointService.createPlayerDocId(playerName);
              log(`Calculating bowling points for ${playerName} (${playerId})`);
              
              const bowlingPoints = PointService.calculateBowlingPoints({
                wickets: parseInt(bowler.wickets) || 0,
                maidens: parseInt(bowler.maidens) || 0,
                bowler_runs: parseInt(bowler.runs) || 0,
                overs: parseFloat(bowler.overs) || 0
              });
              
              // Add match played points if this is their first performance in the match
              const matchPlayedPoints = PointService.POINTS.MATCH.PLAYED;
              const totalPoints = bowlingPoints + matchPlayedPoints;
              
              log(`Storing bowling points for ${playerName}: ${totalPoints} (includes ${matchPlayedPoints} match points)`);

              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                totalPoints, // Include match played points
                {
                  type: 'bowling',
                  innings: inningsIndex + 1,
                  includesMatchPoints: true, // Flag that match points are included
                  name: playerName,
                  wickets: bowler.wickets,
                  maidens: bowler.maidens,
                  runs: bowler.runs,
                  overs: bowler.overs
                }
              );

              // Update processing state after each bowler
              processingState.currentBowlersIndex = bowlerIndex + 1;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              log(`Error processing bowler ${bowler.bowlName}: ${error.message}`);
              // Still update state so we can continue from next player
              processingState.currentBowlersIndex = bowlerIndex + 1;
              processingState.lastBowlerError = error.message;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
            }
          }

          // Move to next innings after completing this one
          log('Completed processing bowlers for this innings');
          currentInningsCompleted = true;
          processingState.currentInnings = inningsIndex + 1;
          processingState.currentBatsmenIndex = 0;
          processingState.currentBowlersIndex = 0;
          processingState.lastUpdated = new Date().toISOString();
          await setDoc(processStateRef, processingState);
        }

        // Process fielding if not already done
        if (!processingState.fieldingProcessed && currentInningsCompleted) {
          // Check for timeout before processing fielding
          if (!shouldContinueProcessing()) {
            log(`Timing out before fielding processing for match ${matchId} - will resume here next time`);
            return NextResponse.json({
              success: true,
              message: 'Partial processing completed due to timeout - will resume with fielding',
              lastProcessedMatch: matchId,
              timestamp: new Date().toISOString()
            });
          }
          
          log(`Processing fielding points for ${fieldingPoints.size} players`);
          
          let fielderIndex = 0;
          for (const [fielderId, stats] of fieldingPoints.entries()) {
            // Check for timeout before processing each fielder
            if (!shouldContinueProcessing()) {
              log(`Timing out during fielding processing for match ${matchId} - will resume here next time`);
              
              // Update the state with progress
              processingState.lastFieldingIndex = fielderIndex;
              processingState.lastUpdated = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
              return NextResponse.json({
                success: true,
                message: 'Partial processing completed due to timeout - will resume with remaining fielding',
                lastProcessedMatch: matchId,
                timestamp: new Date().toISOString()
              });
            }
            
            try {
              log(`Processing fielding points for ${stats.name}`);
              const fieldingPts = PointService.calculateFieldingPoints(stats);
              
              log(`Storing fielding points for ${stats.name}: ${fieldingPts}`);
              await PointService.storePlayerMatchPoints(
                fielderId,
                matchId,
                fieldingPts,
                {
                  type: 'fielding',
                  name: stats.name,
                  catches: stats.catches,
                  stumpings: stats.stumpings,
                  runouts: stats.runouts
                }
              );
              
              fielderIndex++;
            } catch (error) {
              log(`Error processing fielding points for ${stats.name}: ${error.message}`);
              fielderIndex++;
            }
          }

          processingState.fieldingProcessed = true;
          processingState.lastUpdated = new Date().toISOString();
          await setDoc(processStateRef, processingState);
          log('Completed processing fielding for this match');
        }

        // Mark match as completed
        processingState.completed = true;
        processingState.lastUpdated = new Date().toISOString();
        await setDoc(processStateRef, processingState);

        log(`Successfully completed processing match ${matchId}`);
      }

      return NextResponse.json({
        success: true,
        message: 'Match and player data update process completed',
        lastProcessedMatch: processedMatchId,
        timestamp: new Date().toISOString()
      });
