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
} from 'firebase/firestore';

export class CricketService {
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
      console.log('Raw API response:', data);

      const bigBashMatches = [];
      
      if (!data.typeMatches) {
        console.warn('No typeMatches found in API response');
        return bigBashMatches;
      }

      data.typeMatches.forEach(typeMatch => {
        if (!typeMatch.seriesMatches) return;
        
        typeMatch.seriesMatches.forEach(seriesMatch => {
          if (seriesMatch.seriesId === '8535') {
            const matches = seriesMatch.seriesAdWrapper?.matches || [];
            matches.forEach(match => {
              if (match.matchInfo?.matchId) {
                bigBashMatches.push({
                  matchId: match.matchInfo.matchId.toString(),
                  matchInfo: match.matchInfo,
                });
              }
            });
          }
        });
      });

      console.log('Filtered Big Bash matches:', bigBashMatches);
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
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`,
        options
      );

      if (!response.ok) {
        throw new Error(`Scorecard API responded with status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Raw scorecard data for match ${matchId}:`, data);

      return {
        team1: {
          batsmen: data.scoreCard?.[0]?.batsmen || [],
          bowlers: data.scoreCard?.[1]?.bowlers || [],
          score: data.scoreCard?.[0]?.score || '0/0',
          teamId: data.scoreCard?.[0]?.teamId
        },
        team2: {
          batsmen: data.scoreCard?.[1]?.batsmen || [],
          bowlers: data.scoreCard?.[0]?.bowlers || [],
          score: data.scoreCard?.[1]?.score || '0/0',
          teamId: data.scoreCard?.[1]?.teamId
        }
      };
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
      throw error;
    }
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    try {
      const matchDoc = doc(db, 'matches', matchData.matchId);
      const matchDocument = {
        matchId: matchData.matchId,
        lastUpdated: Timestamp.now(),
        matchInfo: matchData.matchInfo,
        scorecard: scorecard,
      };

      await setDoc(matchDoc, matchDocument, { merge: true });
      console.log(`Updated Firebase for match ${matchData.matchId}`);
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
          console.log(`Fetching scorecard for match ${match.matchId}`);
          const scorecard = await this.fetchScorecard(match.matchId);
          
          console.log(`Updating Firebase for match ${match.matchId}`);
          await this.updateMatchInFirebase(match, scorecard);
          
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

      console.log('Fetched matches from Firebase:', matches);
      return matches;
    } catch (error) {
      console.error('Error fetching matches from Firebase:', error);
      throw error;
    }
  }
}
