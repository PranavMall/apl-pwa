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

// Convert API scorecard structure to the format expected by PointService
function transformScorecard(apiScorecard) {
  if (!apiScorecard || !apiScorecard.scoreCard || !Array.isArray(apiScorecard.scoreCard) || apiScorecard.scoreCard.length < 2) {
    console.error('Invalid API scorecard structure:', JSON.stringify(apiScorecard).substring(0, 300) + '...');
    return null;
  }

  try {
    // Process team1 (first innings)
    const innings1 = apiScorecard.scoreCard[0];
    // Process team2 (second innings)
    const innings2 = apiScorecard.scoreCard[1];
    
    // Get team info from matchHeader
    const team1Info = apiScorecard.matchHeader?.team1 || {};
    const team2Info = apiScorecard.matchHeader?.team2 || {};

    return {
      matchId: apiScorecard.matchHeader?.matchId || '',
      matchStatus: apiScorecard.matchHeader?.status || '',
      result: apiScorecard.matchHeader?.result?.resultType || '',
      toss: apiScorecard.matchHeader?.tossResults?.decision || '',
      playerOfMatch: apiScorecard.matchHeader?.playersOfTheMatch?.[0]?.name || '',
      team1: processBattingInnings(innings1, team1Info),
      team2: processBattingInnings(innings2, team2Info)
    };
  } catch (error) {
    console.error('Error transforming scorecard:', error);
    return null;
  }
}

