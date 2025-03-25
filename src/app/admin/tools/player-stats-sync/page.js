// Updated src/app/admin/tools/player-stats-sync/page.js
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import styles from '../../tournaments/admin.module.css';

export default function PlayerStatsSyncPage() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [sheetId, setSheetId] = useState('1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM');
  const [results, setResults] = useState([]);
  const [syncProgress, setSyncProgress] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [batchSize, setBatchSize] = useState(25);
  const [unmatchedPlayers, setUnmatchedPlayers] = useState([]);
  
  // Cancel sync flag
  const [shouldCancelSync, setShouldCancelSync] = useState(false);
  
  const handleSync = async (e) => {
    e.preventDefault();
    
    if (!sheetId) {
      setMessage({ text: 'Please enter a Google Sheet ID', type: 'error' });
      return;
    }
    
    try {
      // Reset state for new sync
      setLoading(true);
      setMessage({ text: 'Starting sync process from Google Sheets...', type: 'info' });
      setResults([]);
      setSyncProgress({ 
        processed: 0,
        total: 0,
        currentBatch: 1,
        totalBatches: '?' 
      });
      setUnmatchedPlayers([]);
      setShouldCancelSync(false);
      
      // Start first batch
      await runSyncBatch(0);
    } catch (error) {
      console.error('Error in sync process:', error);
      setMessage({ 
        text: `Error: ${error.message || 'Unknown error'}`, 
        type: 'error' 
      });
      setLoading(false);
    }
  };
  
  const runSyncBatch = async (startIndex) => {
    if (shouldCancelSync) {
      setMessage({ text: 'Sync cancelled by user', type: 'info' });
      setLoading(false);
      return;
    }
    
    try {
      // Build URL with parameters
      const weekParam = selectedWeek ? `&week=${selectedWeek}` : '';
      const url = `/api/sync/player-stats?sheetId=${encodeURIComponent(sheetId)}${weekParam}&startIndex=${startIndex}&batchSize=${batchSize}`;
      
      // Call API endpoint for this batch
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Update progress
        setSyncProgress({
          processed: data.processedUsers,
          total: data.totalUsers,
          currentBatch: Math.floor(startIndex / batchSize) + 1,
          totalBatches: Math.ceil(data.totalUsers / batchSize)
        });
        
        // Combine results
        setResults(prev => [...prev, ...(data.results || [])]);
        
        // Track unmatched players
        if (data.unmatchedPlayers) {
          setUnmatchedPlayers(prev => [...prev, ...(data.unmatchedPlayers || [])]);
        }
        
        // If more batches to process, continue
        if (data.hasMoreUsers && data.nextStartIndex !== null) {
          setMessage({ 
            text: `Processing batch ${Math.floor(startIndex / batchSize) + 1} of ${Math.ceil(data.totalUsers / batchSize)}...`, 
            type: 'info' 
          });
          
          // Process next batch with a small delay to prevent overloading
          setTimeout(() => {
            runSyncBatch(data.nextStartIndex);
          }, 1000);
        } else {
          // All done
          setMessage({ 
            text: `Sync completed successfully! Processed ${data.totalUsers} users across ${data.results?.length || 0} weeks.`, 
            type: 'success' 
          });
          setLoading(false);
        }
      } else {
        setMessage({ 
          text: `Error: ${data.error || 'Unknown error'}`, 
          type: 'error' 
        });
        setLoading(false);
      }
    } catch (error) {
      console.error('Error syncing batch:', error);
      setMessage({ 
        text: `Error in batch: ${error.message || 'Unknown error'}. Check console for details.`, 
        type: 'error' 
      });
      setLoading(false);
    }
  };
  
  const handleCancelSync = () => {
    setShouldCancelSync(true);
    setMessage({ text: 'Cancelling sync after current batch completes...', type: 'info' });
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
                disabled={loading}
              />
              <p className={styles.fieldHint}>
                Your Google Sheet should have the Player_Performance tab with all player stats.
              </p>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="weekNumber">Week Number (Optional)</label>
              <input
                type="number"
                id="weekNumber"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                placeholder="Leave empty for all weeks"
                className={styles.input}
                disabled={loading}
                min="1"
              />
              <p className={styles.fieldHint}>
                If specified, only this week's data will be processed. Leave empty to process all weeks.
              </p>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="batchSize">Batch Size</label>
              <input
                type="number"
                id="batchSize"
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value))}
                className={styles.input}
                required
                disabled={loading}
                min="5"
                max="100"
              />
              <p className={styles.fieldHint}>
                Number of users to process per batch. Lower values (20-30) work best for Vercel's timeout limits.
              </p>
            </div>
            
            {loading ? (
              <div className={styles.syncControls}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancelSync}
                >
                  Cancel Sync
                </button>
                
                {syncProgress && (
                  <div className={styles.progressInfo}>
                    <div className={styles.progressBar}>
                      <div 
                        className={styles.progressFill} 
                        style={{ width: `${(syncProgress.processed / syncProgress.total) * 100}%` }}
                      ></div>
                    </div>
                    <div className={styles.progressText}>
                      Processing {syncProgress.processed} of {syncProgress.total} users 
                      (Batch {syncProgress.currentBatch} of {syncProgress.totalBatches})
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="submit"
                className={styles.button}
                disabled={loading}
              >
                Start Sync
              </button>
            )}
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
                      <th>Unmatched Players</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((result, index) => (
                      <tr key={index} className={result.status === 'success' ? styles.successRow : styles.errorRow}>
                        <td>{result.week}</td>
                        <td>{result.status}</td>
                        <td>{result.playersProcessed || '-'}</td>
                        <td>{result.teamsProcessed || '-'}</td>
                        <td>{result.unmatchedPlayerCount || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {unmatchedPlayers.length > 0 && (
            <div className={styles.unmatchedSection}>
              <h3>Unmatched Players</h3>
              <p className={styles.warning}>
                These players couldn't be matched between user teams and sheet data. Review names in both sources for inconsistencies.
              </p>
              <div className={styles.unmatchedTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Player Name</th>
                      <th>Normalized Name</th>
                      <th>User Count</th>
                      <th>Sample Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unmatchedPlayers.slice(0, 20).map((player, index) => (
                      <tr key={index}>
                        <td>{player.playerName}</td>
                        <td><code>{player.normalizedName}</code></td>
                        <td>{player.count}</td>
                        <td>{player.users.slice(0, 3).join(', ')}{player.users.length > 3 ? '...' : ''}</td>
                      </tr>
                    ))}
                    {unmatchedPlayers.length > 20 && (
                      <tr>
                        <td colSpan="4" className={styles.moreInfo}>
                          ...and {unmatchedPlayers.length - 20} more unmatched players
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
