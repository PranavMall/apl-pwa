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
  setDoc,
  deleteField,
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
    
    // 1. Set reset flag to block concurrent processing
    const processStateRef = doc(db, 'processingState', matchId);
    await setDoc(processStateRef, {
      resetInProgress: true,
      lastResetAttempt: new Date()
    }, { merge: true });
    
    // 2. Get all userWeeklyStats documents for this week
    const weeklyStatsRef = collection(db, "userWeeklyStats");
    const weeklyStatsQuery = query(
      weeklyStatsRef,
      where("weekNumber", "==", parseInt(weekNumber))
    );
    
    const weeklyStatsSnapshot = await getDocs(weeklyStatsQuery);
    console.log(`Found ${weeklyStatsSnapshot.size} weekly stats documents`);
    
    // 3. Reset points and clear match data
    const updatePromises = [];
    
    weeklyStatsSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data();
      
      // Log document data for debugging
      console.log(`Checking document ${docSnapshot.id}:`, {
        hasLastMatchId: data.lastMatchId === matchId,
        matches: data.matches ? JSON.stringify(data.matches) : "none",
        processedMatches: data.processedMatches ? JSON.stringify(data.processedMatches) : "none"
      });
      
      // Check multiple possible locations where match data could be stored
      // Use string comparison to avoid type issues
      const hasMatch = 
        (String(data.lastMatchId) === String(matchId)) || 
        (data.matches && Object.values(data.matches).some(id => String(id) === String(matchId))) ||
        (data.processedMatches && data.processedMatches.some(id => String(id) === String(matchId)));
      
      if (hasMatch) {
        console.log(`Resetting match ${matchId} for document ${docSnapshot.id}`);
        
        // Build update object
        const updateObj = {
          points: 0,
          pointsBreakdown: [],
        };
        
        // Only remove fields that exist
        if (data.lastMatchId) updateObj.lastMatchId = deleteField();
        if (data.matches) updateObj.matches = {};
        if (data.processedMatches) updateObj.processedMatches = [];
        
        updatePromises.push(updateDoc(docSnapshot.ref, updateObj));
      }
    });
    
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`Reset ${updatePromises.length} documents`);
    } else {
      console.log("No documents needed resetting");
    }
    
    // 4. Reset the processing state to allow recalculation
    await setDoc(processStateRef, {
      completed: false,
      currentInnings: 0,
      currentBatsmenIndex: 0,
      currentBowlersIndex: 0,
      resetInProgress: false,
      resetCompleted: true
    }, { merge: false });  // Complete overwrite
    
    // 5. Trigger recalculation via API
    console.log("Triggering recalculation in the background...");
    // Don't wait for completion - let it run in the background
    fetch(`/api/cron/update-matches?matchId=${matchId}`).catch(err => 
      console.error("Error triggering recalculation:", err)
    );
    
    return {
      success: true,
      message: `Reset ${updatePromises.length} documents for match ${matchId}. Recalculation has been triggered and will continue in the background.`
    };
  } catch (error) {
    // Clear the reset flag if anything fails
    try {
      await updateDoc(doc(db, 'processingState', matchId), {
        resetInProgress: false
      });
    } catch (flagError) {
      console.error("Error clearing reset flag:", flagError);
    }
    
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