function processBattingInnings(innings, teamInfo) {
  if (!innings) return null;

  // Extract batsmen data
  const batsmen = [];
  if (innings.batTeamDetails?.batsmenData) {
    // Convert batsmen data from object to array
    for (const key in innings.batTeamDetails.batsmenData) {
      const batsman = innings.batTeamDetails.batsmenData[key];
      
      batsmen.push({
        name: batsman.batName,
        runs: batsman.runs || 0,
        balls: batsman.balls || 0,
        fours: batsman.fours || 0,
        sixes: batsman.sixes || 0,
        strikeRate: batsman.strikeRate || 0,
        dismissal: batsman.outDesc || '',
        wicketCode: batsman.wicketCode || '',
        isCaptain: batsman.isCaptain || false,
        isKeeper: batsman.isKeeper || false
      });
    }
  }

  // Extract bowlers data
  const bowlers = [];
  if (innings.bowlTeamDetails?.bowlersData) {
    // Convert bowlers data from object to array
    for (const key in innings.bowlTeamDetails.bowlersData) {
      const bowler = innings.bowlTeamDetails.bowlersData[key];
      
      bowlers.push({
        name: bowler.bowlName,
        overs: bowler.overs || 0,
        maidens: bowler.maidens || 0,
        runs: bowler.runs || 0,
        wickets: bowler.wickets || 0,
        economy: bowler.economy || 0,
        isCaptain: bowler.isCaptain || false
      });
    }
  }

  return {
    teamId: innings.batTeamDetails?.batTeamId || (teamInfo?.id || ''),
    teamName: innings.batTeamDetails?.batTeamName || (teamInfo?.name || ''),
    teamShortName: innings.batTeamDetails?.batTeamShortName || (teamInfo?.shortName || ''),
    score: innings.scoreDetails ? `${innings.scoreDetails.runs}/${innings.scoreDetails.wickets}` : '0/0',
    overs: innings.scoreDetails?.overs?.toString() || '0',
    runRate: innings.scoreDetails?.runRate?.toString() || '0',
    batsmen: batsmen,
    bowlers: bowlers,
    extras: innings.extrasData || {}
  };
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
    
    // Test with a specific set of match IDs
    const matchesToProcess = ['112395', '112413', '112409', '112402', '112420', '112427', '112430', '112437']; // Add your match IDs here
    
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
          console.log(`Match ${matchId} not found in database`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName || 'Team1'} vs ${matchData.matchInfo?.team2?.teamName || 'Team2'}`);
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

        // Transform the scorecard if needed
        let processedScorecard = matchData.scorecard;
        
        // Check if the scorecard is in API format and needs transformation
        if (processedScorecard && processedScorecard.scoreCard && Array.isArray(processedScorecard.scoreCard)) {
          console.log('Transforming API format scorecard to expected structure');
          processedScorecard = transformScorecard(processedScorecard);
          
          // If transformation failed, skip this match
          if (!processedScorecard) {
            console.error(`Failed to transform scorecard for match ${matchId}, skipping...`);
            continue;
          }
        }
        
        // Validate the scorecard structure
        if (!processedScorecard || !processedScorecard.team1 || !processedScorecard.team2) {
          console.error(`Invalid scorecard structure for match ${matchId}`, JSON.stringify(processedScorecard).substring(0, 200));
          processingState.error = 'Invalid scorecard structure';
          await setDoc(processStateRef, processingState);
          continue;
        }

        // Track fielding contributions for this match
        const fieldingPoints = new Map();

        // Use the same structure as your working code
        const innings = [processedScorecard.team1, processedScorecard.team2];
        console.log(`Found ${innings.length} innings to process`);
        
        // Process only remaining innings based on processing state
        for (let inningsIndex = processingState.currentInnings; inningsIndex < innings.length; inningsIndex++) {
          // Check for timeout before starting each innings
          if (!shouldContinueProcessing()) {
            console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1} - will resume here next time`);
            processingState.currentInnings = inningsIndex;
            await setDoc(processStateRef, processingState);
            return NextResponse.json({
              success: true,
              message: 'Partial processing completed due to timeout - will resume from current innings',
              timestamp: new Date().toISOString()
            });
          }
          
          const team = innings[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);

          // Process batting performances first
          const batsmen = Array.isArray(team.batsmen) ? team.batsmen : [];
          console.log(`Processing ${batsmen.length} batsmen starting from index ${processingState.currentBatsmenIndex}`);
          
          // Start from where we left off
          for (let batsmanIndex = processingState.currentBatsmenIndex; batsmanIndex < batsmen.length; batsmanIndex++) {
            // Check for timeout before processing each player
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, batsman ${batsmanIndex} - will resume here next time`);
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
            if (!batsman.name) {
              console.log(`Skipping batsman at index ${batsmanIndex} - no name`);
              continue;
            }

            try {
              console.log(`Processing batsman: ${batsman.name}`);
              
              // Process batting points
              const playerId = PointService.createPlayerDocId(batsman.name);
              const battingPoints = PointService.calculateBattingPoints({
                runs: parseInt(batsman.runs) || 0,
                balls: parseInt(batsman.balls) || 0,
                fours: parseInt(batsman.fours) || 0,
                sixes: parseInt(batsman.sixes) || 0,
                dismissal: batsman.dismissal || ''
              });

              await PointService.storePlayerMatchPoints(
                playerId,
                matchId,
                battingPoints,
                {
                  type: 'batting',
                  innings: inningsIndex + 1,
                  name: batsman.name,
                  runs: batsman.runs,
                  balls: batsman.balls,
                  fours: batsman.fours,
                  sixes: batsman.sixes
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

              console.log(`Successfully processed batsman: ${batsman.name}`);
            } catch (error) {
              console.error(`Error processing batsman ${batsman.name}:`, error);
            }
          }

          // Reset batsmen index
          processingState.currentBatsmenIndex = 0;
          await setDoc(processStateRef, processingState);

          // Process bowling performances
          const bowlers = Array.isArray(team.bowlers) ? team.bowlers : [];
          console.log(`Processing ${bowlers.length} bowlers starting from index ${processingState.currentBowlersIndex}`);
          
          // Start from where we left off
          for (let bowlerIndex = processingState.currentBowlersIndex; bowlerIndex < bowlers.length; bowlerIndex++) {
            // Check for timeout before processing each bowler
            if (!shouldContinueProcessing()) {
              console.log(`Timing out during match ${matchId}, innings ${inningsIndex + 1}, bowler ${bowlerIndex} - will resume here next time`);
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
            if (!bowler.name) {
              console.log(`Skipping bowler at index ${bowlerIndex} - no name`);
              continue;
            }

            try {
              console.log(`Processing bowler: ${bowler.name}`);
              
              const playerId = PointService.createPlayerDocId(bowler.name);
              
              // Calculate bowling points
              const bowlingPoints = PointService.calculateBowlingPoints({
                wickets: parseInt(bowler.wickets) || 0,
                maidens: parseInt(bowler.maidens) || 0,
                runs: parseInt(bowler.runs) || 0,
                overs: parseFloat(bowler.overs) || 0
              });
              
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
                  includesMatchPoints: true,
                  name: bowler.name,
                  wickets: bowler.wickets,
                  maidens: bowler.maidens,
                  runs: bowler.runs,
                  overs: bowler.overs
                }
              );

              console.log(`Successfully processed bowler: ${bowler.name}`);
            } catch (error) {
              console.error(`Error processing bowler ${bowler.name}:`, error);
            }
          }

          // Update state to move to next innings
          processingState.currentInnings = inningsIndex + 1;
          processingState.currentBowlersIndex = 0;
          await setDoc(processStateRef, processingState);
        }

        // Process fielding if not already done
        if (!processingState.fieldingProcessed) {
          // Check for timeout before processing fielding
          if (!shouldContinueProcessing()) {
            console.log(`Timing out before fielding processing for match ${matchId} - will resume here next time`);
            processingState.currentInnings = innings.length; // Mark that all innings are processed
            await setDoc(processStateRef, processingState);
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
              processingState.currentInnings = innings.length; // Mark that all innings are processed
              await setDoc(processStateRef, processingState);
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
      console.error('Error during match processing:', restoreError);
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
