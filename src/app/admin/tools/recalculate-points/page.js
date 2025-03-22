"use client";

import React, { useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../../../firebase';  // Need to go up one more level
import { transferService } from '../../../../services/transferService';  // Need to go up one more level
import styles from '../../../admin.module.css';  // Assuming you want to use the styles from /admin

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
