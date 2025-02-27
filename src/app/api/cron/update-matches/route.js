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
const startTime = Date.now();

function shouldContinueProcessing() {
  const elapsed = Date.now() - startTime;
  const shouldContinue = elapsed < TIMEOUT_MARGIN;
  
  if (!shouldContinue) {
    console.log(`Approaching timeout after ${elapsed}ms, will gracefully stop processing`);
  }
  
  return shouldContinue;
}

// Helper function to transform scorecard from API format if needed
function transformApiScorecard(apiScorecard) {
  if (!apiScorecard || !apiScorecard.scoreCard || !Array.isArray(apiScorecard.scoreCard)) {
    return null;
  }

  try {
    const transformedScorecard = {
      matchId: apiScorecard.matchHeader?.matchId,
      matchStatus: apiScorecard.matchHeader?.status || '',
      result: apiScorecard.matchHeader?.result?.resultType || '',
      team1: {},
      team2: {}
    };
    
    // Process first innings (team1)
    if (apiScorecard.scoreCard[0]) {
      const innings1 = apiScorecard.scoreCard[0];
      transformedScorecard.team1 = {
        teamId: innings1.batTeamDetails?.batTeamId,
        teamName: innings1.batTeamDetails?.batTeamName,
        teamShortName: innings1.batTeamDetails?.batTeamShortName,
        batsmen: innings1.batTeamDetails?.batsmenData || {},
        bowlers: innings1.bowlTeamDetails?.bowlersData || {},
        score: `${innings1.scoreDetails?.runs || 0}/${innings1.scoreDetails?.wickets || 0}`,
        overs: innings1.scoreDetails?.overs?.toString() || '0',
        runRate: innings1.scoreDetails?.runRate?.toString() || '0'
      };
    }
    
    // Process second innings (team2)
    if (apiScorecard.scoreCard[1]) {
      const innings2 = apiScorecard.scoreCard[1];
      transformedScorecard.team2 = {
        teamId: innings2.batTeamDetails?.batTeamId,
        teamName: innings2.batTeamDetails?.batTeamName,
        teamShortName: innings2.batTeamDetails?.batTeamShortName,
        batsmen: innings2.batTeamDetails?.batsmenData || {},
        bowlers: innings2.bowlTeamDetails?.bowlersData || {},
        score: `${innings2.scoreDetails?.runs || 0}/${innings2.scoreDetails?.wickets || 0}`,
        overs: innings2.scoreDetails?.overs?.toString() || '0',
        runRate: innings2.scoreDetails?.runRate?.toString() || '0'
      };
    }
    
    return transformedScorecard;
  } catch (error) {
    console.error('Error transforming API scorecard:', error);
    return null;
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const syncMatches = url.searchParams.get('sync') === 'true';
    
    // First, sync match data from the API to get the latest matches
    // Only do this if specifically requested and we have plenty of time
    if (syncMatches && shouldContinueProcessing()) {
      console.log('Starting match data sync...');
      await cricketService.syncMatchData();
    }
    
    // Process these specific matches
    const matchesToProcess = ['112395', '112413', '112409', '112402', '112420', '112427', '112430', '112437']; // ICC Match IDS
    console.log('Starting match processing...');

    const processingStatesRef = collection(db, 'processingState');

    try {
      const matchesRef = collection(db, 'matches');
      
      // Process matches one by one
      for (const matchId of matchesToProcess) {
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

        // Get scorecard, transforming if necessary
        let scorecard = matchData.scorecard;
        
        // Check if we need to transform the scorecard (it's in API format)
        if (scorecard && scorecard.scoreCard && Array.isArray(scorecard.scoreCard)) {
          console.log('Scorecard is in API format, transforming...');
          scorecard = transformApiScorecard(scorecard);
          
          if (!scorecard) {
            console.error('Failed to transform scorecard, skipping match');
            processingState.error = 'Failed to transform scorecard';
            await setDoc(processStateRef, processingState);
            continue;
          }
        }
        
        // Validate scorecard structure
        if (!scorecard || !scorecard.team1 || !scorecard.team2) {
          console.error('Invalid scorecard structure:', JSON.stringify(scorecard).substring(0, 300));
          processingState.error = 'Invalid scorecard structure';
          await setDoc(processStateRef, processingState);
          continue;
        }

        // Track fielding contributions for this match
        const fieldingPoints = new Map();
        
        // Use the same structure as your working code
        const innings = [scorecard.team1, scorecard.team2];
        console.log(`Found ${innings.length} innings to process`);
        
        // Process only remaining innings based on processing state
        for (let inningsIndex = processingState.currentInnings; inningsIndex < innings.length; inningsIndex++) {
          // Check for timeout before starting each innings
          if (!shouldContinueProcessing()) {
            console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}`);
            return NextResponse.json({
              success: true,
              message: 'Partial processing completed due to timeout - will resume from current innings',
              timestamp: new Date().toISOString()
            });
          }
          
          const battingTeam = innings[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);

          // Process batting performances first
          if (!battingTeam.batsmen) {
            console.log(`No batsmen data for innings ${inningsIndex + 1}, skipping...`);
            continue;
          }
          
          const batsmen = Object.values(battingTeam.batsmen);
          console.log(`Processing ${batsmen.length} batsmen starting from index ${processingState.currentBatsmenIndex}`);
          
          // Start from where we left off
          for (let batsmanIndex = processingState.currentBatsmenIndex; batsmanIndex < batsmen.length; batsmanIndex++) {
            // Check for timeout before processing each player
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, batsman ${batsmanIndex}`);
              processingState.currentBatsmenIndex = batsmanIndex;
              processingState.currentInnings = inningsIndex;
              await setDoc(processStateRef, processingState);
              return NextResponse.json({
                success: true,
                message: `Partial processing completed due to timeout - will resume from batsman ${batsmanIndex}`,
                timestamp: new Date().toISOString()
              });
            }
            
            const batsman = batsmen[batsmanIndex];
            // Skip if no name or batName property (depending on the format)
            const batsmanName = batsman.name || batsman.batName;
            if (!batsmanName) {
              console.log(`No name for batsman at index ${batsmanIndex}, skipping...`);
              continue;
            }

            try {
              console.log(`Processing batsman: ${batsmanName}`);
              
              // We need to convert the API format batsman to our expected format
              const formattedBatsman = {
                name: batsmanName,
                runs: batsman.runs || 0,
                balls: batsman.balls || 0,
                fours: batsman.fours || 0,
                sixes: batsman.sixes || 0,
                dismissal: batsman.outDesc || batsman.dismissal || '',
                wicketCode: batsman.wicketCode || ''
              };
              
              // Process batting points
              const playerId = PointService.createPlayerDocId(formattedBatsman.name);
              const battingPoints = PointService.calculateBattingPoints(formattedBatsman);
              
              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                battingPoints,
                {
                  type: 'batting',
                  innings: inningsIndex + 1,
                  name: formattedBatsman.name,
                  runs: formattedBatsman.runs,
                  balls: formattedBatsman.balls,
                  fours: formattedBatsman.fours,
                  sixes: formattedBatsman.sixes
                }
              );

              // Process fielding stats from dismissal
              if (formattedBatsman.dismissal) {
                const fielder = PointService.extractFielderFromDismissal(
                  formattedBatsman.dismissal, 
                  formattedBatsman.wicketCode
                );
                
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
              
              console.log(`Successfully processed batsman: ${formattedBatsman.name}`);
            } catch (error) {
              console.error(`Error processing batsman ${batsmanName}:`, error);
              // Still update state so we can continue from next player
              processingState.currentBatsmenIndex = batsmanIndex + 1;
              await setDoc(processStateRef, processingState);
            }
          }

          // Reset batsmen index and move to bowlers
          processingState.currentBatsmenIndex = 0;
          await setDoc(processStateRef, processingState);

          // Process bowling performances
          if (!battingTeam.bowlers) {
            console.log(`No bowlers data for innings ${inningsIndex + 1}, skipping...`);
            continue;
          }
          
          const bowlers = Object.values(battingTeam.bowlers);
          console.log(`Processing ${bowlers.length} bowlers starting from index ${processingState.currentBowlersIndex}`);
          
          // Start from where we left off
          for (let bowlerIndex = processingState.currentBowlersIndex; bowlerIndex < bowlers.length; bowlerIndex++) {
            // Check for timeout before processing each bowler
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, bowler ${bowlerIndex}`);
              processingState.currentBowlersIndex = bowlerIndex;
              processingState.currentInnings = inningsIndex;
              await setDoc(processStateRef, processingState);
              return NextResponse.json({
                success: true,
                message: `Partial processing completed due to timeout - will resume from bowler ${bowlerIndex}`,
                timestamp: new Date().toISOString()
              });
            }
            
            const bowler = bowlers[bowlerIndex];
            // Skip if no name or bowlName property (depending on the format)
            const bowlerName = bowler.name || bowler.bowlName;
            if (!bowlerName) {
              console.log(`No name for bowler at index ${bowlerIndex}, skipping...`);
              continue;
            }

            try {
              console.log(`Processing bowler: ${bowlerName}`);
              
              // We need to convert the API format bowler to our expected format
              const formattedBowler = {
                name: bowlerName,
                overs: bowler.overs || 0,
                maidens: bowler.maidens || 0,
                runs: bowler.runs || 0,
                wickets: bowler.wickets || 0,
                economy: bowler.economy || 0
              };
              
              const playerId = PointService.createPlayerDocId(formattedBowler.name);
              const bowlingPoints = PointService.calculateBowlingPoints(formattedBowler);
              
              // Add match played points if this is their first performance in the match
              const matchPlayedPoints = PointService.POINTS.MATCH.PLAYED;
              const totalPoints = bowlingPoints + matchPlayedPoints;

              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                totalPoints,
                {
                  type: 'bowling',
                  innings: inningsIndex + 1,
                  includesMatchPoints: true, // Flag that match points are included
                  name: formattedBowler.name,
                  wickets: formattedBowler.wickets,
                  maidens: formattedBowler.maidens,
                  runs: formattedBowler.runs,
                  overs: formattedBowler.overs
                }
              );

              // Update processing state after each bowler
              processingState.currentBowlersIndex = bowlerIndex + 1;
              await setDoc(processStateRef, processingState);
              
              console.log(`Successfully processed bowler: ${formattedBowler.name}`);
            } catch (error) {
              console.error(`Error processing bowler ${bowlerName}:`, error);
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
            console.log(`Timing out before fielding processing for match ${matchId}`);
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
              console.log(`Timing out during fielding processing for match ${matchId}`);
              return NextResponse.json({
                success: true,
                message: 'Partial processing completed due to timeout - will resume with remaining fielding',
                timestamp: new Date().toISOString()
              });
            }
            
            try {
              console.log(`Processing fielding for: ${fielderName}`);
              
              const playerId = PointService.createPlayerDocId(fielderName);
              const fieldingPts = PointService.calculateFieldingPoints(stats);
              
              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                fieldingPts,
                {
                  type: 'fielding',
                  name: fielderName,
                  ...stats
                }
              );

              console.log(`Successfully processed fielding for: ${fielderName}`);
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
