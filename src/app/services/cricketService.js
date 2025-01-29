import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  Timestamp,
  orderBy,
  limit,
} from 'firebase/firestore';

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
      const bigBashMatches = [];
      
      data.typeMatches?.forEach(typeMatch => {
        typeMatch.seriesMatches?.forEach(seriesMatch => {
          const seriesData = seriesMatch.seriesAdWrapper || seriesMatch;
          const matches = seriesData.matches || [];
          
          if (
            seriesData.seriesId === '8535' ||
            seriesData.seriesName?.toLowerCase().includes('big bash') ||
            seriesData.seriesName?.toLowerCase().includes('bbl')
          ) {
            console.log(`Found BBL series: ${seriesData.seriesName}`);
            
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
                bigBashMatches.push(this.validateAndCleanObject(matchData));
              }
            });
          }
        });
      });

      console.log(`Found ${bigBashMatches.length} Big Bash matches:`, bigBashMatches);
      return bigBashMatches;
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

      // Transform the scorecard data to match our schema
      const scorecard = {
        team1: {
          teamId: data.scoreCard?.[0]?.teamId,
          batsmen: data.scoreCard?.[0]?.batsmen?.map(batsman => ({
            name: batsman.name,
            runs: batsman.runs,
            balls: batsman.balls,
            fours: batsman.fours,
            sixes: batsman.sixes,
            strikeRate: batsman.strikeRate,
            dismissal: batsman.dismissalText,
            isBatting: batsman.isBatting
          })) || [],
          bowlers: data.scoreCard?.[1]?.bowlers?.map(bowler => ({
            name: bowler.name,
            overs: bowler.overs,
            maidens: bowler.maidens,
            runs: bowler.runs,
            wickets: bowler.wickets,
            economy: bowler.economy,
            extras: bowler.extras
          })) || [],
          score: data.scoreCard?.[0]?.score || '0/0',
          inningsId: data.scoreCard?.[0]?.inningsId
        },
        team2: {
          teamId: data.scoreCard?.[1]?.teamId,
          batsmen: data.scoreCard?.[1]?.batsmen?.map(batsman => ({
            name: batsman.name,
            runs: batsman.runs,
            balls: batsman.balls,
            fours: batsman.fours,
            sixes: batsman.sixes,
            strikeRate: batsman.strikeRate,
            dismissal: batsman.dismissalText,
            isBatting: batsman.isBatting
          })) || [],
          bowlers: data.scoreCard?.[0]?.bowlers?.map(bowler => ({
            name: bowler.name,
            overs: bowler.overs,
            maidens: bowler.maidens,
            runs: bowler.runs,
            wickets: bowler.wickets,
            economy: bowler.economy,
            extras: bowler.extras
          })) || [],
          score: data.scoreCard?.[1]?.score || '0/0',
          inningsId: data.scoreCard?.[1]?.inningsId
        }
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
      
      // Combine match info with scorecard
      const matchDocument = this.validateAndCleanObject({
        matchId: matchData.matchId,
        lastUpdated: new Date().toISOString(),
        matchInfo: {
          ...matchData.matchInfo,
          team1: {
            ...matchData.matchInfo.team1,
            teamId: scorecard.team1.teamId,
            score: scorecard.team1.score
          },
          team2: {
            ...matchData.matchInfo.team2,
            teamId: scorecard.team2.teamId,
            score: scorecard.team2.score
          }
        },
        scorecard: scorecard
      });

      if (!matchDocument) {
        throw new Error('Invalid match data structure');
      }

      console.log('Saving match document:', matchDocument);
      await setDoc(matchDoc, matchDocument, { merge: true });
      
      console.log(`Successfully updated Firebase for match ${matchData.matchId}`);
      return true;
    } catch (error) {
      console.error(`Error updating match ${matchData.matchId} in Firebase:`, error);
      throw error;
    }
  }

  static async syncMatchData() {
    try {
      console.log('Starting match data sync...');
      const matches = await this.fetchRecentMatches();
      console.log(`Found ${matches.length} matches to sync`);

      const syncResults = [];
      for (const match of matches) {
        try {
          const scorecard = await this.fetchScorecard(match.matchId);
          await this.updateMatchInFirebase(match, scorecard, db);
          
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
