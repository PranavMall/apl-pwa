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
    const matchesToRestore = ['112395','112413','112409','112402','112420','112427','112430']; // Add all your match IDs
    console.log('Starting match restoration process...');

    // Create a processing state collection to track progress
    const processingStatesRef = collection(db, 'processingState');

    try {
      const matchesRef = collection(db, 'matches');
      
      for (const matchId of matchesToRestore) {
        // Get or create processing state for this match
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

        // Track fielding contributions
        const fieldingPoints = new Map();

        // Use the same structure as your working code
        const innings = [matchData.scorecard.team1, matchData.scorecard.team2];
        console.log(`Found ${innings.length} innings to process`);
        
        // Process only remaining innings based on processing state
        for (let inningsIndex = processingState.currentInnings; inningsIndex < innings.length; inningsIndex++) {
          const battingTeam = innings[inningsIndex];
          console.log(`Processing innings ${inningsIndex + 1}`);

          // Process batting performances first
          const batsmen = Object.values(battingTeam.batsmen || {});
          console.log(`Processing ${batsmen.length} batsmen`);
          
          // Start from where we left off
          for (let batsmanIndex = processingState.currentBatsmenIndex; batsmanIndex < batsmen.length; batsmanIndex++) {
            const batsman = batsmen[batsmanIndex];
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
            }
          }

          // Reset batsmen index and move to bowlers
          processingState.currentBatsmenIndex = 0;
          await setDoc(processStateRef, processingState);

          // Process bowling performances
          const bowlers = Object.values(battingTeam.bowlers || {});
          console.log(`Processing ${bowlers.length} bowlers`);
          
          // Start from where we left off
          for (let bowlerIndex = processingState.currentBowlersIndex; bowlerIndex < bowlers.length; bowlerIndex++) {
            const bowler = bowlers[bowlerIndex];
            if (!bowler.name) continue;

            try {
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

              // Update processing state after each bowler
              processingState.currentBowlersIndex = bowlerIndex + 1;
              await setDoc(processStateRef, processingState);
              
            } catch (error) {
              console.error(`Error processing bowler ${bowler.name}:`, error);
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
