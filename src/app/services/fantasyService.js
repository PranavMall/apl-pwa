// src/services/fantasyService.js

import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

export class FantasyService {
  // Initialize configurations for the fantasy game
  static async initializeConfigurations() {
    try {
      const pointsConfig = {
        batting: {
          run: 1,
          boundary4: 1,
          boundary6: 2,
          milestone25: 4,
          milestone50: 8,
          milestone100: 16,
          duck: -5
        },
        bowling: {
          wicket: 25,
          threeWickets: 8,
          fourWickets: 16,
          fiveWickets: 25,
          maiden: 8
        },
        fielding: {
          catch: 8,
          stumping: 12,
          directThrowRunout: 12
        },
        match: {
          played: 5
        },
        multipliers: {
          captain: 2,
          viceCaptain: 1.5
        },
        user: {
          lateRegistration: -25,
          referralBonus: 25,
          maxReferrals: 3
        }
      };

      await setDoc(doc(db, 'configurations', 'points'), pointsConfig);
      return { success: true };
    } catch (error) {
      console.error('Error initializing configurations:', error);
      return { success: false, error: error.message };
    }
  }

  // User team management
  static async createUserTeam(userId, tournamentId, players) {
    try {
      const userTeamData = {
        tournamentId,
        userId,
        registrationDate: new Date(),
        isLateRegistration: false, // This should be calculated based on tournament deadline
        players: players.map(player => ({
          playerId: player.id,
          name: player.name,
          role: player.role,
          isCaptain: player.isCaptain || false,
          isViceCaptain: player.isViceCaptain || false
        })),
        transfersRemaining: 2,
        lastTransferDate: null
      };

      await setDoc(doc(db, 'userTeams', `${userId}_${tournamentId}`), userTeamData);
      return { success: true, teamId: `${userId}_${tournamentId}` };
    } catch (error) {
      console.error('Error creating user team:', error);
      return { success: false, error: error.message };
    }
  }

  // Tournament management
  static async createTournament(tournamentData) {
    try {
      const tournament = {
        name: tournamentData.name,
        startDate: new Date(tournamentData.startDate),
        endDate: new Date(tournamentData.endDate),
        registrationDeadline: new Date(tournamentData.registrationDeadline),
        status: "upcoming",
        transferWindows: tournamentData.transferWindows.map(window => ({
          startDate: new Date(window.startDate),
          endDate: new Date(window.endDate),
          weekNumber: window.weekNumber,
          status: "upcoming"
        }))
      };

      await setDoc(doc(db, 'tournaments', tournamentData.id), tournament);
      return { success: true, tournamentId: tournamentData.id };
    } catch (error) {
      console.error('Error creating tournament:', error);
      return { success: false, error: error.message };
    }
  }

  // User stats management
  static async initializeUserTournamentStats(userId, tournamentId) {
    try {
      const statsData = {
        userId,
        tournamentId,
        totalPoints: 0,
        highestMatchPoints: 0,
        lowestMatchPoints: 0,
        averageMatchPoints: 0,
        currentRank: 0,
        highestRank: 0,
        lowestRank: 0,
        referralPoints: 0,
        penaltyPoints: 0
      };

      await setDoc(
        doc(db, 'userTournamentStats', `${userId}_${tournamentId}`), 
        statsData
      );
      return { success: true };
    } catch (error) {
      console.error('Error initializing user tournament stats:', error);
      return { success: false, error: error.message };
    }
  }

  // Fetch user team
  static async getUserTeam(userId, tournamentId) {
    try {
      const teamDoc = await getDoc(doc(db, 'userTeams', `${userId}_${tournamentId}`));
      if (teamDoc.exists()) {
        return { success: true, team: teamDoc.data() };
      }
      return { success: false, error: 'Team not found' };
    } catch (error) {
      console.error('Error fetching user team:', error);
      return { success: false, error: error.message };
    }
  }

  // Update user team
  static async updateUserTeam(userId, tournamentId, updates) {
    try {
      const teamRef = doc(db, 'userTeams', `${userId}_${tournamentId}`);
      await setDoc(teamRef, updates, { merge: true });
      return { success: true };
    } catch (error) {
      console.error('Error updating user team:', error);
      return { success: false, error: error.message };
    }
  }
}
