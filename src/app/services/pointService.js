// Remove the "use client" directive from pointService.js
// Separate the class into server and client portions

import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { PlayerMasterService } from './PlayerMasterService';

export class PointService {
  static POINTS = {
    BATTING: {
      RUN: 1,
      BOUNDARY_4: 1,
      BOUNDARY_6: 2,
      MILESTONE_25: 4,
      MILESTONE_50: 8,
      MILESTONE_100: 16,
      DUCK: -5
    },
    BOWLING: {
      WICKET: 25,
      THREE_WICKETS: 8,
      FOUR_WICKETS: 16,
      FIVE_WICKETS: 25,
      MAIDEN: 8
    },
    FIELDING: {
      CATCH: 8,
      STUMPING: 12,
      DIRECT_THROW: 12
    },
    MATCH: {
      PLAYED: 5
    },
    MULTIPLIERS: {
      CAPTAIN: 2,
      VICE_CAPTAIN: 1.5
    }
  };

// Add this static method to your PointService class
static createPlayerDocId(playerName) {
  if (!playerName) return '';
  return playerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
}
  
// And update the start of calculateMatchPoints to accept playerNameMapping
static async calculateMatchPoints(matchId, scorecard) {
  try {
    console.log(`Calculating points for match ${matchId}`);
    
    // Track fielding contributions for each innings
    const fieldingPoints = new Map(); // playerId -> {name, catches: 0, stumpings: 0, runouts: 0}
    
    // Process both teams' innings
    const innings = [scorecard.team1, scorecard.team2];
    
    for (let inningNum = 0; inningNum < innings.length; inningNum++) {
      const team = innings[inningNum];
      console.log(`Processing innings ${inningNum + 1}`);

      // First pass: Process dismissals to collect fielding stats
      for (const batsman of Object.values(team.batsmen)) {
        if (!batsman.dismissal || !batsman.wicketCode) continue;

        const fielder = this.extractFielderFromDismissal(batsman.dismissal, batsman.wicketCode);
        if (fielder) {
          const fielderId = this.createPlayerDocId(fielder.name);
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
            case 'catch':
              stats.catches++;
              break;
            case 'stumping':
              stats.stumpings++;
              break;
            case 'runout':
              stats.runouts++;
              break;
          }
        }
      }

      // Second pass: Process batting performances
      for (const batsman of Object.values(team.batsmen)) {
        if (!batsman.name) continue;

        const battingPoints = this.calculateBattingPoints({
          runs: parseInt(batsman.runs) || 0,
          balls: parseInt(batsman.balls) || 0,
          fours: parseInt(batsman.fours) || 0,
          sixes: parseInt(batsman.sixes) || 0,
          dismissal: batsman.dismissal
        });

        const playerId = this.createPlayerDocId(batsman.name);
        console.log(`Storing batting points for ${batsman.name}:`, battingPoints);
        
        // Get existing fielding stats for this player
        const fieldingStats = fieldingPoints.get(playerId) || { catches: 0, stumpings: 0, runouts: 0 };

        await this.storePlayerMatchPoints(playerId, matchId, battingPoints, {
          type: 'batting',
          name: batsman.name,
          runs: batsman.runs,
          balls: batsman.balls,
          fours: batsman.fours,
          sixes: batsman.sixes,
          catches: fieldingStats.catches,
          runouts: fieldingStats.runouts,
          stumpings: fieldingStats.stumpings
        });
      }

      // Third pass: Process bowling performances
      for (const bowler of Object.values(team.bowlers)) {
        if (!bowler.name) continue;

        const bowlingPoints = this.calculateBowlingPoints({
          wickets: parseInt(bowler.wickets) || 0,
          maidens: parseInt(bowler.maidens) || 0,
          bowler_runs: parseInt(bowler.runs) || 0,
          overs: parseFloat(bowler.overs) || 0
        });

        const playerId = this.createPlayerDocId(bowler.name);
        console.log(`Storing bowling points for ${bowler.name}:`, bowlingPoints);
        
        // Get existing fielding stats for this player
        const fieldingStats = fieldingPoints.get(playerId) || { catches: 0, stumpings: 0, runouts: 0 };

        await this.storePlayerMatchPoints(playerId, matchId, bowlingPoints, {
          type: 'bowling',
          name: bowler.name,
          wickets: bowler.wickets,
          maidens: bowler.maidens,
          bowler_runs: bowler.runs,
          overs: bowler.overs,
          catches: fieldingStats.catches,
          runouts: fieldingStats.runouts,
          stumpings: fieldingStats.stumpings
        });
      }
    }

    // Final pass: Process pure fielding points (for players who only fielded)
    for (const [playerId, stats] of fieldingPoints.entries()) {
      // Only process if player hasn't already been processed for batting/bowling
      const pointsQuery = query(
        collection(db, 'playerPoints'),
        where('playerId', '==', playerId),
        where('matchId', '==', matchId)
      );
      
      const existingPoints = await getDocs(pointsQuery);
      if (existingPoints.empty) {
        const fieldingPoints = this.calculateFieldingPoints(stats);
        console.log(`Storing fielding points for ${stats.name}:`, fieldingPoints);
        
        await this.storePlayerMatchPoints(playerId, matchId, fieldingPoints, {
          type: 'fielding',
          name: stats.name,
          catches: stats.catches,
          runouts: stats.runouts,
          stumpings: stats.stumpings
        });
      }
    }

    return true;
  } catch (error) {
    console.error('Error calculating match points:', error);
    throw error;
  }
}

