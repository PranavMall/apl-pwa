import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,  // Add this import
  query,
  orderBy,
  limit,
  runTransaction,
  where,
  writeBatch  // Add this import
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
    const tournamentMatches = [];
    
    // Add debug logging
    console.log('API Response:', JSON.stringify(data, null, 2));
    
    data.typeMatches?.forEach(typeMatch => {
      typeMatch.seriesMatches?.forEach(seriesMatch => {
        const seriesData = seriesMatch.seriesAdWrapper || seriesMatch;
        const matches = seriesData.matches || [];
        
        // Check specifically for ICC Champions Trophy, 2025
        if (seriesData.seriesName?.includes('ICC Champions Trophy, 2025')) {
          console.log(`Found ICC Champions Trophy  match: ${seriesData.seriesName}`);
          
          matches.forEach(match => {
            if (match.matchInfo) {
              console.log(`Processing match: ${match.matchInfo.matchId}`);
              const matchData = {
                matchId: match.matchInfo.matchId.toString(),
                matchInfo: {
                  ...match.matchInfo,
                  startDate: new Date(match.matchInfo.startDate),
                  team1: {
                    teamId: match.matchInfo.team1?.teamId,
                    teamName: match.matchInfo.team1?.teamName,
                    teamSName: match.matchInfo.team1?.teamSName,
                    score: match.matchScore?.team1Score?.inngs1?.score || null
                  },
                  team2: {
                    teamId: match.matchInfo.team2?.teamId,
                    teamName: match.matchInfo.team2?.teamName,
                    teamSName: match.matchInfo.team2?.teamSName,
                    score: match.matchScore?.team2Score?.inngs1?.score || null
                  },
                  status: match.matchInfo.status,
                  state: match.matchInfo.state
                },
                seriesId: seriesData.seriesId,
                seriesName: seriesData.seriesName
              };
              tournamentMatches.push(this.validateAndCleanObject(matchData));
            }
          });
        }
      });
    });

    console.log(`Total tournament matches found: ${tournamentMatches.length}`);
    return tournamentMatches;
  } catch (error) {
    console.error('Error fetching matches:', error);
    throw error;
  }
}

  // Add this to cricketService.js for recalculateAppPlayerStats
