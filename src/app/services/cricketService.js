import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  runTransaction,
  where
} from 'firebase/firestore';
import { PlayerService } from './playerService';
import { PointService } from './pointService';

export class cricketService {
  static validateAndCleanObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      // Remove undefined values
      if (value === undefined) continue;
      
      // Recursively clean nested objects
      if (value && typeof value === 'object') {
        cleaned[key] = this.validateAndCleanObject(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  // Helper method to create consistent player document ID
  static createPlayerDocId(playerName) {
    return playerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  static async fetchRecentMatches() {
    if (!process.env.NEXT_PUBLIC_RAPID_API_KEY) {
      throw new Error('RAPID_API_KEY is not configured');
    }

    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
      },
    };

    try {
      const response = await fetch(
        'https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent',
        options
      );
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }

      const data = await response.json();
      const sa20Matches = [];
      
      // Add debug logging
      console.log('API Response:', JSON.stringify(data, null, 2));
      
      data.typeMatches?.forEach(typeMatch => {
        typeMatch.seriesMatches?.forEach(seriesMatch => {
          const seriesData = seriesMatch.seriesAdWrapper || seriesMatch;
          const matches = seriesData.matches || [];
          
          if (seriesData.seriesName?.toLowerCase().includes('sa20') || 
              seriesData.seriesName?.toLowerCase().includes('sa20, 2025')) {
            console.log(`Found SA20 series: ${seriesData.seriesName}`);
            
            matches.forEach(match => {
              if (match.matchInfo) {
                console.log(`Processing match: ${match.matchInfo.matchId}`);
                const matchData = {
                  matchId: match.matchInfo.matchId.toString(),
                  matchInfo: {
                    ...match.matchInfo,
                    team1: {
                      ...match.matchInfo.team1,
                      score: match.matchScore?.team1Score?.inngs1 || null
                    },
                    team2: {
                      ...match.matchInfo.team2,
                      score: match.matchScore?.team2Score?.inngs1 || null
                    }
                  },
                  seriesId: seriesData.seriesId,
                  seriesName: seriesData.seriesName
                };
                sa20Matches.push(this.validateAndCleanObject(matchData));
              }
            });
          }
        });
      });

      console.log(`Total SA20 matches found: ${sa20Matches.length}`);
      return sa20Matches;
    } catch (error) {
      console.error('Error fetching matches:', error);
      throw error;
    }
  }

  static async updateMatchInFirebase(matchData, scorecard, dbInstance = db) {
    try {
      const matchDoc = doc(dbInstance, 'matches', matchData.matchId.toString());
      
      const matchDocument = this.validateAndCleanObject({
        matchId: matchData.matchId,
        lastUpdated: new Date().toISOString(),
        matchInfo: {
          ...matchData.matchInfo,
          status: scorecard.matchStatus,
          result: scorecard.result,
          toss: scorecard.toss,
          playerOfMatch: scorecard.playerOfMatch,
          team1: {
            ...matchData.matchInfo.team1,
            teamId: scorecard.team1.teamId,
            score: scorecard.team1.score,
            overs: scorecard.team1.overs,
            runRate: scorecard.team1.runRate
          },
          team2: {
            ...matchData.matchInfo.team2,
            teamId: scorecard.team2.teamId,
            score: scorecard.team2.score,
            overs: scorecard.team2.overs,
            runRate: scorecard.team2.runRate
          }
        },
        scorecard
      });

      console.log('Saving match document:', matchDocument);
      await setDoc(matchDoc, matchDocument, { merge: true });
      return true;
    } catch (error) {
      console.error(`Error updating match ${matchData.matchId} in Firebase:`, error);
      throw error;
    }
  }

