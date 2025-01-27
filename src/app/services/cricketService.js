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
    // Verify API key exists
    if (!RAPID_API_KEY) {
      console.error('RAPID_API_KEY is not defined');
      throw new Error('API key configuration is missing');
    }

    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST
      }
    };

    try {
      console.log('Initiating API request to fetch matches...');
      
      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(
        'https://cricbuzz-cricket.p.rapidapi.com/matches/v1/recent', 
        {
          ...options,
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);

      console.log('API Response Status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`API responded with status ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Successfully fetched matches data');
      
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

      console.log(`Found ${bigBashMatches.length} Big Bash matches`);
      return bigBashMatches;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('Request timed out after 30 seconds');
        throw new Error('Request timed out while fetching matches');
      }
      
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      throw new Error(`Failed to fetch recent matches: ${error.message}`);
    }
  }

  static async fetchScorecard(matchId) {
    if (!RAPID_API_KEY) {
      console.error('RAPID_API_KEY is not defined');
      throw new Error('API key configuration is missing');
    }

    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPID_API_KEY,
        'X-RapidAPI-Host': CRICKET_API_HOST
      }
    };

    try {
      console.log(`Fetching scorecard for match ${matchId}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/hscard`,
        {
          ...options,
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);

      console.log(`Scorecard API Response Status for match ${matchId}:`, response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Scorecard API Error Response for match ${matchId}:`, errorText);
        throw new Error(`API responded with status ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`Successfully fetched scorecard for match ${matchId}`);
      
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
      if (error.name === 'AbortError') {
        console.error(`Request timed out while fetching scorecard for match ${matchId}`);
        throw new Error('Request timed out while fetching scorecard');
      }
      
      console.error('Scorecard Error details:', {
        matchId,
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      throw new Error(`Failed to fetch scorecard: ${error.message}`);
    }
  }

  // ... rest of the class methods remain the same ...
}
