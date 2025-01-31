import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { PlayerService } from './playerService';  // Add this import

export class CricketService {
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
  
  class CricketService {
  constructor() {
    this.db = db;
  }

  // Helper method to create a consistent ID from player name
  createPlayerDocId(playerName) {
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
          
          // Debug logging for each series
          console.log('Processing series:', {
            id: seriesData.seriesId,
            name: seriesData.seriesName
          });
          
          // Updated condition to match SA20 series
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

  static async fetchScorecard(matchId) {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
      },
    };

    try {
      console.log(`Fetching scorecard for match ${matchId}`);
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`,
        options
      );

      if (!response.ok) {
        throw new Error(`Scorecard API responded with status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Raw scorecard data:', data);

      // Transform the new API response structure
      const processInnings = (inning) => {
        const batsmen = Object.values(inning.batTeamDetails.batsmenData || {}).map(bat => ({
          name: bat.batName,
          runs: bat.runs,
          balls: bat.balls,
          fours: bat.fours,
          sixes: bat.sixes,
          strikeRate: bat.strikeRate,
          dismissal: bat.outDesc,
          isBatting: !bat.outDesc // If there's no dismissal description, they're still batting
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

      console.log('Processed scorecard:', scorecard);
      return this.validateAndCleanObject(scorecard);
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
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

    // Update this method to be an async method with proper error handling
  async updatePlayerStats(matchId, scorecard, dbInstance = db) {
    try {
      console.log('Starting player stats update for match:', matchId);
      
      const processPlayerStats = async (playerName, teamData) => {
        try {
          if (!playerName) {
            console.error('Missing player name');
            return;
          }

          const playerDocId = this.createPlayerDocId(playerName);
          const playerRef = doc(dbInstance, 'players', playerDocId);
          
          await runTransaction(dbInstance, async (transaction) => {
            const playerDoc = await transaction.get(playerRef);
            const currentStats = playerDoc.exists() ? playerDoc.data() : {};
            
            const stats = {
              name: playerName,
              teamId: teamData.teamId,
              matches: (currentStats.matches || 0) + 1,
              runs: currentStats.runs || 0,
              balls: currentStats.balls || 0,
              fours: currentStats.fours || 0,
              sixes: currentStats.sixes || 0,
              fifties: currentStats.fifties || 0,
              hundreds: currentStats.hundreds || 0,
              wickets: currentStats.wickets || 0,
              economy: currentStats.economy || 0,
              bowlingBalls: currentStats.bowlingBalls || 0,
              bowlingRuns: currentStats.bowlingRuns || 0,
              fiveWickets: currentStats.fiveWickets || 0,
              lastMatchId: matchId,
              lastUpdated: new Date().toISOString()
            };

            // Update batting stats
            const battingData = teamData.batsmen.find(b => b.name === playerName);
            if (battingData) {
              console.log(`Processing batting stats for ${playerName}:`, battingData);
              
              stats.runs += parseInt(battingData.runs || 0);
              stats.balls += parseInt(battingData.balls || 0);
              stats.fours += parseInt(battingData.fours || 0);
              stats.sixes += parseInt(battingData.sixes || 0);

              if (battingData.runs >= 50 && battingData.runs < 100) {
                stats.fifties += 1;
              } else if (battingData.runs >= 100) {
                stats.hundreds += 1;
              }

              stats.battingAverage = (stats.runs / stats.matches).toFixed(2);
              stats.strikeRate = (stats.balls > 0 ? 
                ((stats.runs / stats.balls) * 100).toFixed(2) : 0
              );
            }

            // Update bowling stats
            const bowlingData = teamData.bowlers.find(b => b.name === playerName);
            if (bowlingData) {
              console.log(`Processing bowling stats for ${playerName}:`, bowlingData);
              
              const wickets = parseInt(bowlingData.wickets || 0);
              const overs = parseFloat(bowlingData.overs || 0);
              const bowlingRuns = parseInt(bowlingData.runs || 0);
              
              stats.wickets += wickets;
              stats.bowlingBalls += Math.floor(overs) * 6 + (overs % 1) * 10;
              stats.bowlingRuns += bowlingRuns;

              if (wickets >= 5) {
                stats.fiveWickets += 1;
              }

              stats.bowlingAverage = (stats.wickets > 0 ? 
                (stats.bowlingRuns / stats.wickets).toFixed(2) : 0
              );
              stats.economy = (stats.bowlingBalls > 0 ? 
                ((stats.bowlingRuns / stats.bowlingBalls) * 6).toFixed(2) : 0
              );
            }

            // Handle fielding stats
            stats.catches = currentStats.catches || 0;
            stats.stumpings = currentStats.stumpings || 0;
            
            teamData.batsmen.forEach(b => {
              if (b.dismissal) {
                if (b.dismissal.includes(`c ${playerName}`)) {
                  stats.catches += 1;
                } else if (b.dismissal.includes(`st ${playerName}`)) {
                  stats.stumpings += 1;
                }
              }
            });

            console.log(`Saving stats for ${playerName}:`, stats);
            await transaction.set(playerRef, stats, { merge: true });
          });
        } catch (error) {
          console.error(`Error processing stats for player ${playerName}:`, error);
          throw error;
        }
      };

      // Get unique players from both teams
      const team1Players = new Set([
        ...scorecard.team1.batsmen.map(b => b.name),
        ...scorecard.team1.bowlers.map(b => b.name)
      ]);
      const team2Players = new Set([
        ...scorecard.team2.batsmen.map(b => b.name),
        ...scorecard.team2.bowlers.map(b => b.name)
      ]);

      const updatePromises = [
        ...Array.from(team1Players).map(playerName => 
          processPlayerStats(playerName, scorecard.team1)
        ),
        ...Array.from(team2Players).map(playerName => 
          processPlayerStats(playerName, scorecard.team2)
        )
      ];

      await Promise.all(updatePromises);
      console.log('Successfully updated all player stats');
      return true;
    } catch (error) {
      console.error('Error updating player stats:', error);
      throw error;
    }
  }

static async syncMatchData() {
    try {
      console.log('Starting match data sync...');
      const matches = await this.fetchRecentMatches();
      console.log(`Found ${matches.length} matches to sync`);

      const syncResults = [];
      const cricketServiceInstance = new CricketService();

      for (const match of matches) {
        try {
          const scorecard = await this.fetchScorecard(match.matchId);
          await this.updateMatchInFirebase(match, scorecard);
          
          // Use the instance method for updating player stats
          await cricketServiceInstance.updatePlayerStats(match.matchId, scorecard);
          
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