  static async fetchScorecard(matchId) {
    if (!process.env.NEXT_PUBLIC_RAPID_API_KEY) {
      throw new Error('RAPID_API_KEY is not configured');
    }

    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com'
      }
    };

    try {
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`,
        options
      );

      if (!response.ok) {
        throw new Error(`Scorecard API responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      // Process and format scorecard data based on new API structure
      const scorecard = {
        matchId: matchId,
        matchStatus: data.matchHeader?.status || '',
        result: data.matchHeader?.result || '',
        toss: data.matchHeader?.tossResults?.decision 
          ? `${data.matchHeader.tossResults.tossWinnerName} chose to ${data.matchHeader.tossResults.decision}`
          : '',
        playerOfMatch: data.matchHeader?.playersOfTheMatch?.[0]?.name || '',
        team1: this.processTeamInnings(data.scoreCard?.[0], data.matchHeader?.team1),
        team2: this.processTeamInnings(data.scoreCard?.[1], data.matchHeader?.team2)
      };

      return this.validateAndCleanObject(scorecard);
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
      throw error;
    }
  }

  static processTeamInnings(inningsData, teamInfo) {
    if (!inningsData) return {};

    return {
      teamId: teamInfo?.id || inningsData?.batTeamDetails?.batTeamId,
      teamName: teamInfo?.name || inningsData?.batTeamDetails?.batTeamName || '',
      score: this.formatScore(inningsData?.scoreDetails),
      overs: inningsData?.scoreDetails?.overs?.toString() || '0',
      runRate: inningsData?.scoreDetails?.runRate?.toString() || '0',
      batsmen: this.processBatsmenNew(inningsData?.batTeamDetails?.batsmenData),
      bowlers: this.processBowlersNew(inningsData?.bowlTeamDetails?.bowlersData)
    };
  }

  static processBatsmenNew(batsmenData) {
    if (!batsmenData) return [];
    
    return Object.values(batsmenData).map(batsman => ({
      name: batsman.batName,
      runs: batsman.runs?.toString() || '0',
      balls: batsman.balls?.toString() || '0',
      fours: batsman.fours?.toString() || '0',
      sixes: batsman.sixes?.toString() || '0',
      strikeRate: batsman.strikeRate?.toString() || '0',
      dismissal: batsman.outDesc || ''
    }));
  }

  static processBowlersNew(bowlersData) {
    if (!bowlersData) return [];
    
    return Object.values(bowlersData).map(bowler => ({
      name: bowler.bowlName,
      overs: bowler.overs?.toString() || '0',
      maidens: bowler.maidens?.toString() || '0',
      runs: bowler.runs?.toString() || '0',
      wickets: bowler.wickets?.toString() || '0',
      economy: bowler.economy?.toString() || '0',
      extras: (bowler.no_balls + bowler.wides)?.toString() || '0'
    }));
  }

  static formatScore(scoreDetails) {
    if (!scoreDetails) return '';
    const wickets = scoreDetails.wickets || 0;
    const runs = scoreDetails.runs || 0;
    return `${runs}/${wickets}`;
  }

  

