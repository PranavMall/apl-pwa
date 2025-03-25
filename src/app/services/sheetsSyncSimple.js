// src/app/services/sheetsSyncService.js

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
      const credentials = {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
      };
      
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
        range: 'Player_Performance!A1:V1000'
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
   * Helper function to normalize player names for reliable matching
   * @param {string} name - The player name to normalize
   * @returns {string} - Normalized player name
   */

  static normalizePlayerName(name) {
    if (!name) return '';
    // Remove punctuation, normalize spaces, and convert to lowercase
    return name.replace(/[^\w\s]/g, '')  // Remove punctuation
              .replace(/\s+/g, ' ')      // Normalize spaces
              .trim()                    // Trim spaces
              .toLowerCase();            // Convert to lowercase
  }
  
/**
 * Process data for a specific week and prepare it for usage
 * @param {Array} performanceData - Performance data from sheets
 * @param {number|null} targetWeek - Specific week to process or null for all weeks
 * @returns {Map} - Map of week numbers to processed player data
 */
static processDataByWeek(performanceData, targetWeek = null) {
  // Group data by week
  const weekGroups = new Map();
  
  performanceData.forEach(playerData => {
    const week = playerData.Week;
    const matchId = playerData.Match;
    const playerName = playerData.Players;
    const teamName = playerData.Team;
    // Ensure we're parsing the Total Points as a number and default to 0 if invalid
    const totalPoints = parseFloat(playerData['Total Points']) || 0;
    
    if (!week || !playerName) return;
    
    const weekNum = parseInt(week);
    if (isNaN(weekNum)) return;
    
    // Skip weeks that don't match the target week if specified
    if (targetWeek !== null && weekNum !== targetWeek) return;
    
    // Create key for this week if it doesn't exist
    if (!weekGroups.has(weekNum)) {
      weekGroups.set(weekNum, {
        players: [],
        unmatchedPlayers: new Map() // Initialize unmatchedPlayers as a Map for each week
      });
    }
    
    // Add the player to this week's data, including the normalized name
    weekGroups.get(weekNum).players.push({
      weekNumber: weekNum,
      matchId: matchId || `week-${weekNum}`,
      playerName,
      teamName,
      totalPoints,
      // Add normalized name to improve matching
      normalizedName: this.normalizePlayerName(playerName)
    });
  });
  
  // Log summary of processed data
  weekGroups.forEach((weekData, weekNum) => {
    console.log(`Week ${weekNum}: Processed ${weekData.players.length} players`);
  });
  
  return weekGroups;
}
  
/**
 * Update user stats with pagination to avoid timeouts
 * @param {Array} performanceData - Array of player performance data
 * @param {number|null} targetWeek - Specific week to process or null for all weeks
 * @param {number} startIndex - Starting index for pagination
 * @param {number} batchSize - Number of users to process per batch
 * @returns {Promise<Object>} - Result with pagination information
 */