// Fix for storePlayerMatchPoints in PointService.js 
static async storePlayerMatchPoints(playerId, matchId, newPoints, performance) {
  try {
    const pointsDocId = `${playerId}_${matchId}`;
    const pointsDocRef = doc(db, 'playerPoints', pointsDocId);

    // Get existing document
    const existingDoc = await getDoc(pointsDocRef);
    let existingData = existingDoc.exists() ? existingDoc.data() : null;

    let updatedPerformance = {};
    let totalPoints = newPoints;

    if (existingData) {
      // Handle each performance type appropriately
      const existingPerf = existingData.performance || {};
      
      // Don't double-count match participation points
      if ((performance.type === 'batting' && existingPerf.bowling) || 
          (performance.type === 'bowling' && existingPerf.batting) ||
          (performance.type === 'bowling' && performance.includesMatchPoints && existingPerf.matchPointsAdded)) {
        // Subtract match played points if already counted
        totalPoints = newPoints - this.POINTS.MATCH.PLAYED;
      }
      
      // Combine with existing points
      totalPoints = (existingData.points || 0) + totalPoints;
      
      // Build combined performance record
      if (performance.type === 'batting') {
        updatedPerformance = {
          ...existingPerf,
          batting: true,
          matchPointsAdded: true,
          runs: performance.runs || 0,
          balls: performance.balls || 0,
          fours: performance.fours || 0,
          sixes: performance.sixes || 0,
          strikeRate: performance.strikeRate || 0
        };
        // Only add innings if it's defined
        if (performance.innings !== undefined) {
          updatedPerformance.innings = performance.innings;
        }
      } 
      else if (performance.type === 'bowling') {
        updatedPerformance = {
          ...existingPerf,
          bowling: true,
          matchPointsAdded: existingPerf.matchPointsAdded || performance.includesMatchPoints || false,
          overs: performance.overs || 0,
          maidens: performance.maidens || 0,
          bowler_runs: performance.bowler_runs || 0,
          wickets: performance.wickets || 0,
          economy: performance.economy || 0
        };
        // Only add innings if it's defined
        if (performance.innings !== undefined) {
          updatedPerformance.innings = performance.innings;
        }
      }
      else if (performance.type === 'fielding') {
        updatedPerformance = {
          ...existingPerf,
          fielding: true,
          catches: (existingPerf.catches || 0) + (performance.catches || 0),
          stumpings: (existingPerf.stumpings || 0) + (performance.stumpings || 0),
          runouts: (existingPerf.runouts || 0) + (performance.runouts || 0)
        };
      }
    } else {
      // New performance record
      updatedPerformance = {
        name: performance.name,
        id: playerId,
        matchPointsAdded: performance.type === 'batting' || 
                         (performance.type === 'bowling' && performance.includesMatchPoints) || 
                         false,
        [performance.type]: true
      };
      
      // Only add innings if it's defined
      if (performance.innings !== undefined) {
        updatedPerformance.innings = performance.innings;
      }

      if (performance.type === 'batting') {
        Object.assign(updatedPerformance, {
          runs: performance.runs || 0,
          balls: performance.balls || 0,
          fours: performance.fours || 0,
          sixes: performance.sixes || 0,
          strikeRate: performance.strikeRate || 0
        });
      } 
      else if (performance.type === 'bowling') {
        Object.assign(updatedPerformance, {
          overs: performance.overs || 0,
          maidens: performance.maidens || 0,
          bowler_runs: performance.bowler_runs || 0,
          wickets: performance.wickets || 0,
          economy: performance.economy || 0
        });
      }
      else if (performance.type === 'fielding') {
        Object.assign(updatedPerformance, {
          catches: performance.catches || 0,
          stumpings: performance.stumpings || 0,
          runouts: performance.runouts || 0
        });
      }
    }

    // Store updated playerPoints data (never skip this)
    await setDoc(pointsDocRef, {
      playerId,
      matchId,
      points: totalPoints,
      performance: updatedPerformance,
      timestamp: new Date().toISOString()
    });

    try {
      // CRITICAL FIX: Only try to update PlayerMaster if player exists
      // Don't create new players in PlayerMaster automatically
      let masterPlayer = await PlayerMasterService.findPlayerByAnyId(playerId);
      
      if (masterPlayer) {
        // Player exists in master, update their stats
        // Extract stats from performance data
        const matchStats = {
          matchId: matchId,
          isNewMatch: true,
          battingRuns: parseInt(performance.runs || updatedPerformance.runs || 0),
          bowlingRuns: parseInt(performance.bowler_runs || updatedPerformance.bowler_runs || 0),
          wickets: parseInt(performance.wickets || updatedPerformance.wickets || 0),
          catches: parseInt(performance.catches || updatedPerformance.catches || 0),
          stumpings: parseInt(performance.stumpings || updatedPerformance.stumpings || 0),
          runOuts: parseInt(performance.runouts || updatedPerformance.runouts || 0),
          points: totalPoints,
          fifties: parseInt(performance.runs || updatedPerformance.runs || 0) >= 50 && 
                  parseInt(performance.runs || updatedPerformance.runs || 0) < 100 ? 1 : 0,
          hundreds: parseInt(performance.runs || updatedPerformance.runs || 0) >= 100 ? 1 : 0,
          fours: parseInt(performance.fours || updatedPerformance.fours || 0),
          sixes: parseInt(performance.sixes || updatedPerformance.sixes || 0)
        };
        
        // Update the player's cumulative stats
        await PlayerMasterService.updatePlayerStats(masterPlayer.id, matchStats);
        console.log(`Updated master stats for ${masterPlayer.id}`);
      } else {
        // INTEGRATION WITH EXISTING ADMIN: Add to pending mappings collection
        // This is where we store potential mappings for admin review
        // The collection name might need to change depending on what your admin page expects
        
        const pendingMappingRef = doc(db, 'pendingPlayerMappings', playerId);
        await setDoc(pendingMappingRef, {
          id: playerId,
          name: performance.name || playerId,
          team: performance.team || 'unknown',
          suggestedRole: performance.type === 'bowling' ? 'bowler' : 
                        performance.type === 'batting' ? 'batsman' : 
                        performance.type === 'fielding' ? 'wicketkeeper' : 'unknown',
          matchIds: [matchId],
          points: totalPoints,
          lastSeen: new Date().toISOString(),
          needsMapping: true,
          performance: {
            runs: performance.runs || 0,
            balls: performance.balls || 0,
            wickets: performance.wickets || 0,
            fours: performance.fours || 0,
            sixes: performance.sixes || 0,
            catches: performance.catches || 0,
            stumpings: performance.stumpings || 0,
            runOuts: performance.runouts || 0
          }
        }, { merge: true });
        
        console.log(`Player ${playerId} (${performance.name}) not found in PlayerMaster. Added to pendingPlayerMappings for admin review.`);
      }
    } catch (syncError) {
      console.error('Error syncing to player master DB:', syncError);
    }

    return true;
  } catch (error) {
    console.error('Error storing player match points:', error);
    throw error;
  }
}

