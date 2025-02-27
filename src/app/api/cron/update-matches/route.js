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
const TIMEOUT_MARGIN = 8000; // 8 seconds
const startTime = Date.now();

function shouldContinueProcessing() {
  const elapsed = Date.now() - startTime;
  const shouldContinue = elapsed < TIMEOUT_MARGIN;
  
  if (!shouldContinue) {
    console.log(`Approaching timeout after ${elapsed}ms, will gracefully stop processing`);
  }
  
  return shouldContinue;
}

export async function GET(request) {
  try {
    // First, sync match data from the API to get the latest matches
    // Only do this if we have plenty of time
    if (shouldContinueProcessing()) {
      console.log('Starting match data sync...');
      await cricketService.syncMatchData();
    }
    
    const matchesToRestore = ['112395','112413','112409','112402','112420','112427','112430']; 
    console.log('Starting match restoration process...');

    const processingStatesRef = collection(db, 'processingState');

    try {
      const matchesRef = collection(db, 'matches');
      
      // Process matches one by one
      for (const matchId of matchesToRestore) {
        // Check for timeout before starting each match
        if (!shouldContinueProcessing()) {
          return NextResponse.json({
            success: true,
            message: 'Partial processing completed due to timeout - will resume in next run',
            timestamp: new Date().toISOString()
          });
        }
        
        // Get processing state for this match
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

        // Track fielding contributions for this match
        const fieldingPoints = new Map();

        // Use the same structure as your working code
        const innings = [matchData.scorecard.team1, matchData.scorecard.team2];
        console.log(`Found ${innings.length} innings to process`);
        
        // Process only remaining innings based on processing state
        for (let inningsIndex = processingState.currentInnings; inningsIndex < innings.length; inningsIndex++) {
          // Check for timeout before starting each innings
          if (!shouldContinueProcessing()) {
            console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1} - will resume here next time`);
            return NextResponse.json({
              success: true,
              message: 'Partial processing completed due to timeout - will resume from current innings',
              timestamp: new Date().toISOString()
            });
          }
          
          const battingTeam = innings[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);

          // Process batting performances first
          const batsmen = Object.values(battingTeam.batsmen || {});
          console.log(`Processing ${batsmen.length} batsmen starting from index ${processingState.currentBatsmenIndex}`);
          
          // Start from where we left off
          for (let batsmanIndex = processingState.currentBatsmenIndex; batsmanIndex < batsmen.length; batsmanIndex++) {
            // Check for timeout before processing each player
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, batsman ${batsmanIndex} - will resume here next time`);
              return NextResponse.json({
                success: true,
                message: `Partial processing completed due to timeout - will resume from batsman ${batsmanIndex}`,
                timestamp: new Date().toISOString()
              });
            }
            
            const batsman = batsmen[batsmanIndex];
            if (!batsman.name) {
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              await setDoc(processStateRef, processingState);
              continue;
            }

            try {
              // Process batting points
              const playerId = PointService.createPlayerDocId(batsman.name);
              const battingPoints = PointService.calculateBattingPoints(batsman);
              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                battingPoints,
                {
                  type: 'batting',
                  ...(typeof inningsIndex === 'number' ? { innings: inningsIndex + 1 } : {}),
                  ...batsman
                }
              );

              // Process fielding stats from dismissal
              if (batsman.dismissal) {
                const fielder = PointService.extractFielderFromDismissal(batsman.dismissal, batsman.wicketCode);
                if (fielder) {
                  if (!fieldingPoints.has(fielder.name)) {
                    fieldingPoints.set(fielder.name, {
                      name: fielder.name,
                      catches: 0,
                      stumpings: 0,
                      runouts: 0
                    });
                  }
                  const stats = fieldingPoints.get(fielder.name);
                  switch (fielder.type) {
                    case 'catch': stats.catches++; break;
                    case 'stumping': stats.stumpings++; break;
                    case 'runout': stats.runouts++; break;
                  }
                }
              }

              // Update processing state after each batsman
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing batsman ${batsman.name}:`, error);
              // Still update state so we can continue from next player
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              await setDoc(processStateRef, processingState);
            }
          }

          // Reset batsmen index and move to bowlers
          processingState.currentBatsmenIndex = 0;
          await setDoc(processStateRef, processingState);

          // Process bowling performances
          const bowlers = Object.values(battingTeam.bowlers || {});
          console.log(`Processing ${bowlers.length} bowlers starting from index ${processingState.currentBowlersIndex}`);
          
          // Start from where we left off
          for (let bowlerIndex = processingState.currentBowlersIndex; bowlerIndex < bowlers.length; bowlerIndex++) {
            // Check for timeout before processing each bowler
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, bowler ${bowlerIndex} - will resume here next time`);
              return NextResponse.json({
                success: true,
                message: `Partial processing completed due to timeout - will resume from bowler ${bowlerIndex}`,
                timestamp: new Date().toISOString()
              });
            }
            
            const bowler = bowlers[bowlerIndex];
            if (!bowler.name) {
              processingState.currentBowlersIndex = bowlerIndex + 1;
              await setDoc(processStateRef, processingState);
              continue;
            }

            try {
              const playerId = PointService.createPlayerDocId(bowler.name);
              const bowlingPoints = PointService.calculateBowlingPoints(bowler);
              // Add match played points if this is their first performance in the match
              const matchPlayedPoints = PointService.POINTS.MATCH.PLAYED;
              const totalPoints = bowlingPoints + matchPlayedPoints;

              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                totalPoints, // Include match played points
                {
                  type: 'bowling',
                  ...(typeof inningsIndex === 'number' ? { innings: inningsIndex + 1 } : {}),
                  includesMatchPoints: true, // Flag that match points are included
                  ...bowler
                }
              );

              // Update processing state after each bowler
              processingState.currentBowlersIndex = bowlerIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing bowler ${bowler.name}:`, error);
              // Still update state so we can continue from next player
              processingState.currentBowlersIndex = bowlerIndex + 1;
              await setDoc(processStateRef, processingState);
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
          // Check for timeout before processing fielding
          if (!shouldContinueProcessing()) {
            console.log(`Timing out before fielding processing for match ${matchId} - will resume here next time`);
            return NextResponse.json({
              success: true,
              message: 'Partial processing completed due to timeout - will resume with fielding',
              timestamp: new Date().toISOString()
            });
          }
          
          console.log(`Processing fielding points for ${fieldingPoints.size} players`);
          for (const [fielderName, stats] of fieldingPoints.entries()) {
            // Check for timeout before processing each fielder
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during fielding processing for match ${matchId} - will resume here next time`);
              return NextResponse.json({
                success: true,
                message: 'Partial processing completed due to timeout - will resume with remaining fielding',
                timestamp: new Date().toISOString()
              });
            }
            
            try {
              const playerId = PointService.createPlayerDocId(fielderName);
              const fieldingPts = PointService.calculateFieldingPoints(stats);
              
              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                fieldingPts,
                {
                  type: 'fielding',
                  ...stats
                }
              );
            } catch (error) {
              console.error(`Error processing fielding points for ${fielderName}:`, error);
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

      return NextResponse.json({
        success: true,
        message: 'Match and player data update process completed',
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