static async syncMatchData() {
  try {
    console.log('Starting match data sync...');
    const matches = await this.fetchRecentMatches();
    console.log(`Found ${matches.length} matches to sync`);

    const syncResults = [];
    for (const match of matches) {
      try {
        console.log(`Processing match ${match.matchId}`);
        const scorecard = await this.fetchScorecard(match.matchId);
        await this.updateMatchInFirebase(match, scorecard);
        // Add this line - Calculate fantasy points after updating match
      await PointService.calculateMatchPoints(match.matchId, scorecard);
        
        // Use the PlayerService method
        await PlayerService.updatePlayerStats(match.matchId, scorecard);
        
        // Add point calculation here
        await this.calculateMatchPoints(match.matchId, scorecard);
        
        syncResults.push({
          matchId: match.matchId,
          status: 'success'
        });
        
        console.log(`Successfully synced match ${match.matchId}`);
      } catch (error) {
        console.error(`Failed to sync match ${match.matchId}:`, error);
        syncResults.push({
          matchId: match.matchId,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return {
      success: true,
      matchesSynced: syncResults
    };
  } catch (error) {
    console.error('Error in syncMatchData:', error);
    throw error;
  }
}
  
  // Add new method for point calculations
static async calculateMatchPoints(matchId, scorecard) {
  try {
    console.log(`Calculating points for match ${matchId}`);
    
    // 1. Calculate points for all players in the match
    const players = this.getAllPlayersFromScorecard(scorecard);
    console.log('Players found in match:', players);

    for (const player of players) {
       // player.name comes from scorecard
      // Create ID consistently using the same method used in Players DB
      const playerId = this.createPlayerDocId(player.name);
      await PointService.calculatePlayerMatchPoints(playerId, player.name, matchId);
    }

    // 2. Get all users who have selected these players
    const userTeamsSnapshot = await getDocs(
      query(collection(db, 'userTeams'))
    );

    // 3. Calculate points for each user
    const userUpdatePromises = userTeamsSnapshot.docs.map(doc => {
      const userData = doc.data();
      return PointService.calculateUserMatchPoints(userData.userId, matchId);
    });

    await Promise.all(userUpdatePromises);
    console.log(`Points calculation completed for match ${matchId}`);
    return true;
  } catch (error) {
    console.error('Error calculating match points:', error);
    throw error;
  }
}

  // Helper method to get all players from scorecard
static getAllPlayersFromScorecard(scorecard) {
  const players = new Set();
  
  // Check if we have valid scorecard
  if (!scorecard || !scorecard.scoreCard) {
    console.log('Invalid scorecard structure:', scorecard);
    return [];
  }

  // Process each innings in the scorecard
  scorecard.scoreCard.forEach(innings => {
    // Get batsmen from batsmenData
    if (innings.batTeamDetails?.batsmenData) {
      Object.values(innings.batTeamDetails.batsmenData).forEach(batsman => {
        if (batsman.batName) {
          players.add({
            id: cricketService.createPlayerDocId(batsman.batName),
            name: batsman.batName
          });
        }
      });
    }

    // Get bowlers from bowlersData
    if (innings.bowlTeamDetails?.bowlersData) {
      Object.values(innings.bowlTeamDetails.bowlersData).forEach(bowler => {
        if (bowler.bowlName) {
          players.add({
            id: cricketService.createPlayerDocId(bowler.bowlName),
            name: bowler.bowlName
          });
        }
      });
    }
  });

  return Array.from(players);
}
  
  
  static async getMatchesFromFirebase() {
    try {
      const matchesRef = collection(db, 'matches');
      const q = query(
        matchesRef,
        orderBy('matchInfo.startDate', 'desc'),
        limit(10)  // Limit to last 10 matches, adjust as needed
      );

      const querySnapshot = await getDocs(q);
      const matches = [];

      querySnapshot.forEach((doc) => {
        matches.push({
          matchId: doc.id,
          ...doc.data()
        });
      });

      return matches;
    } catch (error) {
      console.error('Error fetching matches from Firebase:', error);
      throw error;
    }
  }

// Add this to cricketService.js

static processInningsData(inningsData, processedStats = {}) {
  if (!inningsData || typeof inningsData !== 'object') return processedStats;

  const stats = { ...processedStats };
  const { batTeamDetails, bowlTeamDetails } = inningsData;

  // Process batting data
  if (batTeamDetails?.batsmenData) {
    Object.values(batTeamDetails.batsmenData).forEach(batsman => {
      if (!batsman?.batName) return;

      const playerName = batsman.batName;
      if (!stats[playerName]) {
        stats[playerName] = {
          name: playerName,
          matches: 0,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          fifties: 0,
          hundreds: 0,
          wickets: 0,
          bowlingRuns: 0,
          bowlingBalls: 0,
          catches: 0,
          stumpings: 0,
          dismissals: 0
        };
      }

      // Update match count only once per innings
      if (!stats[playerName].matchCounted) {
        stats[playerName].matches++;
        stats[playerName].matchCounted = true;
      }

      // Batting stats
      stats[playerName].runs += parseInt(batsman.runs) || 0;
      stats[playerName].balls += parseInt(batsman.balls) || 0;
      stats[playerName].fours += parseInt(batsman.fours) || 0;
      stats[playerName].sixes += parseInt(batsman.sixes) || 0;

      // Check for milestone
      const runs = parseInt(batsman.runs) || 0;
      if (runs >= 50 && runs < 100) stats[playerName].fifties++;
      if (runs >= 100) stats[playerName].hundreds++;
    });
  }

  // Process bowling data
  if (bowlTeamDetails?.bowlersData) {
    Object.values(bowlTeamDetails.bowlersData).forEach(bowler => {
      if (!bowler?.bowlName) return;

      const playerName = bowler.bowlName;
      if (!stats[playerName]) {
        stats[playerName] = {
          name: playerName,
          matches: 0,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          fifties: 0,
          hundreds: 0,
          wickets: 0,
          bowlingRuns: 0,
          bowlingBalls: 0,
          catches: 0,
          stumpings: 0,
          dismissals: 0
        };
      }

      // Update match count only once per innings
      if (!stats[playerName].matchCounted) {
        stats[playerName].matches++;
        stats[playerName].matchCounted = true;
      }

      // Bowling stats
      stats[playerName].wickets += parseInt(bowler.wickets) || 0;
      stats[playerName].bowlingRuns += parseInt(bowler.runs) || 0;
      
      // Convert overs to balls
      const overs = parseFloat(bowler.overs) || 0;
      const oversInteger = Math.floor(overs);
      const oversFraction = overs % 1;
      const balls = (oversInteger * 6) + Math.round(oversFraction * 10);
      stats[playerName].bowlingBalls += balls;
    });
  }

  // Process dismissals
  if (batTeamDetails?.batsmenData) {
    Object.values(batTeamDetails.batsmenData).forEach(batsman => {
      if (!batsman?.outDesc) return;

      // Extract fielder name from dismissal
      const dismissal = batsman.outDesc;
      const catchMatch = dismissal.match(/c\s+([^b]+)b/);
      const stumpMatch = dismissal.match(/st\s+([^b]+)b/);

      if (catchMatch) {
        const fielderName = catchMatch[1].trim();
        if (stats[fielderName]) {
          stats[fielderName].catches++;
          stats[fielderName].dismissals++;
        }
      } else if (stumpMatch) {
        const stumperName = stumpMatch[1].trim();
        if (stats[stumperName]) {
          stats[stumperName].stumpings++;
          stats[stumperName].dismissals++;
        }
      }
    });
  }

  return stats;
}

static calculateFinalStats(stats) {
  return Object.entries(stats).map(([name, playerStats]) => {
    const { matchCounted, ...cleanStats } = playerStats;
    
    // Calculate averages and rates
    cleanStats.battingAverage = cleanStats.matches > 0 ? 
      (cleanStats.runs / cleanStats.matches).toFixed(2) : '0.00';
    
    cleanStats.strikeRate = cleanStats.balls > 0 ? 
      ((cleanStats.runs / cleanStats.balls) * 100).toFixed(2) : '0.00';
    
    cleanStats.bowlingAverage = cleanStats.wickets > 0 ? 
      (cleanStats.bowlingRuns / cleanStats.wickets).toFixed(2) : '0.00';
    
    cleanStats.economyRate = cleanStats.bowlingBalls > 0 ? 
      ((cleanStats.bowlingRuns / cleanStats.bowlingBalls) * 6).toFixed(2) : '0.00';

    return cleanStats;
  });
}

static async updatePlayerStats(matchId, scorecard, dbInstance = db) {
  try {
    console.log('Starting player stats update for match:', matchId);
    
    if (!scorecard?.scoreCard || !Array.isArray(scorecard.scoreCard)) {
      console.error('Invalid scorecard data structure:', scorecard);
      throw new Error('Invalid scorecard data structure');
    }

    // Process both innings
    let combinedStats = {};
    scorecard.scoreCard.forEach(innings => {
      combinedStats = this.processInningsData(innings, combinedStats);
    });

    // Calculate final stats and update database
    const finalStats = this.calculateFinalStats(combinedStats);
    
    // Update each player in the database
    const updatePromises = finalStats.map(async playerStats => {
      const playerDocId = this.createPlayerDocId(playerStats.name);
      const playerRef = doc(dbInstance, 'players', playerDocId);
      
      return runTransaction(dbInstance, async transaction => {
        const playerDoc = await transaction.get(playerRef);
        const currentStats = playerDoc.exists() ? playerDoc.data() : {};
        
        const updatedStats = {
          ...currentStats,
          ...playerStats,
          lastMatchId: matchId,
          lastUpdated: new Date().toISOString()
        };

        return transaction.set(playerRef, updatedStats, { merge: true });
      });
    });

    await Promise.all(updatePromises);
    console.log('Successfully updated all player stats');
    return true;
  } catch (error) {
    console.error('Error updating player stats:', error);
    throw error;
  }
}
}
