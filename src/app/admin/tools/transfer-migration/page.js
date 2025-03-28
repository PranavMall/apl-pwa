"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/authContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import styles from '../../tournaments/admin.module.css';
import { db } from '../../../../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  limit 
} from 'firebase/firestore';
import { migrateTransferHistory } from '../../scripts/migrateTransferHistory';

// Helper function to get the active tournament
async function getActiveTournament() {
  try {
    const tournamentsRef = collection(db, 'tournaments');
    
    // Query for tournaments with status 'active'
    const q = query(tournamentsRef, where('status', '==', 'active'), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log("No tournament with 'active' status found");
      // Fallback to getting the most recent tournament
      const allQuery = query(tournamentsRef, orderBy('createdAt', 'desc'), limit(1));
      const allSnapshot = await getDocs(allQuery);
      
      if (allSnapshot.empty) {
        console.log("No tournaments found at all");
        return null;
      }
      
      const tournamentData = allSnapshot.docs[0].data();
      const tournamentId = allSnapshot.docs[0].id;
      console.log(`Found most recent tournament: ${tournamentId}`);
      
      return {
        id: tournamentId,
        ...tournamentData
      };
    }
    
    const tournamentData = snapshot.docs[0].data();
    const tournamentId = snapshot.docs[0].id;
    console.log(`Found active tournament: ${tournamentId}`);
    
    return {
      id: tournamentId,
      ...tournamentData
    };
  } catch (error) {
    console.error('Error getting active tournament:', error);
    throw error;
  }
}

