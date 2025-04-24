// src/app/services/sheetsSyncSimple.js

import { db } from '../../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  updateDoc, 
  setDoc 
} from 'firebase/firestore';
import { transferService } from './transferService';
import { google } from 'googleapis';

export class SheetsSyncService {
  /**
   * Initialize Google Sheets API client with service account credentials
   * @returns {Promise<Object>} - Authenticated Google Sheets API client
   */
  static async getAuthenticatedSheetsClient() {
    try {
      // Get service account credentials from environment variables
      // In production, you should store these as secure environment variables
      // For development, you can use a JSON file (add to .gitignore!)
      
      // Option 1: Using environment variables (recommended for production)
      const credentials = {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
      };
      
      // Option 2: Using a JSON file (for development)
      // const credentials = require('../../../service-account-key.json');
      
      // Create a JWT client
      const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets.readonly']
      );
      
      // Authenticate
      await auth.authorize();
      
      // Create and return the Sheets API client
      return google.sheets({ version: 'v4', auth });
    } catch (error) {
      console.error('Error authenticating with Google Sheets:', error);
      throw error;
    }
  }
  
  /**
   * Fetch player performance data from Google Sheets API
   * @param {string} sheetId - The Google Sheets ID
   * @returns {Promise<Array>} - Array of player performance data
   */
  static async fetchPerformanceData(sheetId) {
    try {
      // Get authenticated client
      const sheets = await this.getAuthenticatedSheetsClient();
      
      // Make the API request
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'Player_Performance!A1:W1000'
      });
      
      const data = response.data;
      
      if (!data.values || data.values.length === 0) {
        throw new Error('No data found in spreadsheet');
      }
      
      // Transform sheet data to a usable format
      // Get headers from first row
      const headers = data.values[0];
      const rows = data.values.slice(1);
      
      return rows.map(row => {
        const playerData = {};
        headers.forEach((header, index) => {
          // Use trimmed header names to match Firebase field names
          playerData[header.trim()] = row[index];
        });
        return playerData;
      });
    } catch (error) {
      console.error('Error fetching data from Google Sheets:', error);
      throw error;
    }
  }

/**
 * Update user weekly stats using the transfer history system
 * This function ensures that the correct team is used for each week
 * @param {Array} performanceData - Array of player performance data from sheets
 * @returns {Promise<Object>} - Result of the operation
 */
