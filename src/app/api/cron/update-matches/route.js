// This fix addresses three issues with user points calculation:
// 1. Match-to-week assignment
// 2. Points aggregation in weekly stats
// 3. Ranking updates

// 1. First, let's add a function to the admin tournaments page to ensure all 
// matches are properly assigned to weeks:

// Add to src/app/admin/tournaments/page.js
// Find the `handleAssignMatch` function and update it to also recalculate points:

const handleAssignMatch = async (e) => {
  e.preventDefault();
  
  try {
    await setDoc(doc(db, 'matchWeeks', matchAssignment.matchId), {
      matchId: matchAssignment.matchId,
      tournamentId: selectedTournament.id,
      weekNumber: parseInt(matchAssignment.weekNumber),
      assignedAt: new Date()
    });
    
    setMessage({ type: 'success', text: 'Match assigned successfully' });
    setMatchAssignment({ matchId: '', weekNumber: '' });
    
    // Trigger points recalculation for this match
    try {
      await transferService.updateUserWeeklyStats(matchAssignment.matchId);
      setMessage({ type: 'success', text: 'Match assigned and points recalculated' });
    } catch (pointsError) {
      console.error('Error recalculating points:', pointsError);
      setMessage({ 
        type: 'warning', 
        text: 'Match assigned but points recalculation failed. Try manual recalculation.' 
      });
    }
    
    // Refresh the list of match assignments
    fetchMatchAssignments();
  } catch (error) {
    console.error('Error assigning match:', error);
    setMessage({ type: 'error', text: `Error assigning match: ${error.message}` });
  }
};

// 2. Next, fix the updateUserWeeklyStats method in transferService.js:
// Replace the existing method with this improved version:

