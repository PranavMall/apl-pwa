// services/cricketService.js
import { db } from '../firebase';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';

const RAPID_API_KEY = process.env.NEXT_PUBLIC_RAPID_API_KEY;
const CRICKET_API_HOST = 'cricbuzz-cricket.p.rapidapi.com';

export class CricketService {
  static async fetchRecentMatches() {
    const response = await fetch('https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent', {
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST
      }
    });
    
    const data = await response.json();
    return this.filterBigBashMatches(data);
  }

  static filterBigBashMatches(matchesData) {
    // Filter matches for Big Bash League (series ID: 8535)
    const bigBashMatches = matchesData.typeMatches
      .flatMap(type => type.seriesMatches)
      .filter(series => series.seriesAdWrapper?.seriesId === '8535')
      .flatMap(series => series.seriesAdWrapper.matches);
    
    return bigBashMatches;
  }

  static async fetchScorecard(matchId) {
    const response = await fetch(`https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`, {
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST
      }
    });
    
    return await response.json();
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    const matchDoc = doc(db, 'matches', matchData.matchId.toString());
    await setDoc(matchDoc, {
      ...matchData,
      scorecard,
      lastUpdated: new Date().toISOString()
    });
  }

  static async getMatchesFromFirebase() {
    const matchesRef = collection(db, 'matches');
    const querySnapshot = await getDocs(matchesRef);
    
    return querySnapshot.docs.map(doc => doc.data());
  }

  static async syncMatchData() {
    try {
      // 1. Fetch recent Big Bash matches
      const matches = await this.fetchRecentMatches();
      
      // 2. For each match, fetch scorecard and update Firebase
      for (const match of matches) {
        const scorecard = await this.fetchScorecard(match.matchId);
        await this.updateMatchInFirebase(match, scorecard);
      }
      
      return true;
    } catch (error) {
      console.error('Error syncing match data:', error);
      return false;
    }
  }
}
