// src/services/pointService.js
"use client";

import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export class PointService {
  // Points configuration
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
      DIRECT_THROW: 12,
      RUN_OUT: 8
    },
    MATCH: {
      PLAYED: 5
    },
    MULTIPLIERS: {
      CAPTAIN: 2,
      VICE_CAPTAIN: 1.5
    },
    USER: {
      LATE_REGISTRATION: -25,
      REFERRAL: 25,
      MAX_REFERRALS: 3
    }
  };

  // Calculate batting points
  static calculateBattingPoints(battingData) {
    let points = 0;
    const runs = parseInt(battingData.runs) || 0;

    // Basic runs
    points += runs * this.POINTS.BATTING.RUN;

    // Boundaries
    points += (parseInt(battingData.fours) || 0) * this.POINTS.BATTING.BOUNDARY_4;
    points += (parseInt(battingData.sixes) || 0) * this.POINTS.BATTING.BOUNDARY_6;

    // Milestones (cumulative)
    if (runs >= 25) points += this.POINTS.BATTING.MILESTONE_25;
    if (runs >= 50) points += this.POINTS.BATTING.MILESTONE_50;
    if (runs >= 100) points += this.POINTS.BATTING.MILESTONE_100;

    // Duck
    if (runs === 0 && battingData.outDesc) points += this.POINTS.BATTING.DUCK;

    return points;
  }

// These methods should be added to your pointService.js file
static async getUserTeam(userId, matchId) {
  try {
    // Get match info to get tournament ID
    const matchDoc = await getDoc(doc(db, 'matches', matchId));
    if (!matchDoc.exists()) {
      throw new Error('Match not found');
    }
    const match = matchDoc.data();
    const tournamentId = match.seriesId;

    // Get user's team for this tournament
    const userTeamDoc = await getDoc(doc(db, 'userTeams', `${userId}_${tournamentId}`));
    if (!userTeamDoc.exists()) {
      throw new Error('User team not found');
    }
    
    return userTeamDoc.data();
  } catch (error) {
    console.error('Error getting user team:', error);
    throw error;
  }
}

