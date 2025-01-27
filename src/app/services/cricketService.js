// services/cricketService.js
import { db, auth } from '../../firebase';
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

const RAPID_API_KEY = process.env.NEXT_PUBLIC_RAPID_API_KEY;
const CRICKET_API_HOST = 'cricbuzz-cricket.p.rapidapi.com';

export class CricketService {
  static async fetchRecentMatches() {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST,
      },
    };

    try {
      const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent', options);
      if (!response.ok) throw new Error('Failed to fetch matches');
      const data = await response.json();

      const bigBashMatches = [];
      data.typeMatches?.forEach((typeMatch) => {
        typeMatch.seriesMatches?.forEach((seriesMatch) => {
          if (seriesMatch.seriesId === '8535') {
            seriesMatch.seriesAdWrapper?.matches?.forEach((match) => {
              bigBashMatches.push({
                matchId: match.matchInfo.matchId,
                matchInfo: match.matchInfo,
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
        'X-RapidAPI-Host': CRICKET_API_HOST,
      },
    };

    try {
      const response = await fetch(`https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`, options);
      if (!response.ok) throw new Error('Failed to fetch scorecard');
      const data = await response.json();

      return {
        team1: {
          batsmen: data.scoreCard?.[0]?.batsmen || [],
          bowlers: data.scoreCard?.[1]?.bowlers || [],
        },
        team2: {
          batsmen: data.scoreCard?.[1]?.batsmen || [],
          bowlers: data.scoreCard?.[0]?.bowlers || [],
        },
      };
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
      throw new Error('Failed to fetch scorecard');
    }
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    try {
      const matchDoc = doc(db, 'matches', matchData.matchId.toString());
      const matchDocument = {
        matchId: matchData.matchId,
        lastUpdated: Timestamp.now(),
        matchInfo: matchData.matchInfo || {},
        scorecard: scorecard || {},
      };

      await setDoc(matchDoc, matchDocument, { merge: true });
      console.log(`Updated Firebase for match ${matchData.matchId}`);
    } catch (error) {
      console.error(`Error updating match ${matchData.matchId}:`, error);
      throw new Error('Failed to update match in database');
    }
  }

  static async syncMatchData() {
    try {
      const matches = await this.fetchRecentMatches();
      console.log('Fetched matches:', matches);

      for (const match of matches) {
        try {
          const scorecard = await this.fetchScorecard(match.matchId);
          await this.updateMatchInFirebase(match, scorecard);
        } catch (error) {
          console.error(`Error syncing match ${match.matchId}:`, error);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error during sync process:', error);
      throw new Error('Failed to sync match data');
    }
  }
}