export default function TransferHistoryMigrationPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [weekNumber, setWeekNumber] = useState(1);
  const [transferHistory, setTransferHistory] = useState([]);
  const [weeklyStats, setWeeklyStats] = useState([]);

  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  // Check if current user has admin access
  const checkAdminAccess = async () => {
    if (!user) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists() && userDoc.data().isAdmin) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
    }
  };

  // Run the migration
  const handleMigration = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'Starting migration...' });
      
      const result = await migrateTransferHistory();
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `Migration successful! Created ${result.stats.historyRecordsCreated} transfer history records for ${result.stats.teamsProcessed} teams.` 
        });
        setMigrationResult(result);
      } else {
        setMessage({ 
          type: 'error', 
          text: `Migration failed: ${result.error}` 
        });
      }
    } catch (error) {
      console.error('Error running migration:', error);
      setMessage({ 
        type: 'error', 
        text: `Error: ${error.message}` 
      });
    } finally {
      setLoading(false);
    }
  };

  // Verify transfer history for a specific user
  const verifyUserTransferHistory = async (e) => {
    e.preventDefault();
    
    if (!selectedUserId) {
      setMessage({ type: 'error', text: 'Please enter a user ID' });
      return;
    }
    
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'Verifying transfer history...' });
      
      // Get active tournament
      const tournament = await getActiveTournament();
      if (!tournament) {
        setMessage({ type: 'error', text: 'No active tournament found' });
        setLoading(false);
        return;
      }
      
      // Get user transfer history
      const historyRef = collection(db, 'userTransferHistory');
      const historyQuery = query(
        historyRef,
        where('userId', '==', selectedUserId),
        where('tournamentId', '==', tournament.id),
        orderBy('weekNumber', 'asc')
      );
      
      const historySnapshot = await getDocs(historyQuery);
      
      const transferHistoryRecords = [];
      historySnapshot.forEach(doc => {
        transferHistoryRecords.push({
          id: doc.id,
          ...doc.data(),
          transferDateFormatted: doc.data().transferDate?.toDate?.().toLocaleString() || 'Unknown'
        });
      });
      
      setTransferHistory(transferHistoryRecords);
      
      // Get user weekly stats
      const statsRef = collection(db, 'userWeeklyStats');
      const statsQuery = query(
        statsRef,
        where('userId', '==', selectedUserId),
        where('tournamentId', '==', tournament.id),
        orderBy('weekNumber', 'asc')
      );
      
      const statsSnapshot = await getDocs(statsQuery);
      
      const weeklyStatsRecords = [];
      statsSnapshot.forEach(doc => {
        weeklyStatsRecords.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      setWeeklyStats(weeklyStatsRecords);
      
      setVerificationResult({
        userId: selectedUserId,
        tournamentId: tournament.id,
        transferHistoryCount: transferHistoryRecords.length,
        weeklyStatsCount: weeklyStatsRecords.length
      });
      
      setMessage({ 
        type: 'success', 
        text: `Found ${transferHistoryRecords.length} transfer history records and ${weeklyStatsRecords.length} weekly stats records.` 
      });
    } catch (error) {
      console.error('Error verifying transfer history:', error);
      setMessage({ 
        type: 'error', 
        text: `Error: ${error.message}` 
      });
    } finally {
      setLoading(false);
    }
  };

  // Run a test recalculation for a specific user and week
  const testRecalculation = async () => {
    if (!selectedUserId || !weekNumber) {
      setMessage({ type: 'error', text: 'Please enter a user ID and week number' });
      return;
    }
    
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'Testing recalculation...' });
      
      // Get active tournament
      const tournament = await getActiveTournament();
      if (!tournament) {
        setMessage({ type: 'error', text: 'No active tournament found' });
        setLoading(false);
        return;
      }
      
      // Get user's team for this week from transfer history
      const transferHistoryRef = doc(db, 'userTransferHistory', `${selectedUserId}_${tournament.id}_${weekNumber}`);
      const transferHistoryDoc = await getDoc(transferHistoryRef);
      
      if (!transferHistoryDoc.exists()) {
        setMessage({ type: 'error', text: `No transfer history found for user ${selectedUserId}, week ${weekNumber}` });
        setLoading(false);
        return;
      }
      
      const teamPlayers = transferHistoryDoc.data().players;
      
      // Get matches for this week
      const matchWeeksRef = collection(db, 'matchWeeks');
      const q = query(matchWeeksRef, where('weekNumber', '==', parseInt(weekNumber)), where('tournamentId', '==', tournament.id));
      const snapshot = await getDocs(q);
      
      const matches = [];
      snapshot.forEach(doc => {
        matches.push(doc.data().matchId);
      });
      
      if (matches.length === 0) {
        setMessage({ type: 'error', text: `No matches found for week ${weekNumber}` });
        setLoading(false);
        return;
      }
      
      // Get weekly stats for this user and week
      const weeklyStatsRef = doc(db, 'userWeeklyStats', `${selectedUserId}_${tournament.id}_${weekNumber}`);
      const weeklyStatsDoc = await getDoc(weeklyStatsRef);
      
      const beforePoints = weeklyStatsDoc.exists() ? weeklyStatsDoc.data().points : 0;
      
      setMessage({ 
        type: 'info', 
        text: `User ${selectedUserId} has ${teamPlayers.length} players for week ${weekNumber}. Found ${matches.length} matches. Current points: ${beforePoints}. Testing recalculation...` 
      });
      
      // This is just a test - we're not actually updating anything
      setMessage({ 
        type: 'success', 
        text: `Test successful! User ${selectedUserId} has ${teamPlayers.length} players for week ${weekNumber}. Found ${matches.length} matches. Current points: ${beforePoints}.` 
      });
    } catch (error) {
      console.error('Error testing recalculation:', error);
      setMessage({ 
        type: 'error', 
        text: `Error: ${error.message}` 
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMessage}>
          <h2>Access Denied</h2>
          <p>You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Transfer History Migration</h1>
      
      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <div className={styles.grid}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Run Migration</h2>
          <p className={styles.sectionDescription}>
            This will create transfer history records for all users based on their current teams and weekly stats.
            Run this tool before updating the main application code.
          </p>
          
          <div className={styles.warningBox}>
            <h3>⚠️ Warning</h3>
            <p>
              This migration will create historical records for all user teams.
              Make sure to back up your database before proceeding.
            </p>
          </div>
          
          <button 
            className={styles.button}
            onClick={handleMigration}
            disabled={loading}
          >
            {loading ? 'Running Migration...' : 'Start Migration'}
          </button>
          
          {migrationResult && (
            <div className={styles.resultBox}>
              <h3>Migration Results</h3>
              <pre>{JSON.stringify(migrationResult, null, 2)}</pre>
            </div>
          )}
        </div>
        
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Verify Migration</h2>
          
          <form onSubmit={verifyUserTransferHistory} className={styles.formContainer}>
            <div className={styles.formGroup}>
              <label htmlFor="userId">User ID</label>
              <input
                type="text"
                id="userId"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                placeholder="Enter user ID to verify"
                required
              />
            </div>
            
            <button 
              type="submit" 
              className={styles.button}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Verify User'}
            </button>
          </form>
          
          {verificationResult && (
            <div className={styles.resultBox}>
              <h3>Verification Results</h3>
              <p>User ID: {verificationResult.userId}</p>
              <p>Tournament ID: {verificationResult.tournamentId}</p>
              <p>Transfer History Records: {verificationResult.transferHistoryCount}</p>
              <p>Weekly Stats Records: {verificationResult.weeklyStatsCount}</p>
            </div>
          )}
          
          {transferHistory.length > 0 && (
            <div className={styles.dataSection}>
              <h3>Transfer History</h3>
              <div className={styles.tableWrapper}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Transfer Date</th>
                      <th>Players</th>
                      <th>Created By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transferHistory.map((record) => (
                      <tr key={record.id}>
                        <td>{record.weekNumber}</td>
                        <td>{record.transferDateFormatted}</td>
                        <td>{record.players?.length || 0} players</td>
                        <td>{record.migrated ? 'Migration' : 'User'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {weeklyStats.length > 0 && (
            <div className={styles.dataSection}>
              <h3>Weekly Stats</h3>
              <div className={styles.tableWrapper}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Points</th>
                      <th>Rank</th>
                      <th>Matches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyStats.map((record) => (
                      <tr key={record.id}>
                        <td>{record.weekNumber}</td>
                        <td>{record.points}</td>
                        <td>{record.rank}</td>
                        <td>{record.processedMatches?.length || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Test Recalculation</h2>
        
        <div className={styles.formContainer}>
          <div className={styles.formGroup}>
            <label htmlFor="testUserId">User ID</label>
            <input
              type="text"
              id="testUserId"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              placeholder="Enter user ID"
              required
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="weekNumber">Week Number</label>
            <input
              type="number"
              id="weekNumber"
              value={weekNumber}
              onChange={(e) => setWeekNumber(e.target.value)}
              min="1"
              step="1"
              required
            />
          </div>
          
          <button 
            type="button" 
            className={styles.button}
            onClick={testRecalculation}
            disabled={loading}
          >
            {loading ? 'Testing...' : 'Test Recalculation'}
          </button>
        </div>
      </div>
    </div>
  );
}