static async updateUserStats(performanceData) {
  try {
    console.log('Updating user stats from performance data using transfer history...');
    
    // Get active tournament
    const tournament = await transferService.getActiveTournament();
    if (!tournament) {
      return { success: false, error: 'No active tournament found' };
    }
    
    // Process data by week and match
    const weekGroups = new Map();
    
    // Group data by week and match
    performanceData.forEach(playerData => {
      const week = playerData.Week;
      const matchId = playerData.Match;
      const playerName = playerData.Players;
      const teamName = playerData.Team;
      const totalPoints = parseFloat(playerData['Total Points']) || 0;
      
      if (!week || !matchId || !playerName) return;
      
      const weekNum = parseInt(week);
      if (isNaN(weekNum)) return;
      
      // Create key for this week if it doesn't exist
      if (!weekGroups.has(weekNum)) {
        weekGroups.set(weekNum, new Map());
      }
      
      // Create key for this match if it doesn't exist
      const matchesInWeek = weekGroups.get(weekNum);
      if (!matchesInWeek.has(matchId)) {
        matchesInWeek.set(matchId, []);
      }
      
      // Add player data to the specific match in this week
      matchesInWeek.get(matchId).push({
        weekNumber: weekNum,
        matchId,
        playerName,
        teamName,
        totalPoints
      });
    });
    
    // Get all user teams for this tournament
    const userTeamsRef = collection(db, 'userTeams');
    const userTeamsQuery = query(userTeamsRef, where('tournamentId', '==', tournament.id));
    const teamsSnapshot = await getDocs(userTeamsQuery);
    
    if (teamsSnapshot.empty) {
      return { success: false, error: 'No user teams found for this tournament' };
    }
    
    const userIds = [];
    teamsSnapshot.forEach(doc => {
      userIds.push(doc.data().userId);
    });
    
    // Process each week's data
    const results = [];
    
    for (const [weekNum, matchesMap] of weekGroups.entries()) {
      try {
        console.log(`Processing Week ${weekNum} data with ${matchesMap.size} matches`);
        
        // Process each user
        for (const userId of userIds) {
          try {
            // Get the correct team for this week from transfer history
            // This is the critical part that uses the new transfer history system
            let teamPlayers = await this.getTeamForWeek(userId, tournament.id, weekNum);
            
            if (!teamPlayers || teamPlayers.length === 0) {
              console.warn(`No team found for user ${userId} in week ${weekNum}, skipping`);
              continue;
            }
            
            // Get existing weekly stats document
            const weeklyStatsRef = doc(db, 'userWeeklyStats', `${userId}_${tournament.id}_${weekNum}`);
            const weeklyStatsDoc = await getDoc(weeklyStatsRef);
            
            // Clear and recalculate all points from scratch for this week to avoid duplication
            let pointsBreakdown = [];
            let processedMatches = [];
            let weeklyPoints = 0;
            
            // Process each match in this week
            for (const [matchId, matchPlayers] of matchesMap.entries()) {
              console.log(`Processing match ${matchId} for user ${userId}`);
              
              // Calculate match points for this user's team
              const matchBreakdown = [];
              
              // Check each of the user's players
              for (const player of teamPlayers) {
                // Find this player in the match data
                // We'll do a case-insensitive match on player name
                const playerPerformance = matchPlayers.find(p => 
                  p.playerName.toLowerCase() === player.name.toLowerCase()
                );
                
                if (playerPerformance) {
                  let basePoints = playerPerformance.totalPoints;
                  let playerPoints = basePoints;
                  
                  // Apply captain/vice-captain multipliers
                  if (player.isCaptain) {
                    playerPoints *= 2;
                  } else if (player.isViceCaptain) {
                    playerPoints *= 1.5;
                  }
                  
                  // Add to breakdown
                  matchBreakdown.push({
                    playerId: player.id,
                    playerName: player.name,
                    basePoints: basePoints,
                    finalPoints: playerPoints,
                    isCaptain: player.isCaptain || false,
                    isViceCaptain: player.isViceCaptain || false,
                    multiplier: player.isCaptain ? 2 : (player.isViceCaptain ? 1.5 : 1),
                    matchId: matchId // Include match ID for future tracking
                  });
                  
                  // Add to total
                  weeklyPoints += playerPoints;
                }
              }
              
              // Add this match's breakdown to overall breakdown
              pointsBreakdown = [...pointsBreakdown, ...matchBreakdown];
              
              // Add this match to processed matches
              processedMatches.push(matchId);
            }
            
            // Update or create the weekly stats document
            if (weeklyStatsDoc.exists()) {
              // Update existing stats
              await updateDoc(weeklyStatsRef, {
                points: weeklyPoints,
                pointsBreakdown: pointsBreakdown,
                processedMatches: processedMatches,
                updatedAt: new Date()
              });
            } else {
              // Create new stats
              await setDoc(weeklyStatsRef, {
                userId: userId,
                tournamentId: tournament.id,
                weekNumber: weekNum,
                points: weeklyPoints,
                pointsBreakdown: pointsBreakdown,
                processedMatches: processedMatches,
                rank: 0, // Will be updated by ranking function
                transferWindowId: `${weekNum}`,
                createdAt: new Date()
              });
            }
            
            console.log(`Updated stats for user ${userId}, week ${weekNum}: ${weeklyPoints} points`);
          } catch (userError) {
            console.error(`Error processing user ${userId} for week ${weekNum}:`, userError);
          }
        }
        
        // Update weekly rankings
        await transferService.updateWeeklyRankings(tournament.id, weekNum);
        
        // Count total players across all matches in this week
        let totalPlayersProcessed = 0;
        for (const players of matchesMap.values()) {
          totalPlayersProcessed += players.length;
        }
        
        results.push({
          week: weekNum,
          status: 'success',
          playersProcessed: totalPlayersProcessed,
          matchesProcessed: matchesMap.size,
          teamsProcessed: userIds.length
        });
      } catch (weekError) {
        console.error(`Error processing week ${weekNum}:`, weekError);
        results.push({
          week: weekNum,
          status: 'error',
          error: weekError.message
        });
      }
    }
    
    // Update overall rankings
    await transferService.updateOverallRankings(tournament.id);
    
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('Error updating user stats from sheets:', error);
    return { success: false, error: error.message };
  }
}
  // Add this method to src/app/services/sheetsSyncSimple.js

