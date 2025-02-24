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
    const matchesToRestore = ['112395','112413','112409','112402','112420']; // Add all your match IDs
    console.log('Starting match restoration process...');

    const processingStatesRef = collection(db, 'processingState');

    try {
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        // Get processing state
        const processStateRef = doc(processingStatesRef, matchId);
        const processStateDoc = await getDoc(processStateRef);
        let processingState = processStateDoc.exists() 
          ? processStateDoc.data() 
          : {
              currentInnings: 0,
              currentPlayerIndex: 0,
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

        // Track fielding contributions
        const fieldingPoints = new Map();

        // Get scoreCard array
        const scoreCard = matchData.scoreCard;
        if (!scoreCard || !Array.isArray(scoreCard)) {
          console.log(`No scoreCard found for match ${matchId}`);
          continue;
        }

        // Process only remaining innings based on processing state
        for (let inningsIndex = processingState.currentInnings; inningsIndex < scoreCard.length; inningsIndex++) {
          const inning = scoreCard[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);
          
          // Process batting performances first
          const batsmen = Object.values(inning.batTeamDetails.batsmenData || {});
          console.log(`Processing ${batsmen.length} batsmen`);
          
          for (let playerIndex = processingState.currentPlayerIndex; playerIndex < batsmen.length; playerIndex++) {
            const batsman = batsmen[playerIndex];
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

              // Process fielding stats from dismissal
              if (batsman.outDesc) {
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
                  switch (fielder.type) {
                    case 'catch': stats.catches++; break;
                    case 'stumping': stats.stumpings++; break;
                    case 'runout': stats.runouts++; break;
                  }
                }
              }
              
              // Update processing state after each player
              processingState.currentPlayerIndex = playerIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing batsman ${batsman.batName}:`, error);
            }
          }

          // Reset player index when moving to bowlers
          processingState.currentPlayerIndex = 0;
          await setDoc(processStateRef, processingState);

          // Process bowling performances
          const bowlers = Object.values(inning.bowlTeamDetails.bowlersData || {});
          console.log(`Processing ${bowlers.length} bowlers`);
          
          for (let playerIndex = processingState.currentPlayerIndex; playerIndex < bowlers.length; playerIndex++) {
            const bowler = bowlers[playerIndex];
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
              
              // Update processing state after each player
              processingState.currentPlayerIndex = playerIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing bowler ${bowler.bowlName}:`, error);
            }
          }

          // Move to next innings
          processingState.currentInnings = inningsIndex + 1;
          processingState.currentPlayerIndex = 0;
          await setDoc(processStateRef, processingState);
        }

        // Process fielding points at the end
        if (!processingState.fieldingProcessed) {
          console.log(`Processing fielding points for ${fieldingPoints.size} players`);
          for (const [fielderId, stats] of fieldingPoints.entries()) {
            try {
              const fieldingPoints = PointService.calculateFieldingPoints(stats);
              await PointService.storePlayerMatchPoints(
                PointService.createPlayerDocId(fielderId),
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

          processingState.fieldingProcessed = true;
          await setDoc(processStateRef, processingState);
        }

        // Mark match as completed
        processingState.completed = true;
        await setDoc(processStateRef, processingState);

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
