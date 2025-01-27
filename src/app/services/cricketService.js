// services/cricketService.js
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
  writeBatch
} from 'firebase/firestore';

export class CricketService {
  static async fetchRecentMatches() {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com',
      },
    };

    try {
      const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent', options);
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      const bigBashMatches = [];

      // Enhanced match filtering with validation
      data.typeMatches?.forEach(typeMatch => {
        typeMatch.seriesMatches?.forEach(seriesMatch => {
          if (seriesMatch.seriesId === '8535') { // Big Bash League ID
            seriesMatch.seriesAdWrapper?.matches?.forEach(match => {
              if (match.matchInfo?.matchId) {
                bigBashMatches.push({
                  matchId: match.matchInfo.matchId,
                  matchInfo: match.matchInfo,
                  lastUpdated: new Date().toISOString()
                });
              }
            });
          }
        });
      });

      return bigBashMatches;
    } catch (error) {
      console.error('Error in fetchRecentMatches:', error);
      throw new Error(`Failed to fetch matches: ${error.message}`);
    }
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    try {
      const batch = writeBatch(db);
      const matchRef = doc(db, 'matches', matchData.matchId.toString());

      // Prepare match document with complete data structure
      const matchDocument = {
        matchId: matchData.matchId,
        lastUpdated: Timestamp.now(),
        matchInfo: matchData.matchInfo || {},
        scorecard: scorecard || {},
        status: 'active',
        updateAttempts: Timestamp.now()
      };

      batch.set(matchRef, matchDocument, { merge: true });
      await batch.commit();

      console.log(`Successfully updated match ${matchData.matchId} in Firebase`);
      return true;
    } catch (error) {
      console.error(`Firebase update error for match ${matchData.matchId}:`, error);
      throw new Error(`Firebase update failed: ${error.message}`);
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
        matches.push({ id: doc.id, ...doc.data() });
      });

      return matches;
    } catch (error) {
      console.error('Error fetching matches from Firebase:', error);
      throw new Error(`Failed to fetch matches: ${error.message}`);
    }
  }
}
