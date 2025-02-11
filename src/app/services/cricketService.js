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
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/scard`,
        options
      );

      if (!response.ok) {
        throw new Error(`Scorecard API responded with status: ${response.status}`);
      }

      const data = await response.json();
      
      // Process and format scorecard data
      const scorecard = {
        matchId: matchId,
        matchStatus: data.matchHeader?.status || '',
        result: data.matchHeader?.result || '',
        toss: data.matchHeader?.tossResults || '',
        playerOfMatch: data.matchHeader?.playerOfTheMatch?.[0]?.name || '',
        team1: {
          teamId: data.scoreCard?.[0]?.teamId,
          teamName: data.scoreCard?.[0]?.batTeamName || '',
          score: this.formatScore(data.scoreCard?.[0]),
          overs: data.scoreCard?.[0]?.overs || '0',
          runRate: data.scoreCard?.[0]?.runRate || '0',
          batsmen: this.processBatsmen(data.scoreCard?.[0]?.batsman || []),
          bowlers: this.processBowlers(data.scoreCard?.[1]?.bowler || [])
        },
        team2: {
          teamId: data.scoreCard?.[1]?.teamId,
          teamName: data.scoreCard?.[1]?.batTeamName || '',
          score: this.formatScore(data.scoreCard?.[1]),
          overs: data.scoreCard?.[1]?.overs || '0',
          runRate: data.scoreCard?.[1]?.runRate || '0',
          batsmen: this.processBatsmen(data.scoreCard?.[1]?.batsman || []),
          bowlers: this.processBowlers(data.scoreCard?.[0]?.bowler || [])
        }
      };

      return this.validateAndCleanObject(scorecard);
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
      throw error;
    }
  }

   static formatScore(inningsData) {
    if (!inningsData) return '';
    const wickets = inningsData.wickets || 0;
    const runs = inningsData.runs || 0;
    return `${runs}/${wickets}`;
  }

   static processBatsmen(batsmenData) {
    return (batsmenData || []).map(batsman => ({
      name: batsman.name,
      runs: batsman.runs || '0',
      balls: batsman.balls || '0',
      fours: batsman.fours || '0',
      sixes: batsman.sixes || '0',
      strikeRate: batsman.strikeRate || '0',
      dismissal: batsman.dismissalText || ''
    }));
  }

  static processBowlers(bowlersData) {
    return (bowlersData || []).map(bowler => ({
      name: bowler.name,
      overs: bowler.overs || '0',
      maidens: bowler.maidens || '0',
      runs: bowler.runs || '0',
      wickets: bowler.wickets || '0',
      economy: bowler.economy || '0',
      extras: bowler.extras || '0'
    }));
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
        // Use the new PlayerService method
        await PlayerService.updatePlayerStats(match.matchId, scorecard);
        
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

  static async updatePlayerStats(matchId, scorecard, dbInstance = db) {
    try {
      console.log('Starting player stats update for match:', matchId);
      
      const processPlayerStats = async (playerName, teamData) => {
        try {
          if (!playerName) {
            console.error('Missing player name');
            return;
          }

          const playersRef = collection(dbInstance, 'players');
          const q = query(playersRef, where('name', '==', playerName));
          const playerSnapshot = await getDocs(q);
          
          let playerDocId;
          let existingPlayerData;
          
          if (!playerSnapshot.empty) {
            playerDocId = playerSnapshot.docs[0].id;
            existingPlayerData = playerSnapshot.docs[0].data();
          } else {
            const playerInfo = {
              name: playerName,
              teamId: teamData.teamId,
              role: determinePlayerRole(teamData, playerName)
            };
            playerDocId = this.createPlayerDocId(playerName);
            await PlayerService.updatePlayerInDatabase(playerInfo, teamData.teamId, matchId);
            existingPlayerData = playerInfo;
          }

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
              catches: currentStats.catches || 0,
              stumpings: currentStats.stumpings || 0,
              dismissals: (currentStats.catches || 0) + (currentStats.stumpings || 0),
              lastMatchId: matchId,
              lastUpdated: new Date().toISOString(),
              battingStyle: existingPlayerData.battingStyle || currentStats.battingStyle,
              bowlingStyle: existingPlayerData.bowlingStyle || currentStats.bowlingStyle,
              role: existingPlayerData.role || currentStats.role,
              playerId: existingPlayerData.playerId || currentStats.playerId
            };

            // Update batting stats
            const battingData = teamData.batsmen.find(b => b.name === playerName);
            if (battingData) {
              const newRuns = parseInt(battingData.runs || 0);
              stats.runs += newRuns;
              stats.balls += parseInt(battingData.balls || 0);
              stats.fours += parseInt(battingData.fours || 0);
              stats.sixes += parseInt(battingData.sixes || 0);

              if (newRuns >= 50 && newRuns < 100) {
                stats.fifties += 1;
              } else if (newRuns >= 100) {
                stats.hundreds += 1;
              }

              stats.battingAverage = stats.matches > 0 ? 
                (stats.runs / stats.matches).toFixed(2) : "0.00";
              stats.strikeRate = stats.balls > 0 ? 
                ((stats.runs / stats.balls) * 100).toFixed(2) : "0.00";
            }

            // Update bowling stats
            const bowlingData = teamData.bowlers.find(b => b.name === playerName);
            if (bowlingData) {
              const wickets = parseInt(bowlingData.wickets || 0);
              const overs = parseFloat(bowlingData.overs || 0);
              const bowlingRuns = parseInt(bowlingData.runs || 0);
              
              stats.wickets += wickets;
              stats.bowlingBalls += Math.floor(overs) * 6 + (overs % 1) * 10;
              stats.bowlingRuns += bowlingRuns;

              if (wickets >= 5) {
                stats.fiveWickets += 1;
              }

              stats.bowlingAverage = stats.wickets > 0 ? 
                (stats.bowlingRuns / stats.wickets).toFixed(2) : "0.00";
              stats.economy = stats.bowlingBalls > 0 ? 
                ((stats.bowlingRuns / stats.bowlingBalls) * 6).toFixed(2) : "0.00";
            }

            // Update fielding stats from dismissals
            teamData.batsmen.forEach(b => {
              if (b.dismissal) {
                if (b.dismissal.includes(`c ${playerName}`)) {
                  stats.catches += 1;
                  stats.dismissals += 1;
                } else if (b.dismissal.includes(`st ${playerName}`)) {
                  stats.stumpings += 1;
                  stats.dismissals += 1;
                }
              }
            });

            await transaction.set(playerRef, stats, { merge: true });
          });
        } catch (error) {
          console.error(`Error processing stats for player ${playerName}:`, error);
          throw error;
        }
      };

      const determinePlayerRole = (teamData, playerName) => {
        const isWicketkeeper = teamData.batsmen.some(b => 
          b.dismissal && b.dismissal.includes(`st ${playerName}`)
        );
        if (isWicketkeeper) return PlayerService.PLAYER_ROLES.WICKETKEEPER;
        
        const isBowler = teamData.bowlers.some(b => b.name === playerName);
        const isBatsman = teamData.batsmen.some(b => b.name === playerName);
        
        if (isBowler && isBatsman) return PlayerService.PLAYER_ROLES.ALLROUNDER;
        if (isBowler) return PlayerService.PLAYER_ROLES.BOWLER;
        return PlayerService.PLAYER_ROLES.BATSMAN;
      };

      // Process players from both teams
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
}
