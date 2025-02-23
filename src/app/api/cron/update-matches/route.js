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

export async function GET(request) {
  try {
    const matchesToRestore = ['112395','112413','112409','112402','112420'];
    console.log('Starting match restoration process...');

    try {
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        // Get match data
        const matchQuery = query(matchesRef, where('matchId', '==', matchId));
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);

        // Initialize match processing state if not exists
        if (!matchData.processingState) {
          matchData.processingState = {
            currentInnings: 1,
            currentPlayerIndex: 0,
            fieldingProcessed: false,
            completed: false
          };
        }

        // Skip if already completed
        if (matchData.processingState.completed) {
          console.log(`Match ${matchId} already completed processing`);
          continue;
        }

        // Process both innings
        const innings = [matchData.scorecard.team1, matchData.scorecard.team2];
        
        while (matchData.processingState.currentInnings <= innings.length) {
          const currentInning = innings[matchData.processingState.currentInnings - 1];
          const allPlayers = [
            ...Object.values(currentInning.batsmen),
            ...Object.values(currentInning.bowlers)
          ];

          // Process players sequentially
          while (matchData.processingState.currentPlayerIndex < allPlayers.length) {
            const player = allPlayers[matchData.processingState.currentPlayerIndex];
            if (!player.name) {
              matchData.processingState.currentPlayerIndex++;
              continue;
            }

            try {
              // Process batting points if player is a batsman
              if (currentInning.batsmen.some(b => b.name === player.name)) {
                const battingPoints = PointService.calculateBattingPoints(player);
                await PointService.storePlayerMatchPoints(
                  PointService.createPlayerDocId(player.name),
                  matchId,
                  battingPoints,
                  {
                    type: 'batting',
                    innings: matchData.processingState.currentInnings,
                    ...player
                  }
                );
              }

              // Process bowling points if player is a bowler
              if (currentInning.bowlers.some(b => b.name === player.name)) {
                const bowlingPoints = PointService.calculateBowlingPoints(player);
                await PointService.storePlayerMatchPoints(
                  PointService.createPlayerDocId(player.name),
                  matchId,
                  bowlingPoints,
                  {
                    type: 'bowling',
                    innings: matchData.processingState.currentInnings,
                    ...player
                  }
                );
              }

              matchData.processingState.currentPlayerIndex++;
              
              // Update match processing state after each player
              await setDoc(matchSnapshot.docs[0].ref, matchData, { merge: true });
              
            } catch (error) {
              console.error(`Error processing player ${player.name}:`, error);
              throw error; // Halt processing on error
            }
          }

          // Move to next innings when all players processed
          matchData.processingState.currentInnings++;
          matchData.processingState.currentPlayerIndex = 0;
          await setDoc(matchSnapshot.docs[0].ref, matchData, { merge: true });
        }

        // Process fielding stats after all innings
        if (!matchData.processingState.fieldingProcessed) {
          const fieldingPoints = new Map();

          // Collect fielding stats from both innings
          innings.forEach((inning, inningIndex) => {
            inning.batsmen.forEach(batsman => {
              if (!batsman.dismissal || !batsman.wicketCode) return;

              const fielder = PointService.extractFielderFromDismissal(batsman.dismissal, batsman.wicketCode);
              if (fielder) {
                const fielderId = PointService.createPlayerDocId(fielder.name);
                if (!fieldingPoints.has(fielderId)) {
                  fieldingPoints.set(fielderId, {
                    name: fielder.name,
                    catches: 0,
                    stumpings: 0,
                    runouts: 0
                  });
                }
                const stats = fieldingPoints.get(fielderId);
                switch(fielder.type) {
                  case 'catch': stats.catches++; break;
                  case 'stumping': stats.stumpings++; break;
                  case 'runout': stats.runouts++; break;
                }
              }
            });
          });

          // Process fielding points
          for (const [fielderId, stats] of fieldingPoints.entries()) {
            const fieldingPoints = PointService.calculateFieldingPoints(stats);
            await PointService.storePlayerMatchPoints(
              fielderId,
              matchId,
              fieldingPoints,
              {
                type: 'fielding',
                ...stats
              }
            );
          }

          matchData.processingState.fieldingProcessed = true;
          await setDoc(matchSnapshot.docs[0].ref, matchData, { merge: true });
        }

        // Mark match as completed
        matchData.processingState.completed = true;
        await setDoc(matchSnapshot.docs[0].ref, matchData, { merge: true });

        console.log(`Successfully completed processing match ${matchId}`);
      }

    } catch (restoreError) {
      console.error('Error during match restoration:', restoreError);
      throw restoreError;
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
