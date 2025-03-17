"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/authContext';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../firebase';
import withAuth from '@/app/components/withAuth';
import Link from 'next/link';

const AdminSetupPage = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeWindow, setActiveWindow] = useState(null);

  useEffect(() => {
    checkAdminAccess();
    checkActiveWindow();
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

  // Check for active transfer window
  const checkActiveWindow = async () => {
    try {
      const tournamentsRef = collection(db, 'tournaments');
      const q = query(tournamentsRef, where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const tournament = snapshot.docs[0].data();
        const windows = tournament.transferWindows || [];
        
        // Find active window
        const now = new Date();
        const active = windows.find(window => {
          // Check if window is explicitly marked as active
          if (window.status === 'active') return true;
          
          // Or check date range
          let startDate, endDate;
          
          if (window.startDate && typeof window.startDate === 'object' && window.startDate.toDate) {
            startDate = window.startDate.toDate();
          } else if (window.startDate && window.startDate.seconds) {
            startDate = new Date(window.startDate.seconds * 1000);
          } else {
            startDate = new Date(window.startDate);
          }
          
          if (window.endDate && typeof window.endDate === 'object' && window.endDate.toDate) {
            endDate = window.endDate.toDate();
          } else if (window.endDate && window.endDate.seconds) {
            endDate = new Date(window.endDate.seconds * 1000);
          } else {
            endDate = new Date(window.endDate);
          }
          
          return now >= startDate && now <= endDate;
        });
        
        setActiveWindow(active);
      }
    } catch (error) {
      console.error('Error checking active window:', error);
    }
  };

  const handleCreateTournament = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'Setting up tournament...' });
      
      // Create a simple tournament for migration
      // In production, users should use the new Tournament Manager page
      const tournamentRef = doc(db, 'tournaments', 'ipl-2025');
      
      // Calculate dates using GST (UTC+4)
      const now = new Date();
      const tournamentStart = new Date("2025-03-22");
      const tournamentEnd = new Date("2025-05-25");
      
      // Create active transfer window for now
      const currentDate = new Date(now);
      const endDate = new Date(now);
      endDate.setDate(now.getDate() + 3); // 3 days from now
      
      const transferWindows = [
        {
          startDate: currentDate,
          endDate: endDate,
          weekNumber: 1,
          status: "active"
        }
      ];
      
      // Add future windows
      for (let i = 1; i <= 8; i++) {
        const futureStartDate = new Date(now);
        futureStartDate.setDate(now.getDate() + (i * 7)); // Weekly windows
        
        const futureEndDate = new Date(futureStartDate);
        futureEndDate.setDate(futureStartDate.getDate() + 2); // Each window lasts 3 days
        
        transferWindows.push({
          startDate: futureStartDate,
          endDate: futureEndDate,
          weekNumber: i + 1,
          status: "upcoming"
        });
      }
      
      // Initialize tournament document
      const tournamentData = {
        name: "IPL 2025",
        startDate: tournamentStart,
        endDate: tournamentEnd,
        registrationDeadline: now, // Registration from now
        status: "active",
        transferWindows: transferWindows,
        createdAt: now
      };

      await setDoc(tournamentRef, tournamentData);
      
      setMessage({ type: 'success', text: 'Tournament created successfully with active transfer window!' });
      setActiveWindow(transferWindows[0]);
    } catch (error) {
      console.error('Error creating tournament:', error);
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleFixTransferWindow = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'Fixing transfer window...' });
      
      // Get the active tournament
      const tournamentsRef = collection(db, 'tournaments');
      const q = query(tournamentsRef, where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setMessage({ type: 'error', text: 'No active tournament found. Please create one first.' });
        setLoading(false);
        return;
      }
      
      const tournamentDoc = snapshot.docs[0];
      const tournamentId = tournamentDoc.id;
      const tournament = tournamentDoc.data();
      
      // Get all transfer windows
      const windows = tournament.transferWindows || [];
      
      if (windows.length === 0) {
        setMessage({ type: 'error', text: 'No transfer windows found. Please create a tournament first.' });
        setLoading(false);
        return;
      }
      
      // Mark the first window as active
      windows[0].status = 'active';
      
      // Update the tournament
      await setDoc(doc(db, 'tournaments', tournamentId), {
        ...tournament,
        transferWindows: windows
      }, { merge: true });
      
      setMessage({ type: 'success', text: 'Transfer window fixed successfully! Please refresh your profile page.' });
      setActiveWindow(windows[0]);
    } catch (error) {
      console.error('Error fixing transfer window:', error);
      setMessage({ type: 'error', text: `Error: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // Simple styles defined inline for this admin page
  const styles = {
    container: {
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Arial, sans-serif',
    },
    title: {
      fontSize: '24px',
      marginBottom: '20px',
    },
    card: {
      background: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
      padding: '20px',
      marginBottom: '20px',
    },
    section: {
      marginBottom: '30px',
    },
    button: {
      background: '#4caf50',
      color: 'white',
      border: 'none',
      padding: '10px 15px',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '16px',
      marginRight: '10px',
    },
    disabledButton: {
      background: '#cccccc',
      cursor: 'not-allowed',
    },
    message: {
      padding: '10px 15px',
      borderRadius: '4px',
      marginTop: '15px',
    },
    info: {
      background: '#e3f2fd',
      color: '#0d47a1',
    },
    success: {
      background: '#e8f5e9',
      color: '#2e7d32',
    },
    error: {
      background: '#ffebee',
      color: '#c62828',
    },
    link: {
      display: 'inline-block',
      background: '#2196f3',
      color: 'white',
      textDecoration: 'none',
      padding: '10px 15px',
      borderRadius: '4px',
      marginTop: '20px',
      marginBottom: '20px',
      fontWeight: 'bold',
    }
  };

  if (!isAdmin) {
    return (
      <div style={styles.container}>
        <div style={{...styles.message, ...styles.error}}>
          <h2>Access Denied</h2>
          <p>You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Admin Setup</h1>
      
      <div style={styles.card}>
        <div style={styles.section}>
          <h2>Tournament & Transfer Window Management</h2>
          
          <p><strong>Status:</strong> {activeWindow 
            ? <span style={{color: '#4caf50'}}>Transfer window is active! (Week {activeWindow.weekNumber})</span> 
            : <span style={{color: '#f44336'}}>No active transfer window</span>}
          </p>
          
          <p style={{marginTop: '20px', marginBottom: '20px'}}>
            <Link href="/admin/tournaments" style={styles.link}>
              Go to Tournament Manager (New)
            </Link>
          </p>
          
          <p>Now you can use our new Tournament Manager to create and manage tournaments and transfer windows 
          with more flexibility. We recommend using the new manager for all tournament administration tasks.</p>
          
          <div style={{ marginTop: '20px' }}>
            <button
              style={{
                ...styles.button,
                ...(loading ? styles.disabledButton : {})
              }}
              onClick={handleCreateTournament}
              disabled={loading}
            >
              Create Tournament (Legacy)
            </button>
            
            <button
              style={{
                ...styles.button,
                ...(loading ? styles.disabledButton : {})
              }}
              onClick={handleFixTransferWindow}
              disabled={loading}
            >
              Fix Transfer Window (Legacy)
            </button>
          </div>
          
          {message && (
            <div style={{
              ...styles.message,
              ...(styles[message.type] || {})
            }}>
              {message.text}
            </div>
          )}
        </div>
        
        <div style={styles.section}>
          <h3>Instructions</h3>
          <ol>
            <li>Use the <strong>Tournament Manager</strong> (recommended) to create and manage tournaments.</li>
            <li>The legacy buttons remain for backward compatibility.</li>
            <li>After making changes, return to your profile page and refresh to see the updates.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default withAuth(AdminSetupPage);