static calculateBattingPoints(battingData) {
  let points = this.POINTS.MATCH.PLAYED; // Base points for playing

  // Runs
  points += battingData.runs * this.POINTS.BATTING.RUN;

  // Boundaries
  points += battingData.fours * this.POINTS.BATTING.BOUNDARY_4;
  points += battingData.sixes * this.POINTS.BATTING.BOUNDARY_6;

  // Milestones
  if (battingData.runs >= 100) {
    points += this.POINTS.BATTING.MILESTONE_100;
  } else if (battingData.runs >= 50) {
    points += this.POINTS.BATTING.MILESTONE_50;
  } else if (battingData.runs >= 25) {
    points += this.POINTS.BATTING.MILESTONE_25;
  }

  // Duck
  if (battingData.runs === 0 && battingData.balls > 0 && battingData.dismissal) {
    points += this.POINTS.BATTING.DUCK;
  }

  return points;
}

  // 2. Modify calculateBowlingPoints to NOT include match played points by default
// (we'll add them explicitly in the route.js file to avoid duplicates)
static calculateBowlingPoints(bowlingData) {
  let points = 0; // No base points here - we'll add them in route.js

  // Wickets
  points += bowlingData.wickets * this.POINTS.BOWLING.WICKET;
  
  // Maidens
  points += bowlingData.maidens * this.POINTS.BOWLING.MAIDEN;

  // Wicket milestones
  if (bowlingData.wickets >= 5) {
    points += this.POINTS.BOWLING.FIVE_WICKETS;
  } else if (bowlingData.wickets >= 4) {
    points += this.POINTS.BOWLING.FOUR_WICKETS;
  } else if (bowlingData.wickets >= 3) {
    points += this.POINTS.BOWLING.THREE_WICKETS;
  }

  return points;
}