static async updateUserStatsWithPagination(
  performanceData, 
  targetWeek = null,
  startIndex = 0,
  batchSize = 50
) {
  try {
    console.log(`Updating user stats with pagination - Start: ${startIndex}, Batch: ${batchSize}`);
    
    // Get active tournament
    const tournament = await transferService.getActiveTournament();
    if (!tournament) {
      return { success: false, error: 'No active tournament found' };
    }
    
    // Process data by week
    const weekGroups = this.processDataByWeek(performanceData, targetWeek);
    console.log(`Processed data for ${weekGroups.size} week(s)`);
    
    // Get all user teams for this tournament
    const userTeamsRef = collection(db, 'userTeams');
    const userTeamsQuery = query(userTeamsRef, where('tournamentId', '==', tournament.id));
    const teamsSnapshot = await getDocs(userTeamsQuery);
    
    if (teamsSnapshot.empty) {
      return { success: false, error: 'No user teams found for this tournament' };
    }
    
    // Convert snapshot to array
    const allUserTeams = [];
    teamsSnapshot.forEach(doc => {
      allUserTeams.push({
        id: doc.id,
        userId: doc.data().userId,
        tournamentId: doc.data().tournamentId,
        players: doc.data().players || []
      });
    });
    
    console.log(`Found ${allUserTeams.length} total user teams`);
    
    // Apply pagination to user teams
    const endIndex = Math.min(startIndex + batchSize, allUserTeams.length);
    const userTeamsBatch = allUserTeams.slice(startIndex, endIndex);
    const hasMoreUsers = endIndex < allUserTeams.length;
    
    console.log(`Processing users ${startIndex} to ${endIndex - 1} of ${allUserTeams.length}`);
    
    // Process each week's data for the current batch of users
    const results = [];
    
    for (const [weekNum, weekData] of weekGroups.entries()) {
      try {
        console.log(`Processing Week ${weekNum} data (${weekData.length} player records)`);
        
        // Create a map to store unmatched players for this week
        const unmatchedPlayers = new Map();
        
        // Process each user's team in the current batch
        let teamsProcessed = 0;
        for (const userTeam of userTeamsBatch) {
          try {
            // Calculate points for this user's team
            let weeklyPoints = 0;
            const pointsBreakdown = [];
            const userUnmatchedPlayers = [];
            
            // Check each of the user's players
            for (const player of userTeam.players) {
              // Normalize the player name
              const normalizedPlayerName = this.normalizePlayerName(player.name);
              
              // Find this player in the week's data using normalized names
              const playerPerformance = weekData.find(p => 
                p.normalizedName === normalizedPlayerName
              );
              
              if (playerPerformance) {
                let playerPoints = playerPerformance.totalPoints;
                
                // Apply captain/vice-captain multipliers
                if (player.isCaptain) {
                  playerPoints *= 2;
                } else if (player.isViceCaptain) {
                  playerPoints *= 1.5;
                }
                
                // Add to total
                weeklyPoints += playerPoints;
                
                // Add to breakdown
                pointsBreakdown.push({
                  playerId: player.id,
                  playerName: player.name,
                  sheetPlayerName: playerPerformance.playerName,  // For debugging
                  basePoints: playerPerformance.totalPoints,
                  finalPoints: playerPoints,
                  isCaptain: player.isCaptain || false,
                  isViceCaptain: player.isViceCaptain || false,
                  multiplier: player.isCaptain ? 2 : (player.isViceCaptain ? 1.5 : 1)
                });
              } else {
                // Track unmatched player
                userUnmatchedPlayers.push({
                  playerId: player.id,
                  playerName: player.name,
                  normalizedName: normalizedPlayerName
                });
                
                // Add to global unmatched log
                if (!unmatchedPlayers.has(normalizedPlayerName)) {
                  unmatchedPlayers.set(normalizedPlayerName, {
                    playerName: player.name,
                    normalizedName,
                    count: 0,
                    users: []
                  });
                }
                
                const record = unmatchedPlayers.get(normalizedPlayerName);
                record.count++;
                record.users.push(userTeam.userId);
                unmatchedPlayers.set(normalizedPlayerName, record);
              }
            }
            
            // Update weekly stats
            const weeklyStatsRef = doc(db, 'userWeeklyStats', `${userTeam.userId}_${tournament.id}_${weekNum}`);
            const weeklyStatsDoc = await getDoc(weeklyStatsRef);
            
            if (weeklyStatsDoc.exists()) {
              // Update existing stats
              await updateDoc(weeklyStatsRef, {
                points: weeklyPoints,
                pointsBreakdown: pointsBreakdown,
                unmatchedPlayers: userUnmatchedPlayers, // For debugging
                updatedAt: new Date()
              });
            } else {
              // Create new stats
              await setDoc(weeklyStatsRef, {
                userId: userTeam.userId,
                tournamentId: tournament.id,
                weekNumber: weekNum,
                points: weeklyPoints,
                pointsBreakdown: pointsBreakdown,
                unmatchedPlayers: userUnmatchedPlayers, // For debugging
                rank: 0, // Will be updated by ranking function
                transferWindowId: `${weekNum}`,
                createdAt: new Date()
              });
            }
            
            teamsProcessed++;
          } catch (userError) {
            console.error(`Error processing user ${userTeam.userId} for week ${weekNum}:`, userError);
          }
        }
        
        // Update weekly rankings
        await transferService.updateWeeklyRankings(tournament.id, weekNum);
        
        // Log unmatched players if there are any
        if (unmatchedPlayers.size > 0) {
          console.log(`WARNING: ${unmatchedPlayers.size} players couldn't be matched for Week ${weekNum}:`);
          unmatchedPlayers.forEach((record, name) => {
            console.log(`- ${record.playerName} (${record.count} users): ${record.users.slice(0, 3).join(', ')}${record.users.length > 3 ? '...' : ''}`);
          });
        }
        
        results.push({
          week: weekNum,
          status: 'success',
          playersProcessed: weekData.length,
          teamsProcessed,
          unmatchedPlayerCount: unmatchedPlayers.size
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
    
    // Update overall rankings if this is the last batch
    if (!hasMoreUsers) {
      await transferService.updateOverallRankings(tournament.id);
    }
    
    // Collect all unmatched players across all weeks for the API response
    const allUnmatchedPlayers = [];
    weekGroups.forEach((weekData, weekNum) => {
      // This line accesses the unmatchedPlayers map, which might be undefined
      // We'll ensure it exists before accessing
      if (typeof weekData.unmatchedPlayers !== 'undefined') {
        weekData.unmatchedPlayers.forEach((record) => {
          allUnmatchedPlayers.push(record);
        });
      }
    });
    
    return {
      success: true,
      results,
      unmatchedPlayers: allUnmatchedPlayers,
      hasMoreUsers,
      nextStartIndex: hasMoreUsers ? endIndex : null,
      processedUsers: userTeamsBatch.length,
      totalUsers: allUserTeams.length
    };
  } catch (error) {
    console.error('Error updating user stats from sheets:', error);
    return { success: false, error: error.message };
  }
}
  
  // Original method for backward compatibility - calls the new paginated version
  static async updateUserStats(performanceData) {
    return this.updateUserStatsWithPagination(performanceData, null, 0, 1000);
  }
}
