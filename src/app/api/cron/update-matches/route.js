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
  setDoc, 
  updateDoc
} from 'firebase/firestore';
import { db } from '../../../../firebase';

// Set a safety margin before Vercel's 10s timeout (6 seconds to be safe)
const TIMEOUT_MARGIN = 6000; // 6 seconds
const startTime = Date.now();

function shouldContinueProcessing() {
  const elapsed = Date.now() - startTime;
  const shouldContinue = elapsed < TIMEOUT_MARGIN;
  
  if (!shouldContinue) {
    console.log(`Approaching timeout after ${elapsed}ms, stopping processing`);
  }
  
  return shouldContinue;
}

// Create a queue system document in Firestore if it doesn't exist
async function initializeQueueIfNeeded() {
  const queueRef = doc(db, 'system', 'processingQueue');
  const queueSnap = await getDoc(queueRef);
  
  if (!queueSnap.exists()) {
    // Match IDs to process - update this with your actual match IDs
    const matchIds = ['112395', '112413', '112409', '112402', '112420', '112427', '112430','112437','112441'];
    
    await setDoc(queueRef, {
      matchQueue: matchIds,
      currentlyProcessing: null,
      lastRun: null,
      completedMatches: []
    });
    
    console.log('Initialized processing queue with matches:', matchIds);
  }
  
  return queueRef;
}

// Get the next match to process from the queue
async function getNextMatchToProcess(queueRef) {
  const queueSnap = await getDoc(queueRef);
  const queueData = queueSnap.data();
  
  // Check if a match is currently being processed
  if (queueData.currentlyProcessing) {
    return queueData.currentlyProcessing;
  }
  
  // Get the next match from the queue
  if (queueData.matchQueue && queueData.matchQueue.length > 0) {
    const nextMatch = queueData.matchQueue[0];
    
    // Mark this match as currently processing
    await updateDoc(queueRef, {
      currentlyProcessing: nextMatch,
      matchQueue: queueData.matchQueue.slice(1), // Remove it from the queue
      lastRun: new Date().toISOString()
    });
    
    console.log(`Starting to process match ${nextMatch}`);
    return nextMatch;
  }
  
  return null; // No more matches to process
}

// Mark a match as completed and move to the next
async function markMatchCompleted(queueRef, matchId) {
  const queueSnap = await getDoc(queueRef);
  const queueData = queueSnap.data();
  
  await updateDoc(queueRef, {
    currentlyProcessing: null,
    completedMatches: [...(queueData.completedMatches || []), matchId],
    lastRun: new Date().toISOString()
  });
  
  console.log(`Marked match ${matchId} as completed`);
}

