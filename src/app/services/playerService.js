// app/services/playerService.js
import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export class PlayerService {
  static async fetchTeamInfo(teamId) {
    const options = {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': process.env.NEXT_PUBLIC_RAPID_API_KEY,
        'X-RapidAPI-Host': 'cricbuzz-cricket.p.rapidapi.com'
      }
    };

    try {
      const response = await fetch(
        `https://cricbuzz-cricket.p.rapidapi.com/mcenter/v1/${matchId}/team/${teamId}'
        options
      );
      
      if (!response.ok) {
        throw new Error(`Team API responded with status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching team info for ${teamId}:`, error);
      throw error;
    }
  }

  static determineRole(playerData) {
    // Fallback role determination based on stats if API role is not available
    const {
      battingStyle,
      bowlingStyle,
      keeper,
      role: apiRole
    } = playerData;

    // If API provides role, map it to our system
    if (apiRole) {
      if (apiRole.includes('WK') || keeper) return 'wicketkeeper';
      if (apiRole.includes('Batsman')) return 'batsman';
      if (apiRole.includes('Bowler')) return 'bowler';
      if (apiRole.includes('All-Rounder')) return 'allrounder';
    }

    // Fallback logic based on batting/bowling styles
    if (keeper) return 'wicketkeeper';
    if (bowlingStyle && battingStyle) return 'allrounder';
    if (bowlingStyle) return 'bowler';
    return 'batsman'; // Default to batsman if nothing else matches
  }

  static async initializePlayerRoles() {
    try {
      // List of SA20 team IDs
      const sa20Teams = [
        /* Add your team IDs here */
      ];

      const playerRoles = new Map();

      // Fetch and process each team's players
      for (const teamId of sa20Teams) {
        const teamInfo = await this.fetchTeamInfo(teamId);
        
        teamInfo.players['playing XI'].forEach(player => {
          playerRoles.set(player.id.toString(), {
            role: this.determineRole(player),
            teamId: teamId,
            name: player.name,
            fullName: player.fullName,
            battingStyle: player.battingStyle,
            bowlingStyle: player.bowlingStyle,
            keeper: player.keeper,
            captain: player.captain
          });
        });
      }

      // Update Firebase with player roles
      const batch = db.batch();
      
      playerRoles.forEach((playerData, playerId) => {
        const playerRef = doc(db, 'players', playerId);
        batch.set(playerRef, playerData, { merge: true });
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error('Error initializing player roles:', error);
      throw error;
    }
  }

  static async updatePlayerRolesForMatch(matchData) {
    try {
      const playerUpdates = new Map();

      // Process both teams' players
      [matchData.team1, matchData.team2].forEach(team => {
        team.players?.forEach(player => {
          const playerId = player.id.toString();
          if (!playerUpdates.has(playerId)) {
            playerUpdates.set(playerId, {
              name: player.name,
              teamId: team.teamId,
              lastUpdated: new Date().toISOString()
            });
          }
        });
      });

      // Batch update players
      const batch = db.batch();
      
      for (const [playerId, data] of playerUpdates) {
        const playerRef = doc(db, 'players', playerId);
        batch.update(playerRef, data);
      }

      await batch.commit();
      return true;
    } catch (error) {
      console.error('Error updating player roles:', error);
      throw error;
    }
  }

  static async getPlayersByRole(role) {
    try {
      const playersRef = collection(db, 'players');
      const q = query(playersRef, where('role', '==', role));
      const querySnapshot = await getDocs(q);
      
      const players = [];
      querySnapshot.forEach((doc) => {
        players.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return players;
    } catch (error) {
      console.error('Error fetching players by role:', error);
      throw error;
    }
  }
}