static findPlayerBattingData(scorecard, playerId) {
  try {
    // Check both innings
    for (const inning of scorecard) {
      const batTeamDetails = inning.batTeamDetails;
      if (!batTeamDetails?.batsmenData) continue;

      // Look through all batsmen
      for (const batsman of Object.values(batTeamDetails.batsmenData)) {
        if (batsman.batId.toString() === playerId.toString()) {
          return {
            runs: batsman.runs,
            balls: batsman.balls,
            fours: batsman.boundaries, // API uses 'boundaries' for fours
            sixes: batsman.sixers,
            outDesc: batsman.outDesc
          };
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding batting data:', error);
    return null;
  }
}

static findPlayerBowlingData(scorecard, playerId) {
  try {
    // Check both innings
    for (const inning of scorecard) {
      const bowlTeamDetails = inning.bowlTeamDetails;
      if (!bowlTeamDetails?.bowlersData) continue;

      // Look through all bowlers
      for (const bowler of Object.values(bowlTeamDetails.bowlersData)) {
        if (bowler.bowlerId.toString() === playerId.toString()) {
          return {
            wickets: bowler.wickets,
            maidens: bowler.maidens,
            runs: bowler.runs,
            overs: bowler.overs
          };
        }
      }
    }
    return null;
  } catch (error) {
    console.error('Error finding bowling data:', error);
    return null;
  }
}

static findPlayerFieldingData(scorecard, playerId) {
  try {
    let fieldingData = {
      catches: 0,
      stumpings: 0,
      directThrows: 0
    };

    // Go through both innings
    for (const inning of scorecard) {
      const batTeamDetails = inning.batTeamDetails;
      if (!batTeamDetails?.batsmenData) continue;

      // Check dismissals for catches and stumpings
      for (const batsman of Object.values(batTeamDetails.batsmenData)) {
        if (batsman.outDesc) {
          // Check for catches
          if (batsman.outDesc.includes('c') && 
              batsman.fielderId1.toString() === playerId.toString()) {
            fieldingData.catches++;
          }
          // Check for stumpings
          if (batsman.outDesc.includes('st') && 
              batsman.fielderId1.toString() === playerId.toString()) {
            fieldingData.stumpings++;
          }
          // For direct throws, we would need additional data from API
          // Currently API doesn't distinguish direct throws
        }
      }
    }

    return fieldingData;
  } catch (error) {
    console.error('Error finding fielding data:', error);
    return null;
  }
}
  
  // Calculate bowling points
  static calculateBowlingPoints(bowlingData) {
    let points = 0;
    const wickets = parseInt(bowlingData.wickets) || 0;
    const maidens = parseInt(bowlingData.maidens) || 0;

    // Basic wickets
    points += wickets * this.POINTS.BOWLING.WICKET;

    // Maiden overs
    points += maidens * this.POINTS.BOWLING.MAIDEN;

    // Wicket milestones (cumulative)
    if (wickets >= 3) points += this.POINTS.BOWLING.THREE_WICKETS;
    if (wickets >= 4) points += this.POINTS.BOWLING.FOUR_WICKETS;
    if (wickets >= 5) points += this.POINTS.BOWLING.FIVE_WICKETS;

    return points;
  }

  // Calculate fielding points
  static calculateFieldingPoints(fieldingData) {
    let points = 0;

    points += (fieldingData.catches || 0) * this.POINTS.FIELDING.CATCH;
    points += (fieldingData.stumpings || 0) * this.POINTS.FIELDING.STUMPING;
    points += (fieldingData.directThrows || 0) * this.POINTS.FIELDING.DIRECT_THROW;

    return points;
  }

  // Calculate total points for a player in a match
  static async calculatePlayerMatchPoints(playerId, matchId) {
    try {
      const matchDoc = await getDoc(doc(db, 'matches', matchId));
      if (!matchDoc.exists()) {
        throw new Error('Match not found');
      }

      const match = matchDoc.data();
      let totalPoints = 0;

      // Match participation points
      totalPoints += this.POINTS.MATCH.PLAYED;

      // Process batting
      if (match.scorecard) {
        const battingData = this.findPlayerBattingData(match.scorecard, playerId);
        if (battingData) {
          totalPoints += this.calculateBattingPoints(battingData);
        }

        const bowlingData = this.findPlayerBowlingData(match.scorecard, playerId);
        if (bowlingData) {
          totalPoints += this.calculateBowlingPoints(bowlingData);
        }

        const fieldingData = this.findPlayerFieldingData(match.scorecard, playerId);
        if (fieldingData) {
          totalPoints += this.calculateFieldingPoints(fieldingData);
        }
      }

      // Save points to database
      await this.savePlayerMatchPoints(playerId, matchId, totalPoints);

      return totalPoints;
    } catch (error) {
      console.error('Error calculating player match points:', error);
      throw error;
    }
  }

  // Calculate user points for a match
  static async calculateUserMatchPoints(userId, matchId) {
    try {
      const userTeam = await this.getUserTeam(userId, matchId);
      let totalPoints = 0;

      for (const player of userTeam.players) {
        let playerPoints = await this.calculatePlayerMatchPoints(player.playerId, matchId);

        // Apply captain/vice-captain multipliers
        if (player.isCaptain) {
          playerPoints *= this.POINTS.MULTIPLIERS.CAPTAIN;
        } else if (player.isViceCaptain) {
          playerPoints *= this.POINTS.MULTIPLIERS.VICE_CAPTAIN;
        }

        totalPoints += playerPoints;
      }

      // Save user match points
      await this.saveUserMatchPoints(userId, matchId, totalPoints);

      return totalPoints;
    } catch (error) {
      console.error('Error calculating user match points:', error);
      throw error;
    }
  }

  // Helper methods
  static async savePlayerMatchPoints(playerId, matchId, points) {
    try {
      await setDoc(doc(db, 'playerPoints', `${playerId}_${matchId}`), {
        playerId,
        matchId,
        points,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error saving player match points:', error);
      throw error;
    }
  }

  static async saveUserMatchPoints(userId, matchId, points) {
    try {
      await setDoc(doc(db, 'userMatchPoints', `${userId}_${matchId}`), {
        userId,
        matchId,
        points,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error saving user match points:', error);
      throw error;
    }
  }

  static async getUserTeam(userId, matchId) {
    // Implement based on your team storage structure
    // Return team data including captain and vice-captain
  }

  // Helper methods to find player data in scorecard
  static findPlayerBattingData(scorecard, playerId) {
    // Implement based on your scorecard structure
  }

  static findPlayerBowlingData(scorecard, playerId) {
    // Implement based on your scorecard structure
  }

  static findPlayerFieldingData(scorecard, playerId) {
    // Implement based on your scorecard structure
  }
}
