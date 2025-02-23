// Remove the "use client" directive from pointService.js
// Separate the class into server and client portions

import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';

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
      // Keep track of which types of performances we've already processed
      const existingPerf = existingData.performance || {};
      
      if (performance.type === 'batting') {
        if (!existingPerf.batting) {
          // Only add batting points if we haven't processed batting before
          totalPoints = (existingData.points || 0) + newPoints;
        } else {
          // If we've already processed batting, use existing points
          totalPoints = existingData.points;
        }
        
        updatedPerformance = {
          ...existingPerf,
          runs: performance.runs || 0,
          balls: performance.balls || 0,
          fours: performance.fours || 0,
          sixes: performance.sixes || 0,
          strikeRate: performance.strikeRate || 0,
          innings: performance.innings,
          batting: true
        };
      } 
      else if (performance.type === 'bowling') {
        if (!existingPerf.bowling) {
          // Only add bowling points if we haven't processed bowling before
          totalPoints = (existingData.points || 0) + newPoints;
        } else {
          // If we've already processed bowling, use existing points
          totalPoints = existingData.points;
        }
        
        updatedPerformance = {
          ...existingPerf,
          overs: performance.overs || 0,
          maidens: performance.maidens || 0,
          bowler_runs: performance.runs || 0,
          wickets: performance.wickets || 0,
          economy: performance.economy || 0,
          innings: performance.innings,
          bowling: true
        };
      }
      else if (performance.type === 'fielding') {
        if (!existingPerf.fielding) {
          // Only add fielding points if we haven't processed fielding before
          totalPoints = (existingData.points || 0) + newPoints;
        } else {
          // If we've already processed fielding, use existing points
          totalPoints = existingData.points;
        }
        
        updatedPerformance = {
          ...existingPerf,
          catches: (existingPerf.catches || 0) + (performance.catches || 0),
          stumpings: (existingPerf.stumpings || 0) + (performance.stumpings || 0),
          runouts: (existingPerf.runouts || 0) + (performance.runouts || 0),
          fielding: true
        };
      }
    } else {
      // New performance record
      updatedPerformance = {
        name: performance.name,
        id: playerId,
        innings: performance.innings,
        [performance.type]: true
      };

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
          bowler_runs: performance.runs || 0,
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

    // Log for debugging
    console.log(`Points calculation for ${performance.name}:`, {
      type: performance.type,
      newPoints,
      existingPoints: existingData?.points || 0,
      totalPoints,
      performance: updatedPerformance
    });

    // Store updated data
    await setDoc(pointsDocRef, {
      playerId,
      matchId,
      points: totalPoints,
      performance: updatedPerformance,
      timestamp: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('Error storing player match points:', error, {
      playerId,
      matchId,
      points: newPoints,
      performance: JSON.stringify(performance, null, 2)
    });
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

static calculateBowlingPoints(bowlingData) {
  let points = 0;

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

static extractFielderFromDismissal(dismissal, wicketCode) {
  if (!dismissal) return null;

  // Handle different dismissal types
  if (wicketCode === 'CAUGHT') {
    // Regular catch: "c Player b Bowler"
    const catchMatch = dismissal.match(/c\s+(?:\(sub\))?\s*([^b]+)b/);
    if (catchMatch) {
      return {
        name: catchMatch[1].trim(),
        type: 'catch'
      };
    }
  } else if (wicketCode === 'CAUGHTBOWLED') {
    // Caught and bowled: "c and b Player"
    const candBMatch = dismissal.match(/c and b\s+(.+)/);
    if (candBMatch) {
      return {
        name: candBMatch[1].trim(),
        type: 'catch'
      };
    }
  } else if (wicketCode === 'STUMPED') {
    // Stumping: "st Player b Bowler"
    const stumpMatch = dismissal.match(/st\s+([^b]+)b/);
    if (stumpMatch) {
      return {
        name: stumpMatch[1].trim(),
        type: 'stumping'
      };
    }
  } else if (wicketCode === 'RUNOUT') {
    // Run out: "run out (Player)"
    const runoutMatch = dismissal.match(/run out\s+\(([^)]+)\)/);
    if (runoutMatch) {
      return {
        name: runoutMatch[1].trim(),
        type: 'runout'
      };
    }
  }
  
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

  
