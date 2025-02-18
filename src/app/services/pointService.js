// src/services/pointService.js
"use client";

import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';

export class PointService {
  // Keep existing point configuration
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
      console.log('Starting points calculation for match:', matchId);
      
      // Initialize map to store player points
      const playerPoints = new Map();

      // Process both innings
      for (const inning of scorecard.scoreCard) {
        // Process batting performances
        if (inning.batTeamDetails?.batsmenData) {
          for (const batsman of Object.values(inning.batTeamDetails.batsmenData)) {
            const playerName = batsman.batName;
            if (!playerName) continue;

            let battingPoints = this.calculateBattingPoints({
              runs: parseInt(batsman.runs) || 0,
              fours: parseInt(batsman.fours) || 0,
              sixes: parseInt(batsman.sixes) || 0,
              balls: parseInt(batsman.balls) || 0,
              outDesc: batsman.outDesc
            });

            // Initialize or update player points
            if (!playerPoints.has(playerName)) {
              playerPoints.set(playerName, {
                matchId,
                name: playerName,
                points: 0,
                performance: {
                  batting: { runs: 0, fours: 0, sixes: 0 },
                  bowling: { wickets: 0, maidens: 0, runs: 0 },
                  fielding: { catches: 0, stumpings: 0, runouts: 0 }
                }
              });
            }

            const playerData = playerPoints.get(playerName);
            playerData.points += battingPoints;
            playerData.performance.batting = {
              runs: parseInt(batsman.runs) || 0,
              fours: parseInt(batsman.fours) || 0,
              sixes: parseInt(batsman.sixes) || 0
            };
          }
        }

        // Process bowling performances
        if (inning.bowlTeamDetails?.bowlersData) {
          for (const bowler of Object.values(inning.bowlTeamDetails.bowlersData)) {
            const playerName = bowler.bowlName;
            if (!playerName) continue;

            let bowlingPoints = this.calculateBowlingPoints({
              wickets: parseInt(bowler.wickets) || 0,
              maidens: parseInt(bowler.maidens) || 0,
              runs: parseInt(bowler.runs) || 0,
              overs: parseFloat(bowler.overs) || 0
            });

            if (!playerPoints.has(playerName)) {
              playerPoints.set(playerName, {
                matchId,
                name: playerName,
                points: 0,
                performance: {
                  batting: { runs: 0, fours: 0, sixes: 0 },
                  bowling: { wickets: 0, maidens: 0, runs: 0 },
                  fielding: { catches: 0, stumpings: 0, runouts: 0 }
                }
              });
            }

            const playerData = playerPoints.get(playerName);
            playerData.points += bowlingPoints;
            playerData.performance.bowling = {
              wickets: parseInt(bowler.wickets) || 0,
              maidens: parseInt(bowler.maidens) || 0,
              runs: parseInt(bowler.runs) || 0
            };
          }
        }

        // Process fielding performances
        if (inning.batTeamDetails?.batsmenData) {
          for (const batsman of Object.values(inning.batTeamDetails.batsmenData)) {
            if (!batsman.outDesc) continue;

            // Extract fielder name from dismissal
            const catchMatch = batsman.outDesc.match(/c\s+([^b]+)b/);
            const stumpMatch = batsman.outDesc.match(/st\s+([^b]+)b/);

            if (catchMatch) {
              const fielderName = catchMatch[1].trim();
              if (!playerPoints.has(fielderName)) {
                playerPoints.set(fielderName, {
                  matchId,
                  name: fielderName,
                  points: 0,
                  performance: {
                    batting: { runs: 0, fours: 0, sixes: 0 },
                    bowling: { wickets: 0, maidens: 0, runs: 0 },
                    fielding: { catches: 0, stumpings: 0, runouts: 0 }
                  }
                });
              }
              const playerData = playerPoints.get(fielderName);
              playerData.points += this.POINTS.FIELDING.CATCH;
              playerData.performance.fielding.catches++;
            }

            if (stumpMatch) {
              const stumperName = stumpMatch[1].trim();
              if (!playerPoints.has(stumperName)) {
                playerPoints.set(stumperName, {
                  matchId,
                  name: stumperName,
                  points: 0,
                  performance: {
                    batting: { runs: 0, fours: 0, sixes: 0 },
                    bowling: { wickets: 0, maidens: 0, runs: 0 },
                    fielding: { catches: 0, stumpings: 0, runouts: 0 }
                  }
                });
              }
              const playerData = playerPoints.get(stumperName);
              playerData.points += this.POINTS.FIELDING.STUMPING;
              playerData.performance.fielding.stumpings++;
            }
          }
        }
      }

      // Store points for each player
      const storePromises = Array.from(playerPoints.values()).map(async (playerData) => {
        await this.storePlayerMatchPoints(playerData);
      });

      await Promise.all(storePromises);
      console.log('Completed points calculation and storage for match:', matchId);
      
      return true;
    } catch (error) {
      console.error('Error calculating match points:', error);
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
    if (battingData.runs === 0 && battingData.balls > 0 && battingData.outDesc) {
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

  static async storePlayerMatchPoints(playerData) {
    try {
      // Create a unique ID for the player-match combination
      const pointsDocId = `${playerData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}_${playerData.matchId}`;
      const pointsDocRef = doc(db, 'playerPoints', pointsDocId);

      // Store points with timestamp
      await setDoc(pointsDocRef, {
        ...playerData,
        timestamp: new Date().toISOString()
      });

      // Update player's total points in players collection
      const playerDocId = playerData.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const playerDocRef = doc(db, 'players', playerDocId);

      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerDocRef);
        if (playerDoc.exists()) {
          const currentTotal = playerDoc.data().totalFantasyPoints || 0;
          transaction.update(playerDocRef, {
            totalFantasyPoints: currentTotal + playerData.points,
            lastUpdated: new Date().toISOString()
          });
        }
      });

      console.log(`Stored ${playerData.points} points for player ${playerData.name} in match ${playerData.matchId}`);
      return true;
    } catch (error) {
      console.error('Error storing player match points:', error);
      throw error;
    }
  }
}
