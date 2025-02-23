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

export async function GET(request) {
  try {
    const matchesToRestore = ['112395'];
    console.log('Starting match restoration process...');

    try {
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        const matchQuery = query(matchesRef, where('matchId', '==', matchId));
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);

        // Get or initialize processing state
        const processingStateRef = doc(db, 'processingState', matchId);
        const processingState = await getDoc(processingStateRef);
        
        const state = processingState.exists() ? processingState.data() : {
          currentTeam: 1,
          currentInnings: 1,
          currentPlayerIndex: 0,
          fieldingProcessed: false,
          completed: false
        };

        if (state.completed) {
          console.log(`Match ${matchId} already fully processed, skipping...`);
          continue;
        }

        console.log(`Resuming processing from innings ${state.currentInnings}, team ${state.currentTeam}, player ${state.currentPlayerIndex}`);

        // Track fielding contributions
        const fieldingPoints = new Map();
        
        // Process both innings
        const innings = [matchData.scorecard.team1, matchData.scorecard.team2];
        
        // Start from where we left off
        for (let inningsIndex = state.currentInnings - 1; inningsIndex < innings.length; inningsIndex++) {
          const battingTeam = innings[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);

          // Process batting performances first
          const batsmen = Object.values(battingTeam.batsmen);
          for (let playerIndex = inningsIndex === state.currentInnings - 1 ? state.currentPlayerIndex : 0; 
               playerIndex < batsmen.length; 
               playerIndex++) {
            
            const batsman = batsmen[playerIndex];
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

              // Update state after each player
              await setDoc(processingStateRef, {
                currentInnings: inningsIndex + 1,
                currentTeam: state.currentTeam,
                currentPlayerIndex: playerIndex + 1,
                fieldingProcessed: state.fieldingProcessed,
                completed: false
              });

              // Process fielding stats from dismissal
              if (batsman.dismissal) {
                const fielder = PointService.extractFielderFromDismissal(batsman.dismissal, batsman.wicketCode);
                if (fielder) {
                  if (!fieldingPoints.has(fielder.name)) {
                    fieldingPoints.set(fielder.name, {
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

            } catch (error) {
              console.error(`Error processing batsman ${batsman.name}:`, error);
            }
          }

          // Process bowling performances
          const bowlers = Object.values(battingTeam.bowlers);
          for (const bowler of bowlers) {
            if (!bowler.name) continue;

            try {
              // Process bowling points
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
            } catch (error) {
              console.error(`Error processing bowler ${bowler.name}:`, error);
            }
          }
        }

        // Process fielding points if not already done
        if (!state.fieldingProcessed) {
          for (const [playerName, stats] of fieldingPoints.entries()) {
            try {
              const fieldingPoints = PointService.calculateFieldingPoints(stats);
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(playerName),
                matchId,
                fieldingPoints,
                {
                  type: 'fielding',
                  ...stats
                }
              );
            } catch (error) {
              console.error(`Error processing fielding points for ${playerName}:`, error);
            }
          }

          await setDoc(processingStateRef, {
            ...state,
            fieldingProcessed: true
          });
        }

        // Mark match as completed
        await setDoc(processingStateRef, {
          currentInnings: 2,
          currentTeam: 2,
          currentPlayerIndex: 0,
          fieldingProcessed: true,
          completed: true
        });

        console.log(`Successfully completed processing match ${matchId}`);
      }

    } catch (restoreError) {
      console.error('Error during match restoration:', restoreError);
    }

    return NextResponse.json({
      success: true,
      message: 'Match and player data update process completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in cron job:', error);
    return NextResponse.json(
      { error: 'Failed to update match and player data', details: error.message },
      { status: 500 }
    );
  }
}
