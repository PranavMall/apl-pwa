import { db } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { PlayerService } from './playerService';

export class CricketService {
  static SA20_SERIES_ID = '8873';
  static SA20_SERIES_NAME = 'SA20, 2025';

   // Add default match IDs for SA20 matches
  static SA20_MATCH_IDS = [
    // Add your match IDs here
    '106596', '106588', '106580', '106569', '106572'  // Example match IDs
  ];

  static validateAndCleanObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      
      if (value && typeof value === 'object') {
        cleaned[key] = this.validateAndCleanObject(value);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

 static async fetchRecentMatches(matchIds = this.SA20_MATCH_IDS) {
    if (!process.env.NEXT_PUBLIC_RAPID_API_KEY) {
      throw new Error('RAPID_API_KEY is not configured');
    }

    try {
      // Use provided matchIds or fall back to default SA20_MATCH_IDS
      const matches = (matchIds || this.SA20_MATCH_IDS).map(matchId => ({
        matchId: matchId.toString(),
        seriesId: this.SA20_SERIES_ID,
        seriesName: this.SA20_SERIES_NAME
      }));

      console.log(`Processing ${matches.length} SA20 matches`);
      return matches;
    } catch (error) {
      console.error('Error processing matches:', error);
      throw error;
    }
  }


static async fetchScorecard(matchId) {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com'
      }
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

      if (!data || !data.matchHeader || !data.scoreCard) {
        throw new Error(`Invalid scorecard response for match ${matchId}`);
      }

      return this.processScorecard(data);
    } catch (error) {
      console.error(`Error fetching scorecard for match ${matchId}:`, error);
      return null;  // Return null to indicate failure
    }
}


  static async updateMatchAndPlayers(matchId) {
    try {
      // Fetch scorecard data
      const scorecard = await this.fetchScorecard(matchId);

      if (!scorecard || !scorecard.matchId) {
        throw new Error(`Invalid scorecard data for match ${matchId}`);
      }

      // Update match data in Firebase
      await this.updateMatchInFirebase(matchId, scorecard);

      // Update player data for both teams
      if (scorecard.team1 && scorecard.team1.teamId) {
        await PlayerService.updateTeamPlayers(matchId, scorecard.team1.teamId);
      }
      if (scorecard.team2 && scorecard.team2.teamId) {
        await PlayerService.updateTeamPlayers(matchId, scorecard.team2.teamId);
      }

      return {
        success: true,
        matchId,
        teams: [scorecard.team1?.teamId, scorecard.team2?.teamId]
      };
    } catch (error) {
      console.error(`Error updating match ${matchId}:`, error);
      throw error;
    }
}


  static processScorecard(data) {
    const processInnings = (inning) => {
      const batsmen = Object.values(inning.batTeamDetails.batsmenData || {}).map(bat => ({
        playerId: bat.batId,
        name: bat.batName,
        isCaptain: bat.isCaptain,
        isKeeper: bat.isKeeper,
        runs: bat.runs,
        balls: bat.balls,
        fours: bat.fours,
        sixes: bat.sixes,
        strikeRate: bat.strikeRate,
        dismissal: bat.outDesc,
        bowlerId: bat.bowlerId,
        fielderId: bat.fielderId1
      }));

      const bowlers = Object.values(inning.bowlTeamDetails.bowlersData || {}).map(bowl => ({
        playerId: bowl.bowlerId,
        name: bowl.bowlName,
        isCaptain: bowl.isCaptain,
        isKeeper: bowl.isKeeper,
        overs: bowl.overs,
        maidens: bowl.maidens,
        runs: bowl.runs,
        wickets: bowl.wickets,
        economy: bowl.economy,
        extras: {
          wides: bowl.wides,
          noBalls: bowl.no_balls
        }
      }));

      return {
        teamId: inning.batTeamDetails.batTeamId,
        teamName: inning.batTeamDetails.batTeamName,
        shortName: inning.batTeamDetails.batTeamShortName,
        batsmen,
        bowlers,
        score: `${inning.scoreDetails.runs}/${inning.scoreDetails.wickets}`,
        overs: inning.scoreDetails.overs,
        runRate: inning.scoreDetails.runRate,
        extras: inning.extrasData,
        partnerships: Object.values(inning.partnershipsData || {}).map(p => ({
          totalRuns: p.totalRuns,
          totalBalls: p.totalBalls,
          batsman1: {
            id: p.bat1Id,
            name: p.bat1Name,
            runs: p.bat1Runs,
            balls: p.bat1balls,
            fours: p.bat1fours,
            sixes: p.bat1sixes
          },
          batsman2: {
            id: p.bat2Id,
            name: p.bat2Name,
            runs: p.bat2Runs,
            balls: p.bat2balls,
            fours: p.bat2fours,
            sixes: p.bat2sixes
          }
        }))
      };
    };

    return {
      matchId: data.matchHeader.matchId,
      team1: processInnings(data.scoreCard[0]),
      team2: processInnings(data.scoreCard[1]),
      matchStatus: data.matchHeader.status,
      result: data.matchHeader.result,
      toss: data.matchHeader.tossResults,
      playerOfMatch: data.matchHeader.playersOfTheMatch?.[0]?.name,
      seriesId: this.SA20_SERIES_ID,
      seriesName: this.SA20_SERIES_NAME
    };
  }

  static async updatePlayerInFirebase(playerData, teamId) {
    try {
      const playerDoc = doc(db, 'players', playerData.playerId.toString());
      
      const playerInfo = this.validateAndCleanObject({
        playerId: playerData.playerId,
        name: playerData.name,
        teamId: teamId,
        role: playerData.role || 'Unknown',
        isCaptain: playerData.isCaptain || false,
        isKeeper: playerData.isKeeper || false,
        battingStyle: playerData.battingStyle,
        bowlingStyle: playerData.bowlingStyle,
        lastUpdated: new Date().toISOString()
      });

      await setDoc(playerDoc, playerInfo, { merge: true });
      return true;
    } catch (error) {
      console.error(`Error updating player ${playerData.playerId} in Firebase:`, error);
      throw error;
    }
  }

  static async updateMatchInFirebase(matchData, scorecard) {
    try {
      const matchDoc = doc(db, 'matches', matchData.matchId.toString());
      
      const matchDocument = this.validateAndCleanObject({
        matchId: matchData.matchId,
        lastUpdated: new Date().toISOString(),
        seriesId: this.SA20_SERIES_ID,
        seriesName: this.SA20_SERIES_NAME,
        matchInfo: {
          status: scorecard.matchStatus,
          result: scorecard.result,
          toss: scorecard.toss,
          playerOfMatch: scorecard.playerOfMatch,
          team1: {
            teamId: scorecard.team1.teamId,
            teamName: scorecard.team1.teamName,
            score: scorecard.team1.score,
            overs: scorecard.team1.overs,
            runRate: scorecard.team1.runRate
          },
          team2: {
            teamId: scorecard.team2.teamId,
            teamName: scorecard.team2.teamName,
            score: scorecard.team2.score,
            overs: scorecard.team2.overs,
            runRate: scorecard.team2.runRate
          }
        },
        scorecard
      });

      await setDoc(matchDoc, matchDocument, { merge: true });
      
      // Update player statistics for both teams
      const batch = writeBatch(db);
      
      // Process and update players from both innings
      const allPlayers = [
        ...scorecard.team1.batsmen,
        ...scorecard.team1.bowlers,
        ...scorecard.team2.batsmen,
        ...scorecard.team2.bowlers
      ];

      for (const player of allPlayers) {
        if (player.playerId) {
          const playerRef = doc(db, 'players', player.playerId.toString());
          batch.set(playerRef, {
            lastMatchId: matchData.matchId,
            lastMatchDate: new Date().toISOString(),
            name: player.name,
            // Add other player stats as needed
          }, { merge: true });
        }
      }

      await batch.commit();
      return true;
    } catch (error) {
      console.error(`Error updating match ${matchData.matchId} in Firebase:`, error);
      throw error;
    }
  }

static async syncMatchData(matchIds = this.SA20_MATCH_IDS) {
    try {
      console.log('syncMatchData() received matchIds:', matchIds);

      if (!Array.isArray(matchIds) || matchIds.length === 0) {
        throw new Error('matchIds is missing or not an array');
      }

      const syncResults = [];

      for (const matchId of matchIds) {
        if (!matchId) {
          console.warn('Skipping undefined matchId:', matchId);
          continue;
        }

        try {
          console.log(`Processing matchId: ${matchId}`);
          const result = await this.updateMatchAndPlayers(matchId);
          syncResults.push({
            matchId,
            status: 'success',
            ...result
          });
        } catch (error) {
          syncResults.push({
            matchId,
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
