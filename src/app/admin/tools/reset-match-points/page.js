"use client";

import React, { useState } from 'react';
import { db } from "../../../../firebase";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc,
  arrayRemove
} from "firebase/firestore";
import styles from "../../tournaments/admin.module.css";

export default function ResetMatchPointsPage() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [matchId, setMatchId] = useState('114960');
  const [weekNumber, setWeekNumber] = useState('1');
  
  async function resetAndRecalculateMatchPoints(matchId, weekNumber) {
    try {
      console.log(`Starting reset for match ${matchId}, week ${weekNumber}`);
      
      // 1. Get all userWeeklyStats documents for this week
      const weeklyStatsRef = collection(db, "userWeeklyStats");
      const weeklyStatsQuery = query(
        weeklyStatsRef,
        where("weekNumber", "==", parseInt(weekNumber))
      );
      
      const weeklyStatsSnapshot = await getDocs(weeklyStatsQuery);
      console.log(`Found ${weeklyStatsSnapshot.size} weekly stats documents`);
      
      // 2. Reset points and remove match from processedMatches
      const updatePromises = [];
      
      weeklyStatsSnapshot.forEach(docSnapshot => {
        const docData = docSnapshot.data();
        const processedMatches = docData.processedMatches || [];
        
        // Check if this match was processed for this user
        if (processedMatches.includes(matchId)) {
          console.log(`Resetting match ${matchId} for user ${docData.userId}`);
          
          // Calculate how many points to subtract
          let pointsToSubtract = 0;
          if (docData.pointsBreakdown) {
            // Sum up finalPoints from all players for this match
            docData.pointsBreakdown.forEach(playerPoints => {
              pointsToSubtract += (playerPoints.finalPoints || 0);
            });
          }
          
          // Update document - subtract points and remove match from processedMatches
          updatePromises.push(
            updateDoc(docSnapshot.ref, {
              points: Math.max(0, (docData.points || 0) - pointsToSubtract),
              processedMatches: arrayRemove(matchId),
              // Clear the pointsBreakdown array (optional)
              pointsBreakdown: []
            })
          );
        }
      });
      
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        console.log(`Reset ${updatePromises.length} documents`);
      } else {
        console.log("No documents needed resetting");
      }
      
      // 3. Trigger recalculation via API
      console.log("Triggering recalculation...");
      const response = await fetch(`/api/cron/update-matches?matchId=${matchId}`);
      const result = await response.json();
      console.log("Recalculation result:", result);
      
      return {
        success: true,
        message: `Reset and recalculated ${updatePromises.length} documents for match ${matchId}`
      };
    } catch (error) {
      console.error("Error resetting match points:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  const handleResetPoints = async () => {
    setLoading(true);
    setMessage({ text: 'Processing...', type: 'info' });
    
    try {
      const result = await resetAndRecalculateMatchPoints(matchId, weekNumber);
      setMessage({ 
        text: result.success ? result.message : result.error, 
        type: result.success ? 'success' : 'error' 
      });
    } catch (error) {
      setMessage({ text: `Error: ${error.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={styles.container}>
      <h1>Reset Match Points</h1>
      
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <div className={styles.card}>
        <h2>Reset and Recalculate Match Points</h2>
        <p>This tool will reset points for a specific match and trigger recalculation.</p>
        
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
          <label htmlFor="weekNumber">Week Number:</label>
          <input
            type="number"
            id="weekNumber"
            value={weekNumber}
            onChange={(e) => setWeekNumber(e.target.value)}
            placeholder="Enter week number"
            className={styles.input}
          />
        </div>
        
        <button
          onClick={handleResetPoints}
          disabled={loading}
          className={styles.button}
        >
          {loading ? "Processing..." : "Reset and Recalculate"}
        </button>
      </div>
      
      <div className={styles.card}>
        <h2>Instructions</h2>
        <ul>
          <li>This tool resets points for a specific match and week</li>
          <li>It will subtract points from userWeeklyStats and remove the match from processedMatches</li>
          <li>Then it will trigger the cron job to recalculate points for the match</li>
          <li>This should resolve issues with incorrect point calculations</li>
        </ul>
      </div>
    </div>
  );
}