static async updateUserWeeklyStats(matchId) {
  try {
    console.log(`Starting weekly stats update for match ${matchId}`);
    
    // First try to get the week number from the explicit mapping
    const matchWeekRef = doc(db, 'matchWeeks', matchId);
    const matchWeekDoc = await getDoc(matchWeekRef);
    
    let weekNumber;
    let tournamentId;
    
    // If we have an explicit mapping, use it
    if (matchWeekDoc.exists()) {
      weekNumber = matchWeekDoc.data().weekNumber;
      tournamentId = matchWeekDoc.data().tournamentId;
      console.log(`Found explicit mapping: Match ${matchId} belongs to Week ${weekNumber} of tournament ${tournamentId}`);
    } else {
      // Otherwise, fall back to calculating based on date
      // Get match data
      const matchRef = doc(db, 'matches', matchId);
      const matchDoc = await getDoc(matchRef);
      if (!matchDoc.exists()) {
        throw new Error(`Match ${matchId} not found`);
      }
      
      const matchData = matchDoc.data();
      const matchDate = matchData.matchInfo?.startDate || 
                         matchData.matchHeader?.matchStartTimestamp || 
                         new Date();
      
      // Get active tournament
      const tournament = await this.getActiveTournament();
      if (!tournament) {
        console.warn('No active tournament found');
        return { success: false, error: 'No active tournament found' };
      }
      
      tournamentId = tournament.id;
      
      // Find which week this match belongs to
      weekNumber = this.findMatchWeek(matchDate, tournament.transferWindows);
      if (!weekNumber) {
        console.warn(`Could not determine week for match ${matchId}`);
        return { success: false, error: 'Could not determine week' };
      }
      
      console.log(`Calculated match ${matchId} belongs to Week ${weekNumber} of tournament ${tournamentId}`);
      
      // IMPORTANT: Store this mapping for future use
      try {
        await setDoc(matchWeekRef, {
          matchId,
          tournamentId,
          weekNumber,
          autoAssigned: true,
          assignedAt: new Date()
        });
        console.log(`Created match week mapping for match ${matchId}`);
      } catch (mappingError) {
        console.error('Error creating match week mapping:', mappingError);
        // Continue anyway - this is not critical
      }
    }
    
    // Get all user teams for this tournament
    const userTeamsRef = collection(db, 'userTeams');
    const userTeamsQuery = query(userTeamsRef, where('tournamentId', '==', tournamentId));
    const teamsSnapshot = await getDocs(userTeamsQuery);
    
    console.log(`Processing ${teamsSnapshot.size} user teams for tournament ${tournamentId}`);
    
    // Process each user team
    const updatePromises = [];
    teamsSnapshot.forEach(teamDoc => {
      const team = teamDoc.data();
      const userId = team.userId;
      const players = team.players || [];
      
      updatePromises.push(
        this.calculateAndUpdateUserPoints(userId, players, matchId, tournamentId, weekNumber)
      );
    });
    
    await Promise.all(updatePromises);
    console.log(`Successfully updated weekly stats for ${updatePromises.length} users`);
    
    // IMPORTANT: Update weekly rankings after processing all users
    try {
      await this.updateWeeklyRankings(tournamentId, weekNumber);
      console.log(`Updated weekly rankings for tournament ${tournamentId}, week ${weekNumber}`);
      
      // Also update overall rankings
      await this.updateOverallRankings(tournamentId);
      console.log(`Updated overall rankings for tournament ${tournamentId}`);
    } catch (rankingError) {
      console.error('Error updating rankings:', rankingError);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating user weekly stats:', error);
    throw error;
  }
}

// 3. Fix the calculateAndUpdateUserPoints method to ensure it's correctly 
// calculating and storing points with the right multipliers:

static async calculateAndUpdateUserPoints(userId, players, matchId, tournamentId, weekNumber) {
  try {
    console.log(`Calculating points for user ${userId}, match ${matchId}, week ${weekNumber}`);
    
    // Initialize total points for this match
    let totalPoints = 0;
    let captainPoints = 0;
    let viceCaptainPoints = 0;
    let pointsBreakdown = [];
    
    // Get match points for each player
    for (const player of players) {
      // Create player doc ID from id
      const playerId = player.id;
      
      // Check if player has points for this match
      const pointsRef = doc(db, 'playerPoints', `${playerId}_${matchId}`);
      const pointsDoc = await getDoc(pointsRef);
      
      if (pointsDoc.exists()) {
        const playerPoints = pointsDoc.data().points || 0;
        const playerName = player.name || 'Unknown Player';
        
        // Apply captain/vice-captain multipliers
        let multipliedPoints = playerPoints;
        let multiplier = 1;
        
        if (player.isCaptain) {
          multiplier = 2;
          multipliedPoints = playerPoints * multiplier;
          captainPoints = multipliedPoints;
          console.log(`Captain ${playerName} earned ${playerPoints} x ${multiplier} = ${multipliedPoints} points`);
        } else if (player.isViceCaptain) {
          multiplier = 1.5;
          multipliedPoints = playerPoints * multiplier;
          viceCaptainPoints = multipliedPoints;
          console.log(`Vice-Captain ${playerName} earned ${playerPoints} x ${multiplier} = ${multipliedPoints} points`);
        } else {
          console.log(`Player ${playerName} earned ${playerPoints} points`);
        }
        
        // Add to the points breakdown
        pointsBreakdown.push({
          playerId,
          playerName,
          basePoints: playerPoints,
          multiplier,
          finalPoints: multipliedPoints,
          isCaptain: player.isCaptain || false,
          isViceCaptain: player.isViceCaptain || false
        });
        
        totalPoints += multipliedPoints;
      }
    }
    
    console.log(`Total points for user ${userId} in match ${matchId}: ${totalPoints}`);
    
    // Update user's weekly stats
    const weeklyStatsRef = doc(db, 'userWeeklyStats', `${userId}_${tournamentId}_${weekNumber}`);
    const weeklyStatsDoc = await getDoc(weeklyStatsRef);
    
    const now = new Date();
    
    if (weeklyStatsDoc.exists()) {
      // Update existing stats
      const currentData = weeklyStatsDoc.data();
      const currentPoints = currentData.points || 0;
      const currentMatches = currentData.matches || [];
      
      // Check if this match has already been processed
      if (currentMatches.includes(matchId)) {
        console.log(`Match ${matchId} already processed for user ${userId}, week ${weekNumber}`);
        return { success: true, alreadyProcessed: true };
      }
      
      // Add this match to the processed list
      const updatedMatches = [...currentMatches, matchId];
      
      // Update with new points
      await updateDoc(weeklyStatsRef, {
        points: currentPoints + totalPoints,
        matches: updatedMatches,
        lastMatchId: matchId,
        captainPoints: (currentData.captainPoints || 0) + captainPoints,
        viceCaptainPoints: (currentData.viceCaptainPoints || 0) + viceCaptainPoints,
        pointsBreakdown: [...(currentData.pointsBreakdown || []), ...pointsBreakdown],
        updatedAt: now
      });
    } else {
      // Create new stats entry
      await setDoc(weeklyStatsRef, {
        userId,
        tournamentId,
        weekNumber,
        points: totalPoints,
        matches: [matchId],
        lastMatchId: matchId,
        captainPoints,
        viceCaptainPoints,
        pointsBreakdown,
        rank: 0, // Will be updated by updateWeeklyRankings
        transferWindowId: weekNumber.toString(),
        createdAt: now,
        updatedAt: now
      });
    }
    
    // Also update the user's total points in the users collection
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const currentTotalPoints = userData.totalPoints || 0;
      
      await updateDoc(userRef, {
        totalPoints: currentTotalPoints + totalPoints,
        lastUpdated: now
      });
      
      console.log(`Updated total points for user ${userId}: ${currentTotalPoints} + ${totalPoints} = ${currentTotalPoints + totalPoints}`);
    }
    
    return { success: true, points: totalPoints };
  } catch (error) {
    console.error(`Error calculating points for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
}

// 4. Create a utility script for manual points recalculation
// Add this to src/app/admin/tools/recalculate-points.js:

"use client";

import React, { useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { transferService } from '../../services/transferService';
import styles from '../admin.module.css';

export default function RecalculatePointsPage() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [matchId, setMatchId] = useState('');
  const [weekNumber, setWeekNumber] = useState('');
  const [tournament, setTournament] = useState(null);
  
  const handleRecalculateMatch = async () => {
    if (!matchId) {
      setMessage({ text: 'Please enter a match ID', type: 'error' });
      return;
    }
    
    try {
      setLoading(true);
      setMessage({ text: 'Recalculating points...', type: 'info' });
      
      // Get active tournament if not already set
      if (!tournament) {
        const activeTournament = await transferService.getActiveTournament();
        setTournament(activeTournament);
      }
      
      // Check if match exists in matchWeeks collection
      const matchWeekRef = doc(db, 'matchWeeks', matchId);
      const matchWeekDoc = await getDoc(matchWeekRef);
      
      if (!matchWeekDoc.exists() && !weekNumber) {
        setMessage({ 
          text: 'Match not assigned to any week. Please specify a week number.', 
          type: 'error' 
        });
        setLoading(false);
        return;
      }
      
      // If week specified and no existing mapping, create one
      if (!matchWeekDoc.exists() && weekNumber) {
        await setDoc(matchWeekRef, {
          matchId,
          tournamentId: tournament.id,
          weekNumber: parseInt(weekNumber),
          manualAssignment: true,
          assignedAt: new Date()
        });
        
        setMessage({ text: 'Created match-week mapping', type: 'info' });
      }
      
      // Call the updateUserWeeklyStats method
      await transferService.updateUserWeeklyStats(matchId);
      
      setMessage({ 
        text: `Points recalculated successfully for match ${matchId}`, 
        type: 'success' 
      });
    } catch (error) {
      console.error('Error recalculating points:', error);
      setMessage({ text: `Error: ${error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={styles.container}>
      <h1>Recalculate User Points</h1>
      
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <div className={styles.card}>
        <h2>Recalculate Points for a Match</h2>
        <p>Enter a match ID to recalculate points for all users.</p>
        
        <div className={styles.formGroup}>
          <label htmlFor="matchId">Match ID:</label>
          <input
            type="text"
            id="matchId"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            placeholder="Enter match ID"
            className={styles.input}
          />
        </div>
        
        <div className={styles.formGroup}>
          <label htmlFor="weekNumber">Week Number (only if not already assigned):</label>
          <input
            type="number"
            id="weekNumber"
            value={weekNumber}
            onChange={(e) => setWeekNumber(e.target.value)}
            placeholder="Week number (optional)"
            className={styles.input}
          />
        </div>
        
        <button
          onClick={handleRecalculateMatch}
          disabled={loading}
          className={styles.button}
        >
          {loading ? "Processing..." : "Recalculate Points"}
        </button>
      </div>
      
      <div className={styles.card}>
        <h2>Instructions</h2>
        <ul>
          <li>This tool recalculates user points for a specific match</li>
          <li>The match must be assigned to a week for points to be calculated correctly</li>
          <li>If the match is not already assigned to a week, specify the week number</li>
          <li>This process updates both weekly stats and overall user rankings</li>
        </ul>
      </div>
    </div>
  );
}
