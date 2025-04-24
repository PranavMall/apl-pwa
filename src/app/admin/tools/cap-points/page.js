"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import styles from '../../tournaments/admin.module.css';
import { collection, query, getDocs, doc, getDoc, where, orderBy } from 'firebase/firestore';
import { db } from '../../../../firebase';

export default function CapPointsProcessingPage() {
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [sheetId, setSheetId] = useState('1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM');
  const [weekNumber, setWeekNumber] = useState('');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [results, setResults] = useState(null);
  const [capHolders, setCapHolders] = useState(null);
  const [processedWeeks, setProcessedWeeks] = useState([]);
  
  // Load available weeks on component mount
  useEffect(() => {
    fetchAvailableWeeks();
    fetchProcessedCapWeeks();
  }, []);
  
  const fetchAvailableWeeks = async () => {
    try {
      setLoading(true);
      
      // Get active tournament
      const tournamentsRef = collection(db, 'tournaments');
      const q = query(tournamentsRef, where('status', '==', 'active'));
      const tournamentSnapshot = await getDocs(q);
      
      if (tournamentSnapshot.empty) {
        setMessage({ text: 'No active tournament found', type: 'error' });
        setLoading(false);
        return;
      }
      
      const tournament = {
        id: tournamentSnapshot.docs[0].id,
        ...tournamentSnapshot.docs[0].data()
      };
      
      // Get transfer windows as available weeks
      const transferWindows = tournament.transferWindows || [];
      
      // Sort by week number
      transferWindows.sort((a, b) => a.weekNumber - b.weekNumber);
      
      setAvailableWeeks(transferWindows);
      
      // Set default week number to the latest completed week
      const completedWindows = transferWindows.filter(window => window.status === 'completed');
      if (completedWindows.length > 0) {
        const latestWindow = completedWindows.reduce((latest, window) => {
          return window.weekNumber > latest.weekNumber ? window : latest;
        }, completedWindows[0]);
        
        setWeekNumber(latestWindow.weekNumber.toString());
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching available weeks:', error);
      setMessage({ text: 'Error fetching available weeks', type: 'error' });
      setLoading(false);
    }
  };
  
  const fetchProcessedCapWeeks = async () => {
    try {
      const capHoldersRef = collection(db, 'capHolders');
      const snapshot = await getDocs(capHoldersRef);
      
      const processed = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        processed.push({
          id: doc.id,
          weekNumber: data.weekNumber,
          processedAt: data.processedAt,
          orangeCaps: data.orangeCaps || [],
          purpleCaps: data.purpleCaps || []
        });
      });
      
      // Sort by week number
      processed.sort((a, b) => a.weekNumber - b.weekNumber);
      setProcessedWeeks(processed);
    } catch (error) {
      console.error('Error fetching processed cap weeks:', error);
    }
  };
  
  const processCapPoints = async () => {
    if (!weekNumber) {
      setMessage({ text: 'Please select a week number', type: 'error' });
      return;
    }
    
    try {
      setProcessing(true);
      setMessage({ text: 'Processing cap points...', type: 'info' });
      
      // Call API endpoint to process cap points
      const response = await fetch(`/api/cap-points?sheetId=${encodeURIComponent(sheetId)}&week=${encodeURIComponent(weekNumber)}`);
      const data = await response.json();
      
      if (data.success) {
        setMessage({ 
          text: `Cap points processed successfully! ${data.results.usersProcessed} users received points.`, 
          type: 'success' 
        });
        setResults(data.results);
        setCapHolders({
          orangeCaps: data.orangeCaps,
          purpleCaps: data.purpleCaps
        });
        
        // Refresh processed weeks
        fetchProcessedCapWeeks();
      } else {
        setMessage({ 
          text: `Error: ${data.error || 'Unknown error'}`, 
          type: 'error' 
        });
      }
    } catch (error) {
      console.error('Error processing cap points:', error);
      setMessage({ 
        text: `Error: ${error.message || 'Unknown error'}`, 
        type: 'error' 
      });
    } finally {
      setProcessing(false);
    }
  };
  
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleString();
    } catch (error) {
      return 'Invalid date';
    }
  };
  
  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Cap Points Processing</h1>
      
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <Card className={styles.section}>
        <CardHeader>
          <CardTitle>Process Cap Points</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={styles.sectionDescription}>
            This tool processes Orange Cap and Purple Cap points from your Google Sheet and awards
            bonus points to users who have these players in their teams for the selected week.
          </p>
          
          <div className={styles.formContainer}>
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
                Your Google Sheet should have a Cap_Points tab with Week, Orange Cap, and Purple Cap columns.
              </p>
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="weekNumber">Week Number</label>
              <select
                id="weekNumber"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
                className={styles.input}
                required
              >
                <option value="">Select a week</option>
                {availableWeeks.map(window => (
                  <option key={window.weekNumber} value={window.weekNumber}>
                    Week {window.weekNumber} ({window.status})
                  </option>
                ))}
              </select>
              <p className={styles.fieldHint}>
                Select the week for which you want to process cap points.
              </p>
            </div>
            
            <button
              type="button"
              className={styles.button}
              onClick={processCapPoints}
              disabled={processing || loading}
            >
              {processing ? 'Processing...' : 'Process Cap Points'}
            </button>
          </div>
          
          {capHolders && (
            <div className={styles.resultsSection}>
              <h3>Cap Holders for Week {weekNumber}</h3>
              
              <div className={styles.capsContainer}>
                <div className={styles.capGroup}>
                  <h4>Orange Cap Holders</h4>
                  {capHolders.orangeCaps.length > 0 ? (
                    <ul className={styles.capsList}>
                      {capHolders.orangeCaps.map((player, index) => (
                        <li key={index} className={styles.capItem}>
                          <span className={styles.orangeCap}>{player}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No Orange Cap holders found</p>
                  )}
                </div>
                
                <div className={styles.capGroup}>
                  <h4>Purple Cap Holders</h4>
                  {capHolders.purpleCaps.length > 0 ? (
                    <ul className={styles.capsList}>
                      {capHolders.purpleCaps.map((player, index) => (
                        <li key={index} className={styles.capItem}>
                          <span className={styles.purpleCap}>{player}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No Purple Cap holders found</p>
                  )}
                </div>
              </div>
              
              {results && (
                <div className={styles.processingResults}>
                  <h4>Processing Results</h4>
                  <p>Users processed: {results.usersProcessed}</p>
                  <p>Total points awarded: {results.pointsAwarded}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card className={styles.section}>
        <CardHeader>
          <CardTitle>Previously Processed Weeks</CardTitle>
        </CardHeader>
        <CardContent>
          {processedWeeks.length > 0 ? (
            <div className={styles.tableWrapper}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Orange Cap Holders</th>
                    <th>Purple Cap Holders</th>
                    <th>Processed At</th>
                  </tr>
                </thead>
                <tbody>
                  {processedWeeks.map((week) => (
                    <tr key={week.id}>
                      <td>Week {week.weekNumber}</td>
                      <td>
                        {week.orangeCaps.length > 0 ? (
                          <ul className={styles.inlineList}>
                            {week.orangeCaps.map((player, index) => (
                              <li key={index}>
                                <span className={styles.orangeCap}>{player}</span>
                                {index < week.orangeCaps.length - 1 ? ', ' : ''}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          'None'
                        )}
                      </td>
                      <td>
                        {week.purpleCaps.length > 0 ? (
                          <ul className={styles.inlineList}>
                            {week.purpleCaps.map((player, index) => (
                              <li key={index}>
                                <span className={styles.purpleCap}>{player}</span>
                                {index < week.purpleCaps.length - 1 ? ', ' : ''}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          'None'
                        )}
                      </td>
                      <td>{formatDate(week.processedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noData}>No processed weeks found.</p>
          )}
        </CardContent>
      </Card>
      
      <Card className={styles.section}>
        <CardHeader>
          <CardTitle>Google Sheet Format</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Your Google Sheet should have a sheet named "Cap_Points" with the following headers:</p>
          
          <ul className={styles.headersList}>
            <li>Week</li>
            <li>Orange Cap</li>
            <li>Purple Cap</li>
          </ul>
          
          <p className={styles.important}>
            <strong>Important:</strong> The "Week" column should contain the week number, and the "Orange Cap" and
            "Purple Cap" columns should contain the names of the players who hold the respective caps.
            For ties, add multiple rows with the same week number.
          </p>
          
          <div className={styles.exampleTable}>
            <h4>Example:</h4>
            <table className={styles.sampleTable}>
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Orange Cap</th>
                  <th>Purple Cap</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>1</td>
                  <td>Virat Kohli</td>
                  <td>Jasprit Bumrah</td>
                </tr>
                <tr>
                  <td>1</td>
                  <td>Rohit Sharma</td>
                  <td></td>
                </tr>
                <tr>
                  <td>2</td>
                  <td>KL Rahul</td>
                  <td>Yuzvendra Chahal</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      <style jsx>{`
        .capsContainer {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-top: 20px;
          margin-bottom: 20px;
        }
        
        .capGroup {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 8px;
        }
        
        .capsList {
          list-style: none;
          padding: 0;
          margin: 10px 0 0 0;
        }
        
        .capItem {
          margin-bottom: 5px;
        }
        
        .orangeCap, .purpleCap {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 600;
        }
        
        .orangeCap {
          background-color: #ffecb3;
          color: #e65100;
        }
        
        .purpleCap {
          background-color: #e1bee7;
          color: #6a1b9a;
        }
        
        .inlineList {
          display: inline;
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .inlineList li {
          display: inline;
        }
        
        .processingResults {
          margin-top: 20px;
          background: #e8f5e9;
          padding: 15px;
          border-radius: 8px;
        }
        
        .processingResults h4 {
          margin-top: 0;
          margin-bottom: 10px;
        }
        
        .processingResults p {
          margin: 5px 0;
        }
        
        .sampleTable {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        
        .sampleTable th, .sampleTable td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
        }
        
        .sampleTable th {
          background-color: #f5f5f5;
        }
      `}</style>
    </div>
  );
}
