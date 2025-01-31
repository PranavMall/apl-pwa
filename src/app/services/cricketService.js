import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  runTransaction
} from 'firebase/firestore';
import { PlayerService } from './playerService';

export class cricketService {
  // Static utility method for object validation
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

  // Static method to fetch recent matches
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
      
      data.typeMatches?.forEach(typeMatch => {
        typeMatch.seriesMatches?.forEach(seriesMatch => {
          const seriesData = seriesMatch.seriesAdWrapper || seriesMatch;
          const matches = seriesData.matches || [];
          
          if (seriesData.seriesName?.toLowerCase().includes('sa20') || 
              seriesData.seriesName?.toLowerCase().includes('sa20, 2025')) {
            
            matches.forEach(match => {
              if (match.matchInfo) {
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

      return sa20Matches;
    } catch (error) {
      console.error('Error fetching matches:', error);
      throw error;
    }
  }

  // Static method to fetch match scorecard
  static async fetchScorecard(matchId) {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
      },
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

      // Transform the API response structure
      const processInnings = (inning) => {
        const batsmen = Object.values(inning.batTeamDetails.batsmenData || {}).map(bat => ({
          name: bat.batName,
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          strikeRate: bat.strikeRate,
          dismissal: bat.outDesc,
          isBatting: !bat.outDesc
        }));

        const bowlers = Object.values(inning.bowlTeamDetails.bowlersData || {}).map(bowl => ({
          name: bowl.bowlName,
          overs: bowl.overs,
          maidens: bowl.maidens,
          runs: bowl.runs,
          wickets: bowl.wickets,
          economy: bowl.economy,
          extras: {
            wides: bowl.wides,
            noBalls: bowl.no_balls
          }
        }));

        return {
          teamId: inning.batTeamDetails.batTeamId,
          teamName: inning.batTeamDetails.batTeamName,
          shortName: inning.batTeamDetails.batTeamShortName,
          batsmen,
          bowlers,
          score: `${inning.scoreDetails.runs}/${inning.scoreDetails.wickets}`,
          overs: inning.scoreDetails.overs,
          runRate: inning.scoreDetails.runRate,
          extras: inning.extrasData
        };
      };

      const scorecard = {
        team1: processInnings(data.scoreCard[0]),
        team2: processInnings(data.scoreCard[1]),
        matchStatus: data.matchHeader.status,
        result: data.matchHeader.result,
        toss: data.matchHeader.tossResults,
        playerOfMatch: data.matchHeader.playersOfTheMatch?.[0]?.name
      };

      return this.validateAndCleanObject(scorecard);
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
      throw error;
    }
  }

  // Static method to sync match data
static async syncMatchData() {
  try {
    console.log('Starting match data sync...');
    const matches = await this.fetchRecentMatches();
    console.log(`Found ${matches.length} matches to sync`);

    const syncResults = [];

    for (const match of matches) {
      try {
        const scorecard = await this.fetchScorecard(match.matchId);
        
        // Add additional validation
        if (!scorecard || !scorecard.team1 || !scorecard.team2) {
          console.error(`Invalid scorecard for match ${match.matchId}`, scorecard);
          syncResults.push({
            matchId: match.matchId,
            status: 'failed',
            error: 'Invalid scorecard structure'
          });
          continue;
        }

        // Ensure batsmen and bowlers are arrays
        const team1Batsmen = Array.isArray(scorecard.team1.batsmen) 
          ? scorecard.team1.batsmen 
          : [];
        const team1Bowlers = Array.isArray(scorecard.team1.bowlers) 
          ? scorecard.team1.bowlers 
          : [];
        const team2Batsmen = Array.isArray(scorecard.team2.batsmen) 
          ? scorecard.team2.batsmen 
          : [];
        const team2Bowlers = Array.isArray(scorecard.team2.bowlers) 
          ? scorecard.team2.bowlers 
          : [];

        // Update match details in Firebase with comprehensive data
        const matchDoc = doc(db, 'matches', match.matchId.toString());
        await setDoc(matchDoc, {
          matchId: match.matchId,
          seriesId: match.seriesId,
          seriesName: match.seriesName,
          matchInfo: {
            ...match.matchInfo,
            team1: {
              ...match.matchInfo.team1,
              players: team1Batsmen.map(b => b.name || 'Unknown')
            },
            team2: {
              ...match.matchInfo.team2,
              players: team2Batsmen.map(b => b.name || 'Unknown')
            }
          },
          scorecard: scorecard,
          lastUpdated: new Date().toISOString()
        }, { merge: true });

        // Update player stats from match scorecard
        await this.updatePlayerStatsFromMatch(match.matchId, {
          team1: {
            ...scorecard.team1,
            batsmen: team1Batsmen,
            bowlers: team1Bowlers
          },
          team2: {
            ...scorecard.team2,
            batsmen: team2Batsmen,
            bowlers: team2Bowlers
          }
        });
        
        syncResults.push({
          matchId: match.matchId,
          status: 'success'
        });
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

  // Static method to update player stats from match
  static async updatePlayerStatsFromMatch(matchId, scorecard) {
  try {
    console.log('Starting player stats update for match:', matchId);

    const updatePlayerStats = async (playerName, teamData) => {
      try {
        // Create a unique player document ID
        const playerDocId = playerName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const playerRef = doc(db, 'players', playerDocId);

        await runTransaction(db, async (transaction) => {
          const playerDoc = await transaction.get(playerRef);
          const currentStats = playerDoc.exists() ? playerDoc.data() : {};

          // Determine player role
          const role = await PlayerService.determineRole({
            name: playerName,
            // Add fallback checks
            battingStyle: teamData.batsmen?.find(b => b.name === playerName)?.battingStyle || '',
            bowlingStyle: teamData.bowlers?.find(b => b.name === playerName)?.bowlingStyle || ''
          });

          const stats = {
            name: playerName,
            teamId: teamData.teamId,
            role: role,
            matches: (currentStats.matches || 0) + 1,
            lastMatchId: matchId,
            lastUpdated: new Date().toISOString()
          };

          // Batting stats
          const battingData = teamData.batsmen?.find(b => b.name === playerName);
          if (battingData) {
            stats.runs = (currentStats.runs || 0) + parseInt(battingData.runs || 0);
            stats.balls = (currentStats.balls || 0) + parseInt(battingData.balls || 0);
            stats.fours = (currentStats.fours || 0) + parseInt(battingData.fours || 0);
            stats.sixes = (currentStats.sixes || 0) + parseInt(battingData.sixes || 0);

            // Milestone tracking
            stats.fifties = (currentStats.fifties || 0) + (battingData.runs >= 50 && battingData.runs < 100 ? 1 : 0);
            stats.hundreds = (currentStats.hundreds || 0) + (battingData.runs >= 100 ? 1 : 0);
          }

          // Bowling stats
          const bowlingData = teamData.bowlers?.find(b => b.name === playerName);
          if (bowlingData) {
            const wickets = parseInt(bowlingData.wickets || 0);
            const overs = parseFloat(bowlingData.overs || 0);
            const bowlingRuns = parseInt(bowlingData.runs || 0);

            stats.wickets = (currentStats.wickets || 0) + wickets;
            stats.bowlingBalls = (currentStats.bowlingBalls || 0) + Math.floor(overs) * 6 + (overs % 1) * 10;
            stats.bowlingRuns = (currentStats.bowlingRuns || 0) + bowlingRuns;
            stats.fiveWickets = (currentStats.fiveWickets || 0) + (wickets >= 5 ? 1 : 0);
          }

          // Calculate additional derived stats
          if (stats.matches > 0) {
            stats.battingAverage = stats.runs ? (stats.runs / stats.matches).toFixed(2) : '0.00';
            stats.strikeRate = stats.balls ? ((stats.runs / stats.balls) * 100).toFixed(2) : '0.00';
            stats.bowlingAverage = stats.wickets ? (stats.bowlingRuns / stats.wickets).toFixed(2) : '0.00';
            stats.economy = stats.bowlingBalls ? ((stats.bowlingRuns / stats.bowlingBalls) * 6).toFixed(2) : '0.00';
          }

          await transaction.set(playerRef, stats, { merge: true });
        });
      } catch (error) {
        console.error(`Error processing stats for player ${playerName}:`, error);
        throw error;
      }
    };

    // Process players from both teams
    const processTeamPlayers = async (teamData) => {
      if (!teamData.batsmen || !teamData.bowlers) {
        console.error('Invalid team data:', teamData);
        return;
      }

      const allPlayers = [
        ...teamData.batsmen.map(b => b.name).filter(Boolean), 
        ...teamData.bowlers.map(b => b.name).filter(Boolean)
      ];

      for (const playerName of new Set(allPlayers)) {
        await PlayerService.updatePlayerInDatabase({
          id: playerName,
          name: playerName,
          battingStyle: teamData.batsmen?.find(b => b.name === playerName)?.battingStyle,
          bowlingStyle: teamData.bowlers?.find(b => b.name === playerName)?.bowlingStyle,
          keeper: false,
          captain: false
        }, teamData.teamId, matchId);

        await updatePlayerStats(playerName, teamData);
      }
    };

    // Process both team's players
    await processTeamPlayers(scorecard.team1);
    await processTeamPlayers(scorecard.team2);

    console.log('Successfully updated player stats for match', matchId);
    return true;
  } catch (error) {
    console.error('Error updating player stats:', error);
    throw error;
  }
}

  // Static method to get matches from Firebase
  static async getMatchesFromFirebase() {
    try {
      const matchesRef = collection(db, 'matches');
      const matchesQuery = query(
        matchesRef,
        orderBy('lastUpdated', 'desc'),
        limit(10)
      );

      const querySnapshot = await getDocs(matchesQuery);
      const matches = [];

      querySnapshot.forEach((doc) => {
        matches.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return matches;
    } catch (error) {
      console.error('Error fetching matches from Firebase:', error);
      throw error;
    }
  }
}
