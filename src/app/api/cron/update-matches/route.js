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

// Set a safety margin before Vercel's 10s timeout
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
      
      // Process matches one by one
      for (const matchId of matchesToRestore) {
        if (!shouldContinueProcessing()) {
          console.log('Approaching timeout limit, stopping gracefully...');
          return NextResponse.json({
            success: true,
            message: 'Partial processing completed - hit timeout limit',
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
              currentPlayerIndex: 0,
              fieldingProcessed: false,
              completed: false,
              lastProcessedTime: null,
              matchStatus: 'pending' // pending, in_progress, completed
            };

        // Skip if match is already completed
        if (processingState.matchStatus === 'completed') {
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
        const scoreCard = matchData.scoreCard;

        console.log(`Processing match ${matchId} - Innings ${processingState.currentInnings + 1}, Player ${processingState.currentPlayerIndex}`);

        // Mark match as in progress
        if (processingState.matchStatus === 'pending') {
          processingState.matchStatus = 'in_progress';
          await setDoc(processStateRef, processingState);
        }

        // Process innings
        while (processingState.currentInnings < scoreCard.length && shouldContinueProcessing()) {
          const inning = scoreCard[processingState.currentInnings];
          
          // Get all batsmen and bowlers for this innings
          const batsmen = Object.values(inning.batTeamDetails.batsmenData || {});
          const bowlers = Object.values(inning.bowlTeamDetails.bowlersData || {});
          const allPlayers = [...batsmen, ...bowlers];

          console.log(`Innings ${processingState.currentInnings + 1}: Processing ${allPlayers.length} players from index ${processingState.currentPlayerIndex}`);

          // Process players sequentially
          while (processingState.currentPlayerIndex < allPlayers.length && shouldContinueProcessing()) {
            const player = allPlayers[processingState.currentPlayerIndex];
            
            try {
              // Process batting
              if (player.batId) {
                const battingPoints = PointService.calculateBattingPoints({
                  runs: parseInt(player.runs) || 0,
                  balls: parseInt(player.balls) || 0,
                  fours: parseInt(player.fours) || 0,
                  sixes: parseInt(player.sixes) || 0,
                  dismissal: player.outDesc
                });

                await PointService.storePlayerMatchPoints(
                  player.batId.toString(),
                  matchId,
                  battingPoints,
                  {
                    type: 'batting',
                    name: player.batName,
                    runs: player.runs,
                    balls: player.balls,
                    fours: player.fours,
                    sixes: player.sixes
                  }
                );
              }

              // Process bowling
              if (player.bowlId) {
                const bowlingPoints = PointService.calculateBowlingPoints({
                  wickets: parseInt(player.wickets) || 0,
                  maidens: parseInt(player.maidens) || 0,
                  bowler_runs: parseInt(player.runs) || 0,
                  overs: parseFloat(player.overs) || 0
                });

                await PointService.storePlayerMatchPoints(
                  player.bowlId.toString(),
                  matchId,
                  bowlingPoints,
                  {
                    type: 'bowling',
                    name: player.bowlName,
                    wickets: player.wickets,
                    maidens: player.maidens,
                    bowler_runs: player.runs,
                    overs: player.overs
                  }
                );
              }

              // Update processing state after each player
              processingState.currentPlayerIndex++;
              processingState.lastProcessedTime = new Date().toISOString();
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing player:`, error);
              // Save state before throwing error
              await setDoc(processStateRef, processingState);
              throw error;
            }
          }

          // Move to next innings if all players in current innings are processed
          if (processingState.currentPlayerIndex >= allPlayers.length) {
            processingState.currentInnings++;
            processingState.currentPlayerIndex = 0;
            await setDoc(processStateRef, processingState);
          }
        }

        // Process fielding if all innings are complete and time permits
        if (!processingState.fieldingProcessed && 
            processingState.currentInnings >= scoreCard.length && 
            shouldContinueProcessing()) {
          
          const fieldingPoints = new Map();

          // Process dismissals from all innings
          scoreCard.forEach(inning => {
            Object.values(inning.batTeamDetails.batsmenData || {}).forEach(batsman => {
              if (!batsman.outDesc || !batsman.wicketCode) return;

              const fielder = PointService.extractFielderFromDismissal(batsman.outDesc, batsman.wicketCode);
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

          // Process fielding points
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

        // Mark match as completed if all processing is done
        if (processingState.currentInnings >= scoreCard.length && 
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
