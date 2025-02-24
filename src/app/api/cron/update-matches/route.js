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
import { db } from '../../../../firebase';

const TIMEOUT_MARGIN = 8000; // 8 seconds
const startTime = Date.now();

function shouldContinueProcessing() {
  return Date.now() - startTime < TIMEOUT_MARGIN;
}

export async function GET(request) {
  try {
    const matchesToRestore = ['112395','112413','112409','112402','112420'];
    console.log('Starting match restoration process...');

    const processingStatesRef = collection(db, 'processingState');

    try {
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        if (!shouldContinueProcessing()) {
          console.log('Approaching timeout limit, stopping gracefully...');
          return NextResponse.json({
            success: true,
            message: 'Partial processing completed - hit timeout limit',
            timestamp: new Date().toISOString()
          });
        }

        // Get match data first
        const matchQuery = query(matchesRef, where('matchId', '==', matchId));
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        
        // Debug the match data structure
        console.log(`Match data structure for ${matchId}:`, Object.keys(matchData));
        
        // Look for scorecard in different possible locations
        let scorecard;
        if (matchData.scorecard && Array.isArray(matchData.scorecard)) {
          scorecard = matchData.scorecard;
          console.log('Found scorecard (lowercase)');
        } else if (matchData.scoreCard && Array.isArray(matchData.scoreCard)) {
          scorecard = matchData.scoreCard;
          console.log('Found scoreCard (uppercase C)');
        } else if (matchData.scorecard?.scoreCard && Array.isArray(matchData.scorecard.scoreCard)) {
          // Handle nested structure
          scorecard = matchData.scorecard.scoreCard;
          console.log('Found nested scorecard.scoreCard');
        } else if (matchData.scoreCard?.scoreCard && Array.isArray(matchData.scoreCard.scoreCard)) {
          scorecard = matchData.scoreCard.scoreCard;
          console.log('Found nested scoreCard.scoreCard');
        } else {
          // Try to find any array that might be the scorecard
          for (const key of Object.keys(matchData)) {
            if (Array.isArray(matchData[key])) {
              console.log(`Found array at key: ${key}`);
              if (matchData[key].length > 0 && 
                  (matchData[key][0].batTeamDetails || matchData[key][0].inningsId)) {
                scorecard = matchData[key];
                console.log(`Using array at key: ${key} as scorecard`);
                break;
              }
            }
          }
        }

        if (!scorecard) {
          console.error(`Could not find valid scorecard for match ${matchId}`);
          continue;
        }

        console.log(`Found ${scorecard.length} innings in match ${matchId}`);

        // Examine first innings structure
        if (scorecard.length > 0) {
          console.log(`First innings structure:`, Object.keys(scorecard[0]));
          if (scorecard[0].batTeamDetails) {
            console.log(`batTeamDetails keys:`, Object.keys(scorecard[0].batTeamDetails));
          }
        }

        // Get or create processing state
        const processStateRef = doc(processingStatesRef, matchId);
        const processStateDoc = await getDoc(processStateRef);
        let processingState = processStateDoc.exists() 
          ? processStateDoc.data() 
          : {
              currentInnings: 0,
              currentPlayerIndex: 0,
              fieldingProcessed: false,
              completed: false,
              lastProcessedTime: null,
              matchStatus: 'pending'
            };

        if (processingState.matchStatus === 'completed') {
          console.log(`Match ${matchId} already completed, skipping...`);
          continue;
        }

        // Mark as in progress
        if (processingState.matchStatus === 'pending') {
          processingState.matchStatus = 'in_progress';
          await setDoc(processStateRef, processingState);
        }

        // Process innings
        while (processingState.currentInnings < scorecard.length && shouldContinueProcessing()) {
          const inning = scorecard[processingState.currentInnings];
          
          // Verify innings data structure
          if (!inning.batTeamDetails?.batsmenData && !inning.batTeamDetails?.batsmen) {
            console.error(`Invalid innings data structure for innings ${processingState.currentInnings}`);
            processingState.currentInnings++;
            continue;
          }

          // Try to find batsmen and bowlers in different possible locations
          const batsmen = inning.batTeamDetails.batsmenData 
            ? Object.values(inning.batTeamDetails.batsmenData)
            : (inning.batTeamDetails.batsmen 
                ? Object.values(inning.batTeamDetails.batsmen) 
                : []);

          const bowlers = inning.bowlTeamDetails.bowlersData 
            ? Object.values(inning.bowlTeamDetails.bowlersData) 
            : (inning.bowlTeamDetails.bowlers 
                ? Object.values(inning.bowlTeamDetails.bowlers) 
                : []);

          const allPlayers = [...batsmen, ...bowlers];

          console.log(`Innings ${processingState.currentInnings + 1}: Found ${batsmen.length} batsmen and ${bowlers.length} bowlers`);

          while (processingState.currentPlayerIndex < allPlayers.length && shouldContinueProcessing()) {
            const player = allPlayers[processingState.currentPlayerIndex];
            
            try {
              // Process batter (check for different possible ID fields)
              const isBatsman = player.batId || player.batName || player.name;
              const playerName = player.batName || player.name;
              
              if (isBatsman && playerName) {
                const battingPoints = PointService.calculateBattingPoints({
                  runs: parseInt(player.runs) || 0,
                  balls: parseInt(player.balls) || 0,
                  fours: parseInt(player.fours) || 0,
                  sixes: parseInt(player.sixes) || 0,
                  dismissal: player.outDesc || player.dismissal
                });

                await PointService.storePlayerMatchPoints(
                  PointService.createPlayerDocId(playerName),
                  matchId,
                  battingPoints,
                  {
                    type: 'batting',
                    name: playerName,
                    runs: player.runs,
                    balls: player.balls,
                    fours: player.fours,
                    sixes: player.sixes
                  }
                );
              }

              // Process bowler (check for different possible ID fields)
              const isBowler = player.bowlId || player.bowlName || (player.overs !== undefined);
              const bowlerName = player.bowlName || player.name;
              
              if (isBowler && bowlerName) {
                const bowlingPoints = PointService.calculateBowlingPoints({
                  wickets: parseInt(player.wickets) || 0,
                  maidens: parseInt(player.maidens) || 0,
                  bowler_runs: parseInt(player.runs) || 0,
                  overs: parseFloat(player.overs) || 0
                });

                await PointService.storePlayerMatchPoints(
                  PointService.createPlayerDocId(bowlerName),
                  matchId,
                  bowlingPoints,
                  {
                    type: 'bowling',
                    name: bowlerName,
                    wickets: player.wickets,
                    maidens: player.maidens,
                    bowler_runs: player.runs,
                    overs: player.overs
                  }
                );
              }

              processingState.currentPlayerIndex++;
              processingState.lastProcessedTime = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing player:`, error);
              await setDoc(processStateRef, processingState);
              throw error;
            }
          }

          if (processingState.currentPlayerIndex >= allPlayers.length) {
            processingState.currentInnings++;
            processingState.currentPlayerIndex = 0;
            await setDoc(processStateRef, processingState);
          }
        }

        // Process fielding if all innings are complete
        if (!processingState.fieldingProcessed && 
            processingState.currentInnings >= scorecard.length && 
            shouldContinueProcessing()) {
          
          const fieldingPoints = new Map();

          // Process all dismissals
          scorecard.forEach(inning => {
            const batsmen = inning.batTeamDetails.batsmenData 
              ? Object.values(inning.batTeamDetails.batsmenData)
              : (inning.batTeamDetails.batsmen 
                  ? Object.values(inning.batTeamDetails.batsmen) 
                  : []);
                  
            batsmen.forEach(batsman => {
              const dismissal = batsman.outDesc || batsman.dismissal;
              const wicketCode = batsman.wicketCode;
              
              if (!dismissal || !wicketCode) return;

              const fielder = PointService.extractFielderFromDismissal(dismissal, wicketCode);
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
                switch(fielder.type) {
                  case 'catch': stats.catches++; break;
                  case 'stumping': stats.stumpings++; break;
                  case 'runout': stats.runouts++; break;
                }
              }
            });
          });

          console.log(`Processing fielding points for ${fieldingPoints.size} players`);
          for (const [fielderName, stats] of fieldingPoints.entries()) {
            if (!shouldContinueProcessing()) {
              console.log('Timeout approaching during fielding processing, will resume in next run');
              return NextResponse.json({
                success: true,
                message: 'Partial processing completed - hit timeout during fielding',
                timestamp: new Date().toISOString()
              });
            }

            const fieldingPoints = PointService.calculateFieldingPoints(stats);
            await PointService.storePlayerMatchPoints(
              PointService.createPlayerDocId(fielderName),
              matchId,
              fieldingPoints,
              {
                type: 'fielding',
                ...stats
              }
            );
          }

          processingState.fieldingProcessed = true;
          await setDoc(processStateRef, processingState);
        }

        // Mark match as completed if everything is done
        if (processingState.currentInnings >= scorecard.length && 
            processingState.fieldingProcessed) {
          processingState.matchStatus = 'completed';
          processingState.completed = true;
          await setDoc(processStateRef, processingState);
          console.log(`Successfully completed processing match ${matchId}`);
        }
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
