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
import { migrateTransferHistory } from '../migrateTransferHistory';

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
