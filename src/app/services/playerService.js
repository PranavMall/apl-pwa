import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

export class PlayerService {
  static PLAYER_ROLES = {
    BATSMAN: 'batsman',
    BOWLER: 'bowler',
    ALLROUNDER: 'allrounder',
    WICKETKEEPER: 'wicketkeeper'
  };

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
}
