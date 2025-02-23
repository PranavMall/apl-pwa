// app/api/cron/update-matches/route.js

import { cricketService } from '@/app/services/cricketService';
import { PointService } from '@/app/services/pointService';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // First restore the specific matches
    const matchesToRestore = ['112395']; // Add your match IDs here
    console.log('Starting match restoration process...');

    try {
      // First try to restore specific matches
      console.log('Restoring matches:', matchesToRestore);
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        // Get match data
        const matchQuery = query(
          matchesRef,
          where('matchId', '==', matchId)
        );
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);

        // Get processing state from previous run
        const processingStateRef = doc(db, 'processingState', matchId);
        const processingState = await getDoc(processingStateRef);
        
        const state = processingState.exists() ? processingState.data() : {
          currentTeam: 1, // 1 or 2 for team1/team2
          currentPlayerIndex: 0,
          completed: false
        };

        if (state.completed) {
          console.log(`Match ${matchId} already fully processed, skipping...`);
          continue;
        }

        console.log(`Resuming processing from team ${state.currentTeam}, player ${state.currentPlayerIndex}`);

        // Process teams
        const teams = [matchData.scorecard.team1, matchData.scorecard.team2];
        
        // Start from where we left off
        for (let teamIndex = state.currentTeam - 1; teamIndex < teams.length; teamIndex++) {
          const team = teams[teamIndex];
          
          // Process batting
          const batsmen = Object.values(team.batsmen);
          for (let playerIndex = teamIndex === state.currentTeam - 1 ? state.currentPlayerIndex : 0; 
               playerIndex < batsmen.length; 
               playerIndex++) {
            
            const batsman = batsmen[playerIndex];
            if (!batsman.name) continue;

            try {
              // Calculate and store batting points
              const points = PointService.calculateBattingPoints(batsman);
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(batsman.name),
                matchId,
                points,
                {
                  type: 'batting',
                  ...batsman
                }
              );

              // Update processing state
              await setDoc(processingStateRef, {
                currentTeam: teamIndex + 1,
                currentPlayerIndex: playerIndex + 1,
                completed: false
              });

            } catch (error) {
              console.error(`Error processing batsman ${batsman.name}:`, error);
            }
          }

          // Process bowling
          const bowlers = Object.values(team.bowlers);
          for (const bowler of bowlers) {
            if (!bowler.name) continue;

            try {
              // Calculate and store bowling points
              const points = PointService.calculateBowlingPoints(bowler);
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(bowler.name),
                matchId,
                points,
                {
                  type: 'bowling',
                  ...bowler
                }
              );
            } catch (error) {
              console.error(`Error processing bowler ${bowler.name}:`, error);
            }
          }
        }

        // Mark match as completed
        await setDoc(processingStateRef, {
          currentTeam: 2,
          currentPlayerIndex: 0,
          completed: true
        });

        console.log(`Successfully completed processing match ${matchId}`);
      }

    } catch (restoreError) {
      console.error('Error during match restoration:', restoreError);
    }

    // Proceed with regular sync
    console.log('Starting regular sync process...');
    const result = await cricketService.syncMatchData();
    
    return NextResponse.json({
      success: true,
      message: 'Match and player data update process completed',
      timestamp: new Date().toISOString(),
      results: result
    });
  } catch (error) {
    console.error('Error in cron job:', {
      message: error.message,
      stack: error.stack
    });
    
    return NextResponse.json(
      { error: 'Failed to update match and player data', details: error.message },
      { status: 500 }
    );
  }
}
