"use client";

import React, { useState } from 'react';
import { useAuth } from '@/app/context/authContext';
import { createTournament, fixTransferWindow } from '@/app/services/tournamentSetup';
import withAuth from '@/app/components/withAuth';

const AdminSetupPage = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCreateTournament = async () => {
    try {
      setLoading(true);
      setMessage({ type: 'info', text: 'Setting up tournament...' });
      
      const result = await createTournament();
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Tournament created successfully with active transfer window!' });
      } else {
        setMessage({ type: 'error', text: `Failed to create tournament: ${result.error}` });
      }
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
      
      const result = await fixTransferWindow();
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Transfer window fixed successfully! Please refresh your profile page.' });
      } else {
        setMessage({ type: 'error', text: `Failed to fix transfer window: ${result.error}` });
      }
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
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Admin Setup</h1>
      
      <div style={styles.card}>
        <div style={styles.section}>
          <h2>Tournament & Transfer Window Management</h2>
          <p>Use these tools to set up the tournament and fix any issues with transfer windows.</p>
          
          <div style={{ marginTop: '20px' }}>
            <button
              style={{
                ...styles.button,
                ...(loading ? styles.disabledButton : {})
              }}
              onClick={handleCreateTournament}
              disabled={loading}
            >
              Create Tournament
            </button>
            
            <button
              style={{
                ...styles.button,
                ...(loading ? styles.disabledButton : {})
              }}
              onClick={handleFixTransferWindow}
              disabled={loading}
            >
              Fix Transfer Window
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
            <li>Click "Create Tournament" to create a new active tournament with an active transfer window.</li>
            <li>Click "Fix Transfer Window" if your transfer window is not showing as active.</li>
            <li>After running either operation, return to your profile page and refresh to see the changes.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default withAuth(AdminSetupPage);
