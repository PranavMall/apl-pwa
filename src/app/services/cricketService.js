// app/services/cricketService.js
import { db } from '../firebase';
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
  limit 
} from 'firebase/firestore';

const RAPID_API_KEY = process.env.NEXT_PUBLIC_RAPID_API_KEY;
const CRICKET_API_HOST = 'cricbuzz-cricket.p.rapidapi.com';

export class CricketService {
  static async getMatchesFromFirebase() {
    try {
      const matchesRef = collection(db, 'matches');
      const matchQuery = query(
        matchesRef,
        orderBy('lastUpdated', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(matchQuery);
      return querySnapshot.docs.map(doc => doc.data());
    } catch (error) {
      console.error('Error fetching matches:', error);
      throw new Error('Failed to fetch matches from database');
    }
  }

  static async syncMatchData() {
    try {
      const syncLog = {
        startTime: new Date().toISOString(),
        status: 'started',
        matchesUpdated: 0,
        errors: []
      };

      const matches = await this.fetchRecentMatches();
      
      for (const match of matches) {
        try {
          const scorecard = await this.fetchScorecard(match.matchId);
          await this.updateMatchInFirebase(match, scorecard);
          syncLog.matchesUpdated++;
        } catch (error) {
          syncLog.errors.push({
            matchId: match.matchId,
            error: error.message
          });
        }
      }

      syncLog.status = 'completed';
      syncLog.endTime = new Date().toISOString();
      
      const logsCollection = collection(db, 'syncLogs');
      await addDoc(logsCollection, syncLog);

      return {
        success: true,
        matchesUpdated: syncLog.matchesUpdated,
        errors: syncLog.errors
      };
    } catch (error) {
      console.error('Error in sync process:', error);
      throw new Error('Failed to sync match data');
    }
  }

  static async fetchRecentMatches() {
    if (!RAPID_API_KEY) {
      throw new Error('API key not configured');
    }

    try {
      const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent', {
        headers: {
          'X-RapidAPI-Key': RAPID_API_KEY,
          'X-RapidAPI-Host': CRICKET_API_HOST
        }
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      return this.filterBigBashMatches(data);
    } catch (error) {
      console.error('Error fetching matches:', error);
      throw new Error('Failed to fetch recent matches');
    }
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    try {
      const matchDoc = doc(db, 'matches', matchData.matchId.toString());
      
      const matchDocument = {
        matchId: matchData.matchId,
        lastUpdated: Timestamp.now(),
        matchInfo: {
          matchDesc: matchData.matchDesc,
          team1: matchData.team1,
          team2: matchData.team2,
          status: matchData.status,
          venueInfo: matchData.venueInfo,
          seriesId: matchData.seriesId
        },
        scorecard: scorecard
      };

      await setDoc(matchDoc, matchDocument, { merge: true });
    } catch (error) {
      console.error('Error updating match:', error);
      throw new Error('Failed to update match in database');
    }
  }

  static filterBigBashMatches(matchesData) {
    return matchesData.typeMatches
      .flatMap(type => type.seriesMatches)
      .filter(series => series.seriesAdWrapper?.seriesId === '8535')
      .flatMap(series => series.seriesAdWrapper.matches);
  }
}
