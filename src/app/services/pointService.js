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
    
    // Track fielding contributions
    const fieldingPoints = new Map(); // playerId -> {catches: 0, stumpings: 0, runouts: 0}
    
    // Process both teams
    for (const team of [scorecard.team1, scorecard.team2]) {
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
          dismissal: batsman.dismissal,
        
        });

        const playerId = this.createPlayerDocId(batsman.name);
        await this.storePlayerMatchPoints(playerId, matchId, battingPoints, {
          type: 'batting',
          name: batsman.name,
          runs: batsman.runs,
          balls: batsman.balls,
          fours: batsman.fours,
          sixes: batsman.sixes
        });
      }

      // Third pass: Process bowling performances
      for (const bowler of Object.values(team.bowlers)) {
        if (!bowler.name) continue;

        const bowlingPoints = this.calculateBowlingPoints({
          wickets: parseInt(bowler.wickets) || 0,
          maidens: parseInt(bowler.maidens) || 0,
          bowler_runs: parseInt(bowler.runs) || 0,
          overs: parseFloat(bowler.overs) || 0,
        
        });

        const playerId = this.createPlayerDocId(bowler.name);
        await this.storePlayerMatchPoints(playerId, matchId, bowlingPoints, {
          type: 'bowling',
          name: bowler.name,
          wickets: bowler.wickets,
          maidens: bowler.maidens,
          bowler_runs: bowler.runs,
          overs: bowler.overs
        });
      }
    }

    // Final pass: Process fielding points
    for (const [playerId, stats] of fieldingPoints.entries()) {
      const fieldingPoints = this.calculateFieldingPoints(stats);
      await this.storePlayerMatchPoints(playerId, matchId, fieldingPoints, {
        type: 'fielding',
        name: stats.name,
        ...stats
      });
    }

    return true;
  } catch (error) {
    console.error('Error calculating match points:', error);
    throw error;
  }
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

static async storePlayerMatchPoints(playerId, matchId, points, performance) {
  try {
    // 1. Store individual match points
    const pointsDocId = `${playerId}_${matchId}`;
    const pointsDocRef = doc(db, 'playerPoints', pointsDocId);

    await setDoc(pointsDocRef, {
      playerId,
      matchId,
      points,
      performance,
      timestamp: new Date().toISOString()
    });

    // 2. Get all points for this player from all matches
    const playerPointsRef = collection(db, 'playerPoints');
    const playerPointsQuery = query(
      playerPointsRef,
      where('playerId', '==', playerId)
    );

    const pointsSnapshot = await getDocs(playerPointsQuery);
    let totalPoints = 0;
    let performances = [];

    pointsSnapshot.docs.forEach(doc => {
      const pointData = doc.data();
      totalPoints += pointData.points || 0;
      if (pointData.performance) {
        performances.push({
          matchId: pointData.matchId,
          ...pointData.performance
        });
      }
    });

    // 3. Update player's cumulative stats
    const playerDocRef = doc(db, 'players', playerId);
    await runTransaction(db, async (transaction) => {
      const playerDoc = await transaction.get(playerDocRef);
      if (playerDoc.exists()) {
        // Calculate cumulative stats based on all performances
        const stats = this.calculateCumulativeStats(performances);
        
        transaction.update(playerDocRef, {
          totalPoints: totalPoints,
          ...stats,
          lastUpdated: new Date().toISOString(),
          lastMatchId: matchId
        });
      }
    });

    return true;
  } catch (error) {
    console.error('Error storing player match points:', error);
    throw error;
  }
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

  
