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

  static async calculateMatchPoints(matchId, scorecard) {
    try {
      console.log(`Calculating points for match ${matchId}`);
      
      // Process innings data for points
      for (const team of [scorecard.team1, scorecard.team2]) {
        // Calculate batting points
        for (const batsman of Object.values(team.batsmen)) {
          const points = this.calculateBattingPoints(batsman);
          await this.storePlayerMatchPoints(batsman.id, matchId, points, {
            type: 'batting',
            runs: batsman.runs,
            balls: batsman.balls,
            fours: batsman.fours,
            sixes: batsman.sixes
          });
        }

        // Calculate bowling points
        for (const bowler of Object.values(team.bowlers)) {
          const points = this.calculateBowlingPoints(bowler);
          await this.storePlayerMatchPoints(bowler.id, matchId, points, {
            type: 'bowling',
            wickets: bowler.wickets,
            maidens: bowler.maidens,
            runs: bowler.runs,
            overs: bowler.overs
          });
        }
      }

      // Calculate fielding points
      const fieldingStats = this.processFieldingStats(scorecard);
      for (const fielder of fieldingStats) {
        const points = this.calculateFieldingPoints(fielder);
        await this.storePlayerMatchPoints(fielder.id, matchId, points, {
          type: 'fielding',
          catches: fielder.catches,
          stumpings: fielder.stumpings,
          runouts: fielder.runouts
        });
      }

      return true;
    } catch (error) {
      console.error('Error calculating match points:', error);
      throw error;
    }
  }

  static calculateBattingPoints(battingData) {
    let points = this.POINTS.MATCH.PLAYED;
    points += battingData.runs * this.POINTS.BATTING.RUN;
    points += battingData.fours * this.POINTS.BATTING.BOUNDARY_4;
    points += battingData.sixes * this.POINTS.BATTING.BOUNDARY_6;

    if (battingData.runs >= 100) {
      points += this.POINTS.BATTING.MILESTONE_100;
    } else if (battingData.runs >= 50) {
      points += this.POINTS.BATTING.MILESTONE_50;
    } else if (battingData.runs >= 25) {
      points += this.POINTS.BATTING.MILESTONE_25;
    }

    if (battingData.runs === 0 && battingData.balls > 0 && battingData.dismissal) {
      points += this.POINTS.BATTING.DUCK;
    }

    return points;
  }

  static calculateBowlingPoints(bowlingData) {
    let points = 0;
    points += bowlingData.wickets * this.POINTS.BOWLING.WICKET;
    points += bowlingData.maidens * this.POINTS.BOWLING.MAIDEN;

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
      const pointsDocId = `${playerId}_${matchId}`;
      const pointsDocRef = doc(db, 'playerPoints', pointsDocId);

      await setDoc(pointsDocRef, {
        playerId,
        matchId,
        points,
        performance,
        timestamp: new Date().toISOString()
      });

      // Update player's total points
      const playerDocRef = doc(db, 'players', playerId);
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerDocRef);
        if (playerDoc.exists()) {
          const currentPoints = playerDoc.data().totalPoints || 0;
          transaction.update(playerDocRef, {
            totalPoints: currentPoints + points,
            lastUpdated: new Date().toISOString()
          });
        }
      });

      return true;
    } catch (error) {
      console.error('Error storing player match points:', error);
      throw error;
    }
  }
}