static async recalculateAllPlayerStats() {
  try {
    console.log('Starting recalculation of all player stats...');

    // Get all matches - including older ones from the Pakistan series
    const matchesRef = collection(db, 'matches');
    const matchesQuery = query(
      matchesRef,
      orderBy('matchInfo.startDate', 'asc')
    );

    const matchesSnapshot = await getDocs(matchesQuery);
    console.log(`Found ${matchesSnapshot.size} matches to process`);

    // Process each match
    let processedCount = 0;
    for (const matchDoc of matchesSnapshot.docs) {
      const matchData = matchDoc.data();
      console.log(`Processing match ${matchData.matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);

      try {
        // Recalculate points for this match
        await PointService.calculateMatchPoints(matchData.matchId, matchData.scorecard);
        processedCount++;
        console.log(`Successfully processed match ${matchData.matchId}`);
      } catch (error) {
        console.error(`Error processing match ${matchData.matchId}:`, error);
      }
    }

    console.log(`Completed processing ${processedCount} out of ${matchesSnapshot.size} matches`);
    return {
      success: true,
      totalMatches: matchesSnapshot.size,
      processedMatches: processedCount
    };
  } catch (error) {
    console.error('Error in recalculateAllPlayerStats:', error);
    throw error;
  }
}

// Updated restore function
static async restoreMatchPoints(matchIds) {
  try {
    console.log('Starting restoration of match points...', matchIds);

    const matchesRef = collection(db, 'matches');
    let processedCount = 0;

    for (const matchId of matchIds) {
      try {
        // Get existing match data
        const matchQuery = query(
          matchesRef,
          where('matchId', '==', matchId)
        );
        const matchSnapshot = await getDocs(matchQuery);
        
        if (matchSnapshot.empty) {
          console.log(`Match ${matchId} not found`);
          continue;
        }

        const matchDoc = matchSnapshot.docs[0];
        const matchData = matchDoc.data();

        console.log(`Processing match ${matchId}: ${matchData.matchInfo?.team1?.teamName} vs ${matchData.matchInfo?.team2?.teamName}`);

        // Calculate points
        await PointService.calculateMatchPoints(matchId, matchData.scorecard);
        processedCount++;
        console.log(`Successfully processed match ${matchId}`);
      } catch (error) {
        console.error(`Error processing match ${matchId}:`, error);
      }
    }

    console.log(`Completed processing ${processedCount} matches`);
    return {
      success: true,
      processedMatches: processedCount
    };
  } catch (error) {
    console.error('Error restoring match points:', error);
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

static processBatsmenData(batsmenData) {
  if (!batsmenData) return [];
  
  return Object.values(batsmenData).map(batsman => {
    // Create consistent player identification
    const playerName = batsman.batName;
    const playerDocId = this.createPlayerDocId(playerName);
    
    return {
      id: playerDocId,  // Add this for database consistency
      name: playerName, // Keep the original name for display
      runs: parseInt(batsman.runs) || 0,
      balls: parseInt(batsman.balls) || 0,
      fours: parseInt(batsman.fours) || 0,
      sixes: parseInt(batsman.sixes) || 0,
      strikeRate: parseFloat(batsman.strikeRate) || 0,
      dismissal: batsman.outDesc || '',
      isCaptain: batsman.isCaptain || false,
      isKeeper: batsman.isKeeper || false
    };
  });
}

static processBowlersData(bowlersData) {
  if (!bowlersData) return [];
  
  return Object.values(bowlersData).map(bowler => {
    // Create consistent player identification
    const playerName = bowler.bowlName;
    const playerDocId = this.createPlayerDocId(playerName);
    
    return {
      id: playerDocId,  // Add this for database consistency
      name: playerName, // Keep the original name for display
      overs: parseFloat(bowler.overs) || 0,
      maidens: parseInt(bowler.maidens) || 0,
      runs: parseInt(bowler.runs) || 0,
      wickets: parseInt(bowler.wickets) || 0,
      economy: parseFloat(bowler.economy) || 0,
      extras: (parseInt(bowler.no_balls) || 0) + (parseInt(bowler.wides) || 0),
      isCaptain: bowler.isCaptain || false
    };
  });
}

static processTeamInnings(inningsData, teamInfo) {
  if (!inningsData || !teamInfo) return null;

  const scoreDetails = inningsData.scoreDetails;
  const batsmenData = inningsData.batTeamDetails.batsmenData;
  const bowlersData = inningsData.bowlTeamDetails.bowlersData;

  return {
    teamId: teamInfo.id,
    teamName: teamInfo.name,
    teamShortName: teamInfo.shortName,
    score: `${scoreDetails.runs}/${scoreDetails.wickets}`,
    overs: scoreDetails.overs.toString(),
    runRate: scoreDetails.runRate.toString(),
    batsmen: this.processBatsmenData(batsmenData),
    bowlers: this.processBowlersData(bowlersData),
    extras: inningsData.extrasData || {}
  };
}

// Helper method to process dismissals and fielding points
static processFieldingStats(scorecard) {
  const fieldingStats = new Map();

  // Process both innings
  [scorecard.team1, scorecard.team2].forEach(team => {
    if (!team?.batsmen) return;

    team.batsmen.forEach(batsman => {
      if (!batsman.dismissal) return;

      // Extract fielder names from dismissals
      const catchMatch = batsman.dismissal.match(/c\s+([^b]+)b/);
      const stumpMatch = batsman.dismissal.match(/st\s+([^b]+)b/);

      if (catchMatch) {
        const fielderName = catchMatch[1].trim();
        const fielderId = this.createPlayerDocId(fielderName);
        
        if (!fieldingStats.has(fielderId)) {
          fieldingStats.set(fielderId, {
            name: fielderName,
            id: fielderId,
            catches: 0,
            stumpings: 0,
            runouts: 0
          });
        }
        fieldingStats.get(fielderId).catches++;
      }

      if (stumpMatch) {
        const stumperName = stumpMatch[1].trim();
        const stumperId = this.createPlayerDocId(stumperName);
        
        if (!fieldingStats.has(stumperId)) {
          fieldingStats.set(stumperId, {
            name: stumperName,
            id: stumperId,
            catches: 0,
            stumpings: 0,
            runouts: 0
          });
        }
        fieldingStats.get(stumperId).stumpings++;
      }
    });
  });

  return Array.from(fieldingStats.values());
}



  static formatScore(scoreDetails) {
    if (!scoreDetails) return '';
    const wickets = scoreDetails.wickets || 0;
    const runs = scoreDetails.runs || 0;
    return `${runs}/${wickets}`;
  }

// In cricketService.js

// Modified syncMatchData function in cricketService.js to handle abandoned matches
static async syncMatchData() {
  try {
    console.log('Starting match data sync...');
    const matches = await this.fetchRecentMatches();
    console.log(`Found ${matches.length} matches to sync`);

    const syncResults = [];
    for (const match of matches) {
      try {
        console.log(`Processing match ${match.matchId}`);
        
        // Check if match is abandoned before fetching scorecard
        const isMatchAbandoned = match.matchInfo.state === 'Abandon' || 
                               match.matchInfo.status?.toLowerCase().includes('abandon');
        
        if (isMatchAbandoned) {
          console.log(`Match ${match.matchId} was abandoned - storing basic info without scorecard`);
          
          // Create minimal match data for abandoned matches
          const abandonedMatchData = {
            matchId: match.matchId,
            lastUpdated: new Date().toISOString(),
            matchInfo: match.matchInfo,
            seriesId: match.seriesId,
            seriesName: match.seriesName,
            isAbandoned: true,
            scorecard: {
              matchId: match.matchId,
              matchStatus: 'Match abandoned',
              isAbandoned: true
            }
          };
          
          // Save to Firebase without validation
          const matchDoc = doc(db, 'matches', match.matchId.toString());
          await setDoc(matchDoc, abandonedMatchData, { merge: true });
          
          syncResults.push({
            matchId: match.matchId,
            status: 'success',
            pointsCalculated: false,
            abandoned: true
          });
          
          continue; // Skip to next match
        }
        
        // For non-abandoned matches, continue with normal processing
        const processedScorecard = await this.fetchScorecard(match.matchId);
        
        // Add detailed validation logging
        console.log('Validating scorecard response for match:', match.matchId);
        if (!processedScorecard) {
          console.error('Scorecard response is null or undefined');
          throw new Error('Failed to fetch scorecard');
        }

        // Validate the processed scorecard structure
        if (!processedScorecard.team1 || !processedScorecard.team2) {
          console.error('Missing team data in processed scorecard:', JSON.stringify(processedScorecard, null, 2));
          throw new Error('Invalid scorecard data structure - missing team data');
        }

        // Validate team data structure
        const validateTeamData = (team, teamNumber) => {
          if (!team.batsmen || !team.bowlers) {
            console.error(`Missing batsmen or bowlers data in team${teamNumber}:`, team);
            throw new Error(`Invalid team${teamNumber} data structure - missing player data`);
          }
        };

        validateTeamData(processedScorecard.team1, 1);
        validateTeamData(processedScorecard.team2, 2);

        // Update match data in Firebase
        await this.updateMatchInFirebase(match, processedScorecard);
        
        // Calculate and store points
        try {
          console.log(`Starting points calculation for match ${match.matchId}`);
          await PointService.calculateMatchPoints(match.matchId, processedScorecard);
          console.log(`Successfully calculated points for match ${match.matchId}`);

          syncResults.push({
            matchId: match.matchId,
            status: 'success',
            pointsCalculated: true
          });
        } catch (pointsError) {
          console.error(`Error calculating points for match ${match.matchId}:`, pointsError);
          syncResults.push({
            matchId: match.matchId,
            status: 'partial',
            error: `Points calculation failed: ${pointsError.message}`,
            pointsCalculated: false
          });
        }
      } catch (matchError) {
        console.error(`Failed to sync match ${match.matchId}:`, matchError);
        syncResults.push({
          matchId: match.matchId,
          status: 'failed',
          error: matchError.message,
          pointsCalculated: false
        });
      }
    }

    const successCount = syncResults.filter(r => r.status === 'success').length;
    const failedCount = syncResults.filter(r => r.status === 'failed').length;
    const partialCount = syncResults.filter(r => r.status === 'partial').length;
    const abandonedCount = syncResults.filter(r => r.abandoned).length;

    return {
      success: true,
      summary: {
        total: matches.length,
        success: successCount,
        failed: failedCount,
        partial: partialCount,
        abandoned: abandonedCount
      },
      matchesSynced: syncResults
    };
  } catch (error) {
    console.error('Error in syncMatchData:', error);
    throw error;
  }
}
  // Add these helper methods to cricketService.js

static findPlayerBattingData(scorecard, playerName) {
  // Check both teams
  const teams = [scorecard.team1, scorecard.team2];
  
  for (const team of teams) {
    if (!team?.batsmen) continue;
    
    const batsman = Object.values(team.batsmen).find(b => b.name === playerName);
    if (batsman) {
      return {
        runs: parseInt(batsman.runs) || 0,
        balls: parseInt(batsman.balls) || 0,
        fours: parseInt(batsman.fours) || 0,
        sixes: parseInt(batsman.sixes) || 0,
        outDesc: batsman.dismissal || ''
      };
    }
  }
  
  return null;
}

static findPlayerBowlingData(scorecard, playerName) {
  // Check both teams
  const teams = [scorecard.team1, scorecard.team2];
  
  for (const team of teams) {
    if (!team?.bowlers) continue;
    
    const bowler = Object.values(team.bowlers).find(b => b.name === playerName);
    if (bowler) {
      return {
        wickets: parseInt(bowler.wickets) || 0,
        maidens: parseInt(bowler.maidens) || 0,
        runs: parseInt(bowler.runs) || 0,
        overs: parseFloat(bowler.overs) || 0
      };
    }
  }
  
  return null;
}

static findPlayerFieldingData(scorecard, playerName) {
  let fieldingData = {
    catches: 0,
    stumpings: 0,
    directThrows: 0
  };
  
  // Check both teams
  const teams = [scorecard.team1, scorecard.team2];
  
  for (const team of teams) {
    if (!team?.batsmen) continue;
    
    Object.values(team.batsmen).forEach(batsman => {
      if (!batsman.dismissal) return;
      
      if (batsman.dismissal.includes(`c ${playerName}`)) {
        fieldingData.catches++;
      } else if (batsman.dismissal.includes(`st ${playerName}`)) {
        fieldingData.stumpings++;
      }
    });
  }
  
  return fieldingData;
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
  
  // Process team1 players
  if (scorecard.team1) {
    // Process batsmen
    if (scorecard.team1.batsmen) {
      Object.values(scorecard.team1.batsmen).forEach(batsman => {
        if (batsman.name) {
          players.add({
            id: this.createPlayerDocId(batsman.name),
            name: batsman.name
          });
        }
      });
    }
    
    // Process bowlers
    if (scorecard.team1.bowlers) {
      Object.values(scorecard.team1.bowlers).forEach(bowler => {
        if (bowler.name) {
          players.add({
            id: this.createPlayerDocId(bowler.name),
            name: bowler.name
          });
        }
      });
    }
  }

  // Process team2 players
  if (scorecard.team2) {
    // Process batsmen
    if (scorecard.team2.batsmen) {
      Object.values(scorecard.team2.batsmen).forEach(batsman => {
        if (batsman.name) {
          players.add({
            id: this.createPlayerDocId(batsman.name),
            name: batsman.name
          });
        }
      });
    }
    
    // Process bowlers
    if (scorecard.team2.bowlers) {
      Object.values(scorecard.team2.bowlers).forEach(bowler => {
        if (bowler.name) {
          players.add({
            id: this.createPlayerDocId(bowler.name),
            name: bowler.name
          });
        }
      });
    }
  }

  return Array.from(players);
}
  
  
static async getMatchesFromFirebase() {
  try {
    const matchesRef = collection(db, 'matches');
    
    // Remove the limit to get all matches and add ordering
    const q = query(
      matchesRef,
      where('matchInfo.seriesName', '==', 'ICC Champions Trophy, 2025'),
      orderBy('matchInfo.startDate', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const matches = [];

    querySnapshot.forEach((doc) => {
      // Add additional logging to debug match data
      console.log(`Processing match document ${doc.id}:`, doc.data());
      
      const matchData = doc.data();
      // Only add matches that have complete data
      if (matchData.matchInfo && matchData.scorecard) {
        matches.push({
          matchId: doc.id,
          ...matchData
        });
      } else {
        console.warn(`Skipping match ${doc.id} due to incomplete data`);
      }
    });

    console.log(`Found ${matches.length} matches in Firebase`);
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

  static processTeamData(teamData, processedStats = {}) {
  if (!teamData || typeof teamData !== 'object') return processedStats;

  const stats = { ...processedStats };

  // Process batting data
  if (teamData.batsmen) {
    Object.values(teamData.batsmen).forEach(batsman => {
      if (!batsman?.name) return;

      const playerName = batsman.name;
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

      // Update match count only once
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
  if (teamData.bowlers) {
    Object.values(teamData.bowlers).forEach(bowler => {
      if (!bowler?.name) return;

      const playerName = bowler.name;
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

      // Update match count only once
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

  return stats;
}

static async updatePlayerStats(matchId, scorecard, dbInstance = db) {
  try {
    console.log('Starting player stats update for match:', matchId);
    
    if (!scorecard?.team1 || !scorecard?.team2) {
      console.error('Invalid scorecard data structure:', scorecard);
      throw new Error('Invalid scorecard data structure');
    }

    // Process both teams
    let combinedStats = {};
    combinedStats = this.processTeamData(scorecard.team1, combinedStats);
    combinedStats = this.processTeamData(scorecard.team2, combinedStats);

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
