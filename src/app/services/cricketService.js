// app/services/cricketService.js
import { db } from '../../firebase';
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

  // Remove the subscribeToMatches function as it's not needed for now
}