export async function GET(request) {
  try {
    // Initialize the processing queue if needed
    const queueRef = await initializeQueueIfNeeded();
    
    // Get the next match to process
    const matchId = await getNextMatchToProcess(queueRef);
    if (!matchId) {
      return NextResponse.json({
        success: true,
        message: 'No matches left to process',
        timestamp: new Date().toISOString()
      });
    }
    
    // Get or create processing state for this match
    const processingStatesRef = collection(db, 'processingState');
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
    
    // If the match is already completed, mark it as done in the queue and exit
    if (processingState.completed) {
      console.log(`Match ${matchId} already completed, moving to next`);
      await markMatchCompleted(queueRef, matchId);
      return NextResponse.json({
        success: true,
        message: `Match ${matchId} already processed, marked as completed`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Get match data
    const matchesRef = collection(db, 'matches');
    const matchQuery = query(matchesRef, where('matchId', '==', matchId));
    const matchSnapshot = await getDocs(matchQuery);
    
    if (matchSnapshot.empty) {
      console.log(`Match ${matchId} not found, moving to next`);
      await markMatchCompleted(queueRef, matchId);
      return NextResponse.json({
        success: true,
        message: `Match ${matchId} not found, marked as completed`,
        timestamp: new Date().toISOString()
      });
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
      console.log(`Match ${matchId} was abandoned, marking as completed`);
      
      processingState.completed = true;
      processingState.abandonedMatch = true;
      await setDoc(processStateRef, processingState);
      await markMatchCompleted(queueRef, matchId);
      
      return NextResponse.json({
        success: true,
        message: `Match ${matchId} was abandoned, marked as completed`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Track fielding contributions for this match
    let fieldingPoints = processingState.fieldingPoints || new Map();
    if (!(fieldingPoints instanceof Map)) {
      // Convert from serialized object back to Map
      fieldingPoints = new Map(Object.entries(fieldingPoints));
    }
    
    // Get innings from match data
    let innings = [];
    if (matchData.scorecard && matchData.scorecard.team1 && matchData.scorecard.team2) {
      innings = [matchData.scorecard.team1, matchData.scorecard.team2];
    } else {
      console.error('Invalid scorecard structure:', matchData.scorecard);
      processingState.error = 'Invalid scorecard structure';
      await setDoc(processStateRef, processingState);
      await markMatchCompleted(queueRef, matchId);
      
      return NextResponse.json({
        success: false,
        message: `Match ${matchId} has invalid scorecard structure`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Process innings, starting from where we left off
    let madeProgress = false;
    
    // Process current innings
    if (processingState.currentInnings < innings.length) {
      const inningsIndex = processingState.currentInnings;
      const battingTeam = innings[inningsIndex];
      console.log(`Processing innings ${inningsIndex + 1}`);
      
      // Process batsmen first
      if (battingTeam.batsmen) {
        const batsmen = Object.values(battingTeam.batsmen);
        console.log(`Processing ${batsmen.length} batsmen starting from index ${processingState.currentBatsmenIndex}`);
        
        // Process batsmen from where we left off
        for (let i = processingState.currentBatsmenIndex; i < batsmen.length; i++) {
          if (!shouldContinueProcessing()) {
            // Save progress and exit
            processingState.currentBatsmenIndex = i;
            // Convert Map to serializable object for storage
            processingState.fieldingPoints = Object.fromEntries(fieldingPoints);
            await setDoc(processStateRef, processingState);
            
            console.log(`Timeout reached while processing batsmen, saved progress at index ${i}`);
            return NextResponse.json({
              success: true,
              message: `Partially processed match ${matchId}, will continue next run`,
              progress: { 
                innings: inningsIndex + 1, 
                batsmanIndex: i,
                totalBatsmen: batsmen.length
              },
              timestamp: new Date().toISOString()
            });
          }
          
          const batsman = batsmen[i];
          const batsmanName = batsman.name || batsman.batName;
          
          if (!batsmanName) {
            console.log(`No name for batsman at index ${i}, skipping...`);
            continue;
          }
          
          try {
            console.log(`Processing batsman: ${batsmanName}`);
            
            // Process batting points
            const playerId = PointService.createPlayerDocId(batsmanName);
            const battingPoints = PointService.calculateBattingPoints({
              runs: parseInt(batsman.runs) || 0,
              balls: parseInt(batsman.balls) || 0,
              fours: parseInt(batsman.fours) || 0,
              sixes: parseInt(batsman.sixes) || 0,
              dismissal: batsman.outDesc || batsman.dismissal || ''
            });
            
            await PointService.storePlayerMatchPoints(
              playerId,
              matchId,
              battingPoints,
              {
                type: 'batting',
                innings: inningsIndex + 1,
                name: batsmanName,
                runs: batsman.runs,
                balls: batsman.balls,
                fours: batsman.fours,
                sixes: batsman.sixes
              }
            );
            
            // Track fielding contributions
            const dismissal = batsman.outDesc || batsman.dismissal;
            const wicketCode = batsman.wicketCode || '';
            
            if (dismissal) {
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
                switch (fielder.type) {
                  case 'catch': stats.catches++; break;
                  case 'stumping': stats.stumpings++; break;
                  case 'runout': stats.runouts++; break;
                }
              }
            }
            
            madeProgress = true;
            console.log(`Successfully processed batsman: ${batsmanName}`);
          } catch (error) {
            console.error(`Error processing batsman ${batsmanName}:`, error);
          }
        }
        
        // All batsmen processed, move to bowlers
        processingState.currentBatsmenIndex = 0;
      }
      
      // If we have time left, process bowlers
      if (shouldContinueProcessing()) {
        if (battingTeam.bowlers) {
          const bowlers = Object.values(battingTeam.bowlers);
          console.log(`Processing ${bowlers.length} bowlers starting from index ${processingState.currentBowlersIndex}`);
          
          // Process bowlers from where we left off
          for (let i = processingState.currentBowlersIndex; i < bowlers.length; i++) {
            if (!shouldContinueProcessing()) {
              // Save progress and exit
              processingState.currentBowlersIndex = i;
              processingState.fieldingPoints = Object.fromEntries(fieldingPoints);
              await setDoc(processStateRef, processingState);
              
              console.log(`Timeout reached while processing bowlers, saved progress at index ${i}`);
              return NextResponse.json({
                success: true,
                message: `Partially processed match ${matchId}, will continue next run`,
                progress: { 
                  innings: inningsIndex + 1, 
                  bowlerIndex: i,
                  totalBowlers: bowlers.length
                },
                timestamp: new Date().toISOString()
              });
            }
            
            const bowler = bowlers[i];
            const bowlerName = bowler.name || bowler.bowlName;
            
            if (!bowlerName) {
              console.log(`No name for bowler at index ${i}, skipping...`);
              continue;
            }
            
            try {
              console.log(`Processing bowler: ${bowlerName}`);
              
              // Process bowling points
              const playerId = PointService.createPlayerDocId(bowlerName);
              const bowlingPoints = PointService.calculateBowlingPoints({
                wickets: parseInt(bowler.wickets) || 0,
                maidens: parseInt(bowler.maidens) || 0,
                runs: parseInt(bowler.runs) || 0,
                overs: parseFloat(bowler.overs) || 0
              });
              
              // Add match played points
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
                  name: bowlerName,
                  wickets: bowler.wickets,
                  maidens: bowler.maidens,
                  runs: bowler.runs,
                  overs: bowler.overs
                }
              );
              
              madeProgress = true;
              console.log(`Successfully processed bowler: ${bowlerName}`);
            } catch (error) {
              console.error(`Error processing bowler ${bowlerName}:`, error);
            }
          }
          
          // All bowlers in this innings processed
          processingState.currentBowlersIndex = 0;
        }
        
        // Move to next innings
        processingState.currentInnings++;
      }
    }
    
    // If we have time left and all innings are processed, process fielding points
    if (shouldContinueProcessing() && 
        processingState.currentInnings >= innings.length && 
        !processingState.fieldingProcessed) {
      
      console.log(`Processing fielding points for ${fieldingPoints.size} players`);
      
      // Convert Map to array for iteration
      const fieldingEntries = Array.from(fieldingPoints.entries());
      
      for (let i = 0; i < fieldingEntries.length; i++) {
        if (!shouldContinueProcessing()) {
          // Save progress and exit
          processingState.fieldingPoints = Object.fromEntries(fieldingPoints);
          await setDoc(processStateRef, processingState);
          
          console.log(`Timeout reached while processing fielding, saved progress`);
          return NextResponse.json({
            success: true,
            message: `Partially processed match ${matchId}, will continue next run with fielding`,
            progress: { 
              fieldingProcessed: false,
              fieldersRemaining: fieldingEntries.length - i
            },
            timestamp: new Date().toISOString()
          });
        }
        
        const [fielderName, stats] = fieldingEntries[i];
        
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
          
          madeProgress = true;
          console.log(`Successfully processed fielding for: ${fielderName}`);
        } catch (error) {
          console.error(`Error processing fielding points for ${fielderName}:`, error);
        }
      }
      
      // All fielding processed
      processingState.fieldingProcessed = true;
    }
    
    // Check if we've completed all processing for this match
    if (processingState.currentInnings >= innings.length && processingState.fieldingProcessed) {
      processingState.completed = true;
      await setDoc(processStateRef, processingState);
      await markMatchCompleted(queueRef, matchId);
      
      console.log(`Successfully completed processing match ${matchId}`);
      return NextResponse.json({
        success: true,
        message: `Match ${matchId} processing completed`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Save our progress
    processingState.fieldingPoints = Object.fromEntries(fieldingPoints);
    await setDoc(processStateRef, processingState);
    
    if (madeProgress) {
      return NextResponse.json({
        success: true,
        message: `Made progress on match ${matchId}, will continue in next run`,
        progress: {
          innings: processingState.currentInnings + 1,
          batsmenIndex: processingState.currentBatsmenIndex,
          bowlersIndex: processingState.currentBowlersIndex,
          fieldingProcessed: processingState.fieldingProcessed
        },
        timestamp: new Date().toISOString()
      });
    } else {
      // If we didn't make any progress in this run, there might be an issue
      console.warn(`No progress made for match ${matchId}, check for issues`);
      return NextResponse.json({
        success: false,
        message: `No progress made for match ${matchId}, possible issue`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error in match processing:', error);
    return NextResponse.json(
      { error: 'Failed to process match data', details: error.message },
      { status: 500 }
    );
  }
}