/**
 * Fetch cap holders data from Google Sheets API
 * @param {string} sheetId - The Google Sheets ID
 * @returns {Promise<Array>} - Array of cap holders data
 */
static async fetchCapPointsData(sheetId) {
  try {
    // Get authenticated client
    const sheets = await this.getAuthenticatedSheetsClient();
    
    // Make the API request
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'Cap_Points!A1:D1000'  // A-D columns to include Week, Orange Cap, Purple Cap
    });
    
    const data = response.data;
    
    if (!data.values || data.values.length === 0) {
      throw new Error('No data found in Cap_Points sheet');
    }
    
    // Transform sheet data to a usable format
    // Get headers from first row
    const headers = data.values[0];
    const rows = data.values.slice(1);
    
    return rows.map(row => {
      const capData = {};
      headers.forEach((header, index) => {
        // Use trimmed header names to match Firebase field names
        capData[header.trim()] = row[index];
      });
      return capData;
    });
  } catch (error) {
    console.error('Error fetching cap data from Google Sheets:', error);
    throw error;
  }
}

/**
 * Get the correct team for a specific week using transfer history
 * @param {string} userId - The user ID
 * @param {string} tournamentId - The tournament ID
 * @param {number} weekNumber - The week number
 * @returns {Promise<Array>} - Array of players for this week
 */
static async getTeamForWeek(userId, tournamentId, weekNumber) {
  try {
    // First check transfer history for this specific week
    const transferHistoryRef = doc(db, 'userTransferHistory', `${userId}_${tournamentId}_${weekNumber}`);
    const transferHistoryDoc = await getDoc(transferHistoryRef);
    
    if (transferHistoryDoc.exists()) {
      // Use the team from this week's transfer history
      console.log(`Found transfer history for user ${userId}, week ${weekNumber}`);
      return transferHistoryDoc.data().players;
    }
    
    // If no transfer for this week, find the most recent transfer before this week
    console.log(`No transfer history found for user ${userId}, week ${weekNumber}, looking for previous weeks`);
    
    let currentWeek = weekNumber - 1;
    while (currentWeek > 0) {
      const prevHistoryRef = doc(db, 'userTransferHistory', `${userId}_${tournamentId}_${currentWeek}`);
      const prevHistoryDoc = await getDoc(prevHistoryRef);
      
      if (prevHistoryDoc.exists()) {
        console.log(`Found transfer history for user ${userId}, week ${currentWeek}`);
        return prevHistoryDoc.data().players;
      }
      
      currentWeek--;
    }
    
    // If still no team found, use current team
    console.log(`No transfer history found for any previous week, using current team for user ${userId}`);
    const teamRef = doc(db, 'userTeams', `${userId}_${tournamentId}`);
    const teamDoc = await getDoc(teamRef);
    
    if (teamDoc.exists()) {
      return teamDoc.data().players;
    }
    
    // If no team found, return empty array
    return [];
  } catch (error) {
    console.error(`Error getting team for week ${weekNumber}:`, error);
    throw error;
  }
}
}
