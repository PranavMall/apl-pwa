"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import styles from '../../tournaments/admin.module.css';

export default function PlayerStatsSyncPage() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [sheetId, setSheetId] = useState('1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM');
  const [results, setResults] = useState([]);
  
  const handleSync = async (e) => {
    e.preventDefault();
    
    if (!sheetId) {
      setMessage({ text: 'Please enter a Google Sheet ID', type: 'error' });
      return;
    }
    
    try {
      setLoading(true);
      setMessage({ text: 'Syncing player stats from Google Sheets...', type: 'info' });
      
      // Call API endpoint to trigger sync
      const response = await fetch(`/api/sync/player-stats?sheetId=${encodeURIComponent(sheetId)}`);
      const data = await response.json();
      
      if (data.success) {
        setMessage({ 
          text: `Sync completed successfully! Processed ${data.processedRows} rows and updated ${data.results?.length || 0} weeks.`, 
          type: 'success' 
        });
        setResults(data.results || []);
      } else {
        setMessage({ 
          text: `Error: ${data.error || 'Unknown error'}`, 
          type: 'error' 
        });
      }
    } catch (error) {
      console.error('Error syncing player stats:', error);
      setMessage({ 
        text: `Error: ${error.message || 'Unknown error'}`, 
        type: 'error' 
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Player Stats Sync</h1>
      
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <Card className={styles.section}>
        <CardHeader>
          <CardTitle>Sync Player Stats to User Teams</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={styles.sectionDescription}>
            This tool syncs player performance data from your Google Sheet directly to user team stats.
            It will update the userWeeklyStats collection with points for each user's team based on 
            player performance data in the sheet.
          </p>
          
          <form onSubmit={handleSync} className={styles.formContainer}>
            <div className={styles.formGroup}>
              <label htmlFor="sheetId">Google Sheet ID</label>
              <input
                type="text"
                id="sheetId"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="Enter Google Sheet ID"
                className={styles.input}
                required
              />
              <p className={styles.fieldHint}>
                Your Google Sheet should have the Player_Performance tab with all player stats.
              </p>
            </div>
            
            <button
              type="submit"
              className={styles.button}
              disabled={loading}
            >
              {loading ? 'Syncing...' : 'Start Sync'}
            </button>
          </form>
          
          {results.length > 0 && (
            <div className={styles.resultsSection}>
              <h3>Sync Results</h3>
              <div className={styles.resultsTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Status</th>
                      <th>Players Processed</th>
                      <th>Teams Processed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={index} className={result.status === 'success' ? styles.successRow : styles.errorRow}>
                        <td>{result.week}</td>
                        <td>{result.status}</td>
                        <td>{result.playersProcessed || '-'}</td>
                        <td>{result.teamsProcessed || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className={styles.section}>
        <CardHeader>
          <CardTitle>Google Sheet Format</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Your Google Sheet should have a sheet named "Player_Performance" with the following headers:</p>
          
          <ul className={styles.headersList}>
            <li>Week</li>
            <li>Match</li>
            <li>Players</li>
            <li>Team</li>
            <li>Starting XI</li>
            <li>Runs</li>
            <li>4 Runs</li>
            <li>6 Runs</li>
            <li>30 Runs</li>
            <li>Half Century</li>
            <li>Century</li>
            <li>Wicket</li>
            <li>Duck Out</li>
            <li>3-Wicket</li>
            <li>4-Wicket</li>
            <li>5-Wicket</li>
            <li>Maiden Over</li>
            <li>Catch</li>
            <li>Stumping</li>
            <li>Direct Throw</li>
            <li>Run out</li>
            <li>Total Points</li>
            <li>Player Position</li>
          </ul>
          
          <p className={styles.important}>
            <strong>Important:</strong> The "Total Points" column should contain the already calculated points for each player.
            This sync will use those values directly and apply captain/vice-captain multipliers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
