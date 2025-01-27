import { db, auth } from '../../firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  addDoc,
  Timestamp,
  orderBy,
  limit,
  onSnapshot 
} from 'firebase/firestore';

const RAPID_API_KEY = process.env.NEXT_PUBLIC_RAPID_API_KEY;
const CRICKET_API_HOST = 'cricbuzz-cricket.p.rapidapi.com';

export class CricketService {
  static async fetchRecentMatches() {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST
      }
    };

    try {
      const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent', options);
      if (!response.ok) throw new Error('Failed to fetch matches');
      
      const data = await response.json();
      
      // Filter for Big Bash League matches (series ID: 8535)
      const bigBashMatches = [];
      
      // Traverse through the typeMatches to find Big Bash matches
      data.typeMatches?.forEach(typeMatch => {
        typeMatch.seriesMatches?.forEach(seriesMatch => {
          if (seriesMatch.seriesId === '8535') {
            seriesMatch.seriesAdWrapper?.matches?.forEach(match => {
              bigBashMatches.push({
                matchId: match.matchInfo.matchId,
                matchInfo: match.matchInfo
              });
            });
          }
        });
      });

      return bigBashMatches;
    } catch (error) {
      console.error('Error fetching recent matches:', error);
      throw new Error('Failed to fetch recent matches');
    }
  }

  static async fetchScorecard(matchId) {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST
      }
    };

    try {
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`,
        options
      );
      
      if (!response.ok) throw new Error('Failed to fetch scorecard');
      
      const data = await response.json();
      
      // Transform the scorecard data into our desired format
      return {
        team1: {
          batsmen: data.scoreCard?.[0]?.batsmen?.map(batsman => ({
            name: batsman.name,
            runs: batsman.runs,
            balls: batsman.balls,
            strikeRate: batsman.strikeRate
          })) || [],
          bowlers: data.scoreCard?.[1]?.bowlers?.map(bowler => ({
            name: bowler.name,
            overs: bowler.overs,
            wickets: bowler.wickets,
            economy: bowler.economy
          })) || []
        },
        team2: {
          batsmen: data.scoreCard?.[1]?.batsmen?.map(batsman => ({
            name: batsman.name,
            runs: batsman.runs,
            balls: batsman.balls,
            strikeRate: batsman.strikeRate
          })) || [],
          bowlers: data.scoreCard?.[0]?.bowlers?.map(bowler => ({
            name: bowler.name,
            overs: bowler.overs,
            wickets: bowler.wickets,
            economy: bowler.economy
          })) || []
        }
      };
    } catch (error) {
      console.error('Error fetching scorecard:', error);
      throw new Error('Failed to fetch scorecard');
    }
  }

  static async getMatchesFromFirebase() {
    try {
      const matchesRef = collection(db, 'matches');
      const matchQuery = query(
        matchesRef,
        orderBy('lastUpdated', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(matchQuery);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error fetching matches:', error);
      return [];
    }
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    try {
      if (!auth.currentUser) {
        throw new Error('Authentication required');
      }

      const matchDoc = doc(db, 'matches', matchData.matchId.toString());
      const matchDocument = {
        matchId: matchData.matchId,
        lastUpdated: Timestamp.now(),
        matchInfo: matchData.matchInfo || {},
        scorecard: scorecard || {},
        updatedBy: auth.currentUser.uid
      };

      await setDoc(matchDoc, matchDocument, { merge: true });
    } catch (error) {
      console.error('Error updating match:', error);
      throw new Error('Failed to update match in database');
    }
  }

  static async syncMatchData() {
    if (!auth.currentUser) {
      throw new Error('Authentication required');
    }

    try {
      const matches = await this.fetchRecentMatches();
      const results = {
        updated: 0,
        errors: []
      };

      for (const match of matches) {
        try {
          const scorecard = await this.fetchScorecard(match.matchId);
          await this.updateMatchInFirebase(match, scorecard);
          results.updated++;
        } catch (error) {
          results.errors.push({
            matchId: match.matchId,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error in sync process:', error);
      throw new Error('Failed to sync match data');
    }
  }
}
