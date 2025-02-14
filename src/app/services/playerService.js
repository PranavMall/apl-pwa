import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, writeBatch, runTransaction,increment } from 'firebase/firestore';
import { cricketService } from './cricketService';

export class PlayerService {
  static PLAYER_ROLES = {
    BATSMAN: 'batsman',
    BOWLER: 'bowler',
    ALLROUNDER: 'allrounder',
    WICKETKEEPER: 'wicketkeeper'
  };

  // Keep all your existing methods unchanged
  static async fetchTeamPlayers(matchId, teamId) {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com'
      }
    };

    try {
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/team/${teamId}`,
        options
      );
      
      if (!response.ok) {
        throw new Error(`Team API responded with status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching team info for match ${matchId}, team ${teamId}:`, error);
      throw error;
    }
  }

  static determineRole(playerData) {
    const { battingStyle, bowlingStyle, keeper, role: apiRole } = playerData;

    if (apiRole) {
      if (apiRole.includes('WK') || keeper) return this.PLAYER_ROLES.WICKETKEEPER;
      if (apiRole.includes('All-Rounder')) return this.PLAYER_ROLES.ALLROUNDER;
      if (apiRole.includes('Bowler')) return this.PLAYER_ROLES.BOWLER;
      if (apiRole.includes('Batsman')) return this.PLAYER_ROLES.BATSMAN;
    }

    // Fallback logic
    if (keeper) return this.PLAYER_ROLES.WICKETKEEPER;
    if (bowlingStyle && battingStyle) return this.PLAYER_ROLES.ALLROUNDER;
    if (bowlingStyle) return this.PLAYER_ROLES.BOWLER;
    return this.PLAYER_ROLES.BATSMAN;
  }

  static async updatePlayerInDatabase(playerData, teamId, matchId) {
    try {
      const playerRef = doc(db, 'players', playerData.id.toString());
      const role = this.determineRole(playerData);

      const playerInfo = {
        playerId: playerData.id,
        name: playerData.name,
        teamId: teamId,
        role: role,
        battingStyle: playerData.battingStyle,
        bowlingStyle: playerData.bowlingStyle,
        keeper: playerData.keeper || false,
        captain: playerData.captain || false,
        lastMatchId: matchId,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(playerRef, playerInfo, { merge: true });
      return true;
    } catch (error) {
      console.error(`Error updating player ${playerData.id}:`, error);
      throw error;
    }
  }

  static async updateTeamPlayers(matchId, teamId) {
    try {
      const teamData = await this.fetchTeamPlayers(matchId, teamId);
      const batch = writeBatch(db);
      const updates = [];

      // Process playing XI
      if (teamData.players && teamData.players['playing XI']) {
        for (const player of teamData.players['playing XI']) {
          updates.push(this.updatePlayerInDatabase(player, teamId, matchId));
        }
      }

      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error(`Error updating team ${teamId} players:`, error);
      throw error;
    }
  }

  // Add these new methods for player stats handling
  static async updatePlayerStats(matchId, scorecard, dbInstance = db) {
    try {
      console.log('Starting player stats update for match:', matchId);
      
      if (!scorecard || !scorecard.team1 || !scorecard.team2) {
        console.error('Invalid scorecard data structure:', scorecard);
        throw new Error('Invalid scorecard data structure');
      }

      // Process players from both teams
      const team1Players = this.getUniquePlayersFromTeam(scorecard.team1);
      const team2Players = this.getUniquePlayersFromTeam(scorecard.team2);

      const updatePromises = [
        ...Array.from(team1Players).map(playerName => 
          this.processPlayerStats(playerName, scorecard.team1, matchId, dbInstance)
        ),
        ...Array.from(team2Players).map(playerName => 
          this.processPlayerStats(playerName, scorecard.team2, matchId, dbInstance)
        )
      ];

      await Promise.all(updatePromises);
      console.log('Successfully updated all player stats');
      return true;
    } catch (error) {
      console.error('Error updating player stats:', error);
      throw error;
    }
  }

  static async savePlayerMatchPoints(playerId, matchId, points) {
  try {
    // First check if player exists in players collection
    const playerDocRef = doc(db, 'players', playerId);
    const playerDoc = await getDoc(playerDocRef);
    
    if (!playerDoc.exists()) {
      console.error(`Player ${playerId} not found in players collection`);
      return;
    }

    // Save points
    const pointsDocRef = doc(db, 'playerPoints', `${playerId}_${matchId}`);
    await setDoc(pointsDocRef, {
      playerId,
      matchId,
      points,
      timestamp: new Date()
    });

    // Update total points in player document
    await updateDoc(playerDocRef, {
      totalFantasyPoints: increment(points)
    });

    console.log(`Saved ${points} points for player ${playerId} in match ${matchId}`);
  } catch (error) {
    console.error('Error saving player match points:', error);
    throw error;
  }
}

  static getUniquePlayersFromTeam(teamData) {
    return new Set([
      ...(Array.isArray(teamData?.batsmen) ? teamData.batsmen.map(b => b?.name).filter(Boolean) : []),
      ...(Array.isArray(teamData?.bowlers) ? teamData.bowlers.map(b => b?.name).filter(Boolean) : [])
    ]);
  }

  static async processPlayerStats(playerName, teamData, matchId, dbInstance) {
    try {
      if (!playerName) {
        console.error('Missing player name');
        return;
      }

      const safeTeamData = {
        teamId: teamData?.teamId || '',
        batsmen: Array.isArray(teamData?.batsmen) ? teamData.batsmen : [],
        bowlers: Array.isArray(teamData?.bowlers) ? teamData.bowlers : []
      };

      const playerDocId = cricketService.createPlayerDocId(playerName);
      const playerRef = doc(dbInstance, 'players', playerDocId);

      await runTransaction(dbInstance, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        const currentStats = playerDoc.exists() ? playerDoc.data() : {};
        
        const stats = this.calculatePlayerStats(
          playerName,
          safeTeamData,
          currentStats,
          matchId
        );

        await transaction.set(playerRef, stats, { merge: true });
      });
    } catch (error) {
      console.error(`Error processing stats for player ${playerName}:`, error);
      throw error;
    }
  }

  static calculatePlayerStats(playerName, teamData, currentStats, matchId) {
    const stats = {
      name: playerName,
      teamId: teamData.teamId,
      matches: (currentStats.matches || 0) + 1,
      runs: currentStats.runs || 0,
      balls: currentStats.balls || 0,
      fours: currentStats.fours || 0,
      sixes: currentStats.sixes || 0,
      fifties: currentStats.fifties || 0,
      hundreds: currentStats.hundreds || 0,
      wickets: currentStats.wickets || 0,
      economy: currentStats.economy || 0,
      bowlingBalls: currentStats.bowlingBalls || 0,
      bowlingRuns: currentStats.bowlingRuns || 0,
      fiveWickets: currentStats.fiveWickets || 0,
      catches: currentStats.catches || 0,
      stumpings: currentStats.stumpings || 0,
      dismissals: (currentStats.catches || 0) + (currentStats.stumpings || 0),
      lastMatchId: matchId,
      lastUpdated: new Date().toISOString()
    };

    this.updateBattingStats(stats, teamData, playerName);
    this.updateBowlingStats(stats, teamData, playerName);
    this.updateFieldingStats(stats, teamData, playerName);

    return stats;
  }

  static updateBattingStats(stats, teamData, playerName) {
    const battingData = teamData.batsmen.find(b => b?.name === playerName);
    if (battingData) {
      const newRuns = parseInt(battingData.runs || 0);
      stats.runs += newRuns;
      stats.balls += parseInt(battingData.balls || 0);
      stats.fours += parseInt(battingData.fours || 0);
      stats.sixes += parseInt(battingData.sixes || 0);

      if (newRuns >= 50 && newRuns < 100) {
        stats.fifties += 1;
      } else if (newRuns >= 100) {
        stats.hundreds += 1;
      }

      stats.battingAverage = stats.matches > 0 ? 
        (stats.runs / stats.matches).toFixed(2) : "0.00";
      stats.strikeRate = stats.balls > 0 ? 
        ((stats.runs / stats.balls) * 100).toFixed(2) : "0.00";
    }
  }

  static updateBowlingStats(stats, teamData, playerName) {
    const bowlingData = teamData.bowlers.find(b => b?.name === playerName);
    if (bowlingData) {
      const wickets = parseInt(bowlingData.wickets || 0);
      const overs = parseFloat(bowlingData.overs || 0);
      const bowlingRuns = parseInt(bowlingData.runs || 0);
      
      stats.wickets += wickets;
      stats.bowlingBalls += Math.floor(overs) * 6 + (overs % 1) * 10;
      stats.bowlingRuns += bowlingRuns;

      if (wickets >= 5) {
        stats.fiveWickets += 1;
      }

      stats.bowlingAverage = stats.wickets > 0 ? 
        (stats.bowlingRuns / stats.wickets).toFixed(2) : "0.00";
      stats.economy = stats.bowlingBalls > 0 ? 
        ((stats.bowlingRuns / stats.bowlingBalls) * 6).toFixed(2) : "0.00";
    }
  }

  static updateFieldingStats(stats, teamData, playerName) {
    teamData.batsmen.forEach(b => {
      if (b?.dismissal) {
        if (b.dismissal.includes(`c ${playerName}`)) {
          stats.catches += 1;
          stats.dismissals += 1;
        } else if (b.dismissal.includes(`st ${playerName}`)) {
          stats.stumpings += 1;
          stats.dismissals += 1;
        }
      }
    });
  }
}
