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
        // Check if match has already been processed
        const playerPointsRef = collection(db, 'playerPoints');
        const pointsQuery = query(
          playerPointsRef,
          where('matchId', '==', matchId)
        );
        const existingPoints = await getDocs(pointsQuery);

        if (!existingPoints.empty) {
          console.log(`Match ${matchId} already has points calculated, skipping...`);
          continue;
        }

        const matchQuery = query(matchesRef, where('matchId', '==', matchId));
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchData = matchSnapshot.docs[0].data();
        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);

        // Initialize match processing state
        let processingState = matchData.processingState || {
          currentInnings: 1,
          currentPlayerIndex: 0,
          completed: false
        };

        // Process both innings
        const innings = [matchData.scorecard.team1, matchData.scorecard.team2];
        console.log(`Found ${innings.length} innings to process`);
        
        // Track fielding contributions
        const fieldingPoints = new Map();

        for (let inningNum = 0; inningNum < innings.length; inningNum++) {
          const inning = innings[inningNum];
          console.log(`Processing innings ${inningNum + 1}`);

          // Process batting performances
          const batsmen = Object.values(inning?.batTeamDetails?.batsmenData || {});
          console.log(`Processing ${batsmen.length} batsmen`);
          
          for (const batsman of batsmen) {
            if (!batsman.batName) continue;

            try {
              // Process batting points
              const battingPoints = PointService.calculateBattingPoints({
                runs: parseInt(batsman.runs) || 0,
                balls: parseInt(batsman.balls) || 0,
                fours: parseInt(batsman.fours) || 0,
                sixes: parseInt(batsman.sixes) || 0,
                dismissal: batsman.outDesc
              });

              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(batsman.batName),
                matchId,
                battingPoints,
                {
                  type: 'batting',
                  name: batsman.batName,
                  runs: batsman.runs,
                  balls: batsman.balls,
                  fours: batsman.fours,
                  sixes: batsman.sixes
                }
              );

              // Track fielding contributions from dismissals
              if (batsman.outDesc && batsman.wicketCode) {
                const fielder = PointService.extractFielderFromDismissal(batsman.outDesc, batsman.wicketCode);
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
              }

              processingState.currentPlayerIndex++;
            } catch (error) {
              console.error(`Error processing batsman ${batsman.batName}:`, error);
            }
          }

          // Process bowling performances
          const bowlers = Object.values(inning?.bowlTeamDetails?.bowlersData || {});
          console.log(`Processing ${bowlers.length} bowlers`);
          
          for (const bowler of bowlers) {
            if (!bowler.bowlName) continue;

            try {
              const bowlingPoints = PointService.calculateBowlingPoints({
                wickets: parseInt(bowler.wickets) || 0,
                maidens: parseInt(bowler.maidens) || 0,
                bowler_runs: parseInt(bowler.runs) || 0,
                overs: parseFloat(bowler.overs) || 0
              });

              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(bowler.bowlName),
                matchId,
                bowlingPoints,
                {
                  type: 'bowling',
                  name: bowler.bowlName,
                  wickets: bowler.wickets,
                  maidens: bowler.maidens,
                  bowler_runs: bowler.runs,
                  overs: bowler.overs
                }
              );

              processingState.currentPlayerIndex++;
            } catch (error) {
              console.error(`Error processing bowler ${bowler.bowlName}:`, error);
            }
          }

          processingState.currentInnings++;
        }

        // Process fielding points at the end
        console.log(`Processing fielding points for ${fieldingPoints.size} players`);
        for (const [fielderId, stats] of fieldingPoints.entries()) {
          try {
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
          } catch (error) {
            console.error(`Error processing fielding points for ${fielderId}:`, error);
          }
        }

        // Mark match as completed
        processingState.completed = true;
        await setDoc(matchSnapshot.docs[0].ref, {
          ...matchData,
          processingState
        }, { merge: true });

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