static calculateFieldingPoints(fieldingData) {
  let points = 0;
  points += fieldingData.catches * this.POINTS.FIELDING.CATCH;
  points += fieldingData.stumpings * this.POINTS.FIELDING.STUMPING;
  points += fieldingData.runouts * this.POINTS.FIELDING.DIRECT_THROW;
  return points;
}
// 3. Improved extractFielderFromDismissal to better handle various dismissal types
static extractFielderFromDismissal(dismissal, wicketCode) {
  if (!dismissal) return null;

  console.log(`Processing dismissal: "${dismissal}", wicketCode: ${wicketCode || 'NONE'}`);

  // Try to identify fielders regardless of wicketCode
  // Catches - 'c Player b Bowler' or 'c Player1/Player2 b Bowler'
  const catchMatch = dismissal.match(/c\s+(?:\(sub\))?([^b]+)b\s/i);
  if (catchMatch) {
    const fielderName = catchMatch[1].trim();
    console.log(`Identified catch by: ${fielderName}`);
    return {
      name: fielderName,
      id: this.createPlayerDocId(fielderName), // Format name to match player ID format
      type: 'catch'
    };
  }

  // Caught and bowled: "c and b Player"
  const candBMatch = dismissal.match(/c and b\s+(.+)/i);
  if (candBMatch) {
    const fielderName = candBMatch[1].trim();
    console.log(`Identified catch and bowl by: ${fielderName}`);
    return {
      name: fielderName,
      id: this.createPlayerDocId(fielderName), // Format name to match player ID format
      type: 'catch'
    };
  }

  // Stumpings: "st Player b Bowler"
  const stumpMatch = dismissal.match(/st\s+([^b]+)b/i);
  if (stumpMatch) {
    const fielderName = stumpMatch[1].trim();
    console.log(`Identified stumping by: ${fielderName}`);
    return {
      name: fielderName,
      id: this.createPlayerDocId(fielderName), // Format name to match player ID format
      type: 'stumping'
    };
  }

  // Run outs: "run out (Player)" or "run out (Player/Player2)"
  const runoutMatch = dismissal.match(/run out\s+\(([^)\/]+)(?:\/[^)]+)?\)/i);
  if (runoutMatch) {
    const fielderName = runoutMatch[1].trim();
    console.log(`Identified run out by: ${fielderName}`);
    return {
      name: fielderName,
      id: this.createPlayerDocId(fielderName), // Format name to match player ID format
      type: 'runout'
    };
  }
  
  console.log(`No fielder identified in dismissal`);
  return null;
}
  

  static calculateCumulativeStats(performances) {
  const stats = {
    matches: performances.length,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    wickets: 0,
    bowlingRuns: 0,
    bowlingBalls: 0,
    maidens: 0,
    catches: 0,
    stumpings: 0,
    dismissals: 0
  };

  performances.forEach(perf => {
    if (perf.type === 'batting') {
      stats.runs += perf.runs || 0;
      stats.balls += perf.balls || 0;
      stats.fours += perf.fours || 0;
      stats.sixes += perf.sixes || 0;
      
      if (perf.runs >= 100) stats.hundreds++;
      else if (perf.runs >= 50) stats.fifties++;
    }
    else if (perf.type === 'bowling') {
      stats.wickets += perf.wickets || 0;
      stats.bowlingRuns += perf.runs || 0;
      // Convert overs to balls
      const overs = perf.overs || 0;
      const oversInt = Math.floor(overs);
      const oversDec = (overs % 1) * 10;
      stats.bowlingBalls += (oversInt * 6) + oversDec;
      stats.maidens += perf.maidens || 0;
    }
    else if (perf.type === 'fielding') {
      stats.catches += perf.catches || 0;
      stats.stumpings += perf.stumpings || 0;
      stats.dismissals = stats.catches + stats.stumpings;
    }
  });

  // Calculate averages and rates
  stats.battingAverage = stats.matches > 0 ? (stats.runs / stats.matches).toFixed(2) : "0.00";
  stats.strikeRate = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(2) : "0.00";
  stats.economyRate = stats.bowlingBalls > 0 ? 
    ((stats.bowlingRuns / stats.bowlingBalls) * 6).toFixed(2) : "0.00";
  stats.bowlingAverage = stats.wickets > 0 ? 
    (stats.bowlingRuns / stats.wickets).toFixed(2) : "0.00";

  return stats;
}
}

  
