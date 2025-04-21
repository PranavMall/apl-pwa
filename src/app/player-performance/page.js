"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../firebase';
import styles from './page.module.css';

const PlayerPerformancePage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playerData, setPlayerData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [selectedPosition, setSelectedPosition] = useState('all');
  const [selectedWeek, setSelectedWeek] = useState('all');
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Add state for player master data
  const [playerMasterData, setPlayerMasterData] = useState({});

  useEffect(() => {
    // Fetch player master data first, then fetch performance data
    fetchPlayerMasterData()
      .then(() => {
        fetchPlayerPerformanceData();
      })
      .catch(err => {
        console.error('Error in initialization:', err);
        setError('Failed to initialize the page. Please try again later.');
        setLoading(false);
      });
  }, []);

  // Fetch player master data from Firebase
  const fetchPlayerMasterData = async () => {
    try {
      console.log('Fetching player master data from Firebase...');
      const playerMasterRef = collection(db, 'playersMaster');
      const snapshot = await getDocs(query(playerMasterRef));
      
      const masterData = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        // Create a lookup with player name as key
        if (data.name) {
          masterData[data.name.toLowerCase()] = {
            id: doc.id,
            role: data.role || 'unknown',
            team: data.team || 'unknown'
          };
        }
      });
      
      console.log(`Loaded ${Object.keys(masterData).length} players from master database`);
      setPlayerMasterData(masterData);
      return masterData;
    } catch (err) {
      console.error('Error fetching player master data:', err);
      throw err;
    }
  };

  useEffect(() => {
    // Apply filters when data, position, week, or search term changes
    let data = [...playerData];
    
    // Filter by position - case insensitive matching
    if (selectedPosition && selectedPosition !== 'all') {
      data = data.filter(player => 
        player.position?.toLowerCase() === selectedPosition.toLowerCase()
      );
    }
    
    // Filter by period (week or tournament)
    if (selectedWeek === 'all') {
      // For "Tournament (All Weeks)", only show tournament-level aggregated data
      data = data.filter(player => player.week === 'all');
    } else {
      // For specific week, only show data for that week
      data = data.filter(player => player.week === parseInt(selectedWeek));
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      data = data.filter(player => 
        player.name.toLowerCase().includes(term) ||
        player.team.toLowerCase().includes(term)
      );
    }
    
    // Sort by total points (descending)
    data.sort((a, b) => b.totalPoints - a.totalPoints);
    
    setFilteredData(data);
  }, [playerData, selectedPosition, selectedWeek, searchTerm]);

  const fetchPlayerPerformanceData = async () => {
    try {
      setLoading(true);
      
      // Fetch data from our API endpoint
      const response = await fetch('/api/player-performance?sheetId=1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM');
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data from Google Sheets');
      }
      
      // Process the raw data from Google Sheets
      const rawData = result.processedRows ? 
        result.processedRows.map(row => calculateMetrics(row, playerMasterData)) : [];
      
      console.log("Sample raw player data:", rawData.slice(0, 2));
      
      // Extract available weeks for filter
      const weeks = new Set();
      rawData.forEach(player => {
        if (player.week) weeks.add(player.week);
      });
      setAvailableWeeks(Array.from(weeks).sort((a, b) => a - b));
      
      // Aggregate players data to eliminate duplicates
      const aggregatedData = aggregatePlayerData(rawData);
      console.log("Sample aggregated player data:", aggregatedData.slice(0, 2));
      
      setPlayerData(aggregatedData);
      setFilteredData(aggregatedData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching player performance data:', err);
      setError('Failed to load player performance data. Please try again later.');
      setLoading(false);
    }
  };

  // Aggregate player data to eliminate duplicates and sum up metrics
  const aggregatePlayerData = (rawData) => {
    // First, group by player name and week
    const weeklyStats = {};
    const tournamentStats = {};

    // Process each player match performance
    rawData.forEach(player => {
      const playerKey = `${player.name.toLowerCase()}_${player.team.toLowerCase()}`;
      const weeklyKey = `${playerKey}_${player.week}`;
      
      // Update weekly stats
      if (!weeklyStats[weeklyKey]) {
        weeklyStats[weeklyKey] = {
          ...player,
          matchCount: 1
        };
      } else {
        // Sum all numeric values
        Object.keys(player).forEach(key => {
          if (typeof player[key] === 'number') {
            weeklyStats[weeklyKey][key] += player[key];
          }
        });
        weeklyStats[weeklyKey].matchCount += 1;
      }
      
      // Update tournament stats (across all weeks)
      if (!tournamentStats[playerKey]) {
        tournamentStats[playerKey] = {
          ...player,
          week: 'all',  // Mark as an all-weeks entry
          matchCount: 1
        };
      } else {
        // Sum all numeric values
        Object.keys(player).forEach(key => {
          if (typeof player[key] === 'number' && key !== 'week') {
            tournamentStats[playerKey][key] += player[key];
          }
        });
        tournamentStats[playerKey].matchCount += 1;
      }
    });

    // Combine weekly and tournament stats into a single array
    const combinedStats = [
      ...Object.values(weeklyStats),
      ...Object.values(tournamentStats)
    ];
    
    // Sort by total points (descending)
    return combinedStats.sort((a, b) => b.totalPoints - a.totalPoints);
  };

  // Helper function to calculate metrics from points
  const calculateMetrics = (player, masterData) => {
    // Try to get position from master database first
    let position = 'unknown';
    const playerName = player.Players?.toLowerCase() || '';
    
    // Look up player by name in master data
    if (playerName && masterData[playerName]) {
      position = masterData[playerName].role;
      console.log(`Found position in master DB for ${player.Players}: ${position}`);
    } 
    // Fallback to position column in Google Sheets if available
    else if (player["Player Position"]) {
      position = player["Player Position"].toLowerCase();
      console.log(`Using sheet position for ${player.Players}: ${position}`);
    }
    // If still unknown, try to infer it from stats
    else {
      // Inference logic as fallback
      if (parseInt(player["Stumping"] || 0) > 0) {
        position = 'wicketkeeper';
      }
      else if (parseInt(player["Wicket"] || 0) > 0 || 
               parseInt(player["3-Wicket"] || 0) > 0 || 
               parseInt(player["Maiden Over"] || 0) > 0) {
        position = 'bowler';
      }
      else if ((parseInt(player["Runs"] || 0) > 0) && 
               (parseInt(player["Wicket"] || 0) > 0 || parseInt(player["Catch"] || 0) > 0)) {
        position = 'allrounder';
      }
      else if (parseInt(player["Runs"] || 0) > 0 || 
               parseInt(player["4 Runs"] || 0) > 0 || 
               parseInt(player["6 Runs"] || 0) > 0) {
        position = 'batsman';
      }
      console.log(`Inferred position for ${player.Players}: ${position}`);
    }
    
    // Normalize position names
    if (position.includes('bat') || position === 'batter') {
      position = 'batsman';
    } else if (position.includes('bowl')) {
      position = 'bowler';
    } else if (position.includes('all') || position.includes('rounder')) {
      position = 'allrounder';
    } else if (position.includes('keep') || position.includes('wk')) {
      position = 'wicketkeeper';
    }
    
    return {
      // Common metrics
      runs: parseInt(player.Runs) || 0,
      totalPoints: parseInt(player["Total Points"]) || 0,
      position: position,
      team: player.Team || 'unknown',
      name: player.Players || 'Unknown Player',
      week: parseInt(player.Week) || 0,
      match: player.Match || '',
      
      // Batting metrics
      fours: parseInt(player["4 Runs"]) || 0,
      sixes: parseInt(player["6 Runs"])/2 || 0,
      thirties: parseInt(player["30 Runs"])/25 || 0,
      fifties: parseInt(player["Half Century"])/50 || 0,
      hundreds: parseInt(player.Century)/100 || 0,
      
      // Bowling metrics
      wickets: parseInt(player.Wicket)/25 || 0,
      threeWickets: parseInt(player["3-Wicket"])/50 || 0,
      fourWickets: parseInt(player["4-Wicket"])/100 || 0,
      fiveWickets: parseInt(player["5-Wicket"])/150 || 0,
      maidens: parseInt(player["Maiden Over"])/8 || 0,
      
      // Fielding metrics
      catches: parseInt(player.Catch)/8 || 0,
      stumpings: parseInt(player.Stumping)/12 || 0,
      directThrows: parseInt(player["Direct Throw"])/12 || 0,
      runOuts: parseInt(player["Run out"])/12 || 0,
      
      // Keep the raw player data for debugging
      raw: { ...player }
    };
  };

  // Function to render player statistics in a mobile-friendly card format
  const renderPlayerCard = (player) => {
    const matchesText = player.matchCount > 1 ? `${player.matchCount} matches` : '1 match';
    const weekText = player.week === 'all' ? 'Tournament' : `Week ${player.week}`;
    
    return (
      <div key={`${player.name}-${player.week}`} className={styles.playerCard}>
        <div className={styles.playerCardHeader}>
          <h3 className={styles.playerName}>{player.name}</h3>
          <span className={styles.playerTeam}>{player.team} - {weekText} ({matchesText})</span>
        </div>
        
        <div className={styles.playerCardBody}>
          <div className={styles.positionBadge}>
            <span className={`${styles.roleBadge} ${styles[player.position]}`}>
              {player.position === 'batsman' ? 'Batsman' :
               player.position === 'bowler' ? 'Bowler' :
               player.position === 'allrounder' ? 'All-rounder' :
               player.position === 'wicketkeeper' ? 'Wicket-keeper' :
               player.position}
            </span>
          </div>
          
          <div className={styles.statGroups}>
            {/* Common stats for all players */}
            <div className={styles.statGroup}>
              <div className={styles.stat}>
                <span className={styles.statLabel}>Points</span>
                <span className={styles.statValue}>{player.totalPoints}</span>
              </div>
            </div>
            
            {/* Position-specific stats */}
            {player.position === 'batsman' && (
              <div className={styles.statGroup}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Runs</span>
                  <span className={styles.statValue}>{player.runs}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>4s/6s</span>
                  <span className={styles.statValue}>{player.fours}/{player.sixes}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>50s/100s</span>
                  <span className={styles.statValue}>{player.fifties}/{player.hundreds}</span>
                </div>
              </div>
            )}
            
            {player.position === 'bowler' && (
              <div className={styles.statGroup}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Wickets</span>
                  <span className={styles.statValue}>{player.wickets}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>3W/4W/5W</span>
                  <span className={styles.statValue}>{player.threeWickets}/{player.fourWickets}/{player.fiveWickets}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Maidens</span>
                  <span className={styles.statValue}>{player.maidens}</span>
                </div>
              </div>
            )}
            
            {player.position === 'allrounder' && (
              <div className={styles.statGroup}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Runs</span>
                  <span className={styles.statValue}>{player.runs}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Wickets</span>
                  <span className={styles.statValue}>{player.wickets}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Catches</span>
                  <span className={styles.statValue}>{player.catches}</span>
                </div>
              </div>
            )}
            
            {player.position === 'wicketkeeper' && (
              <div className={styles.statGroup}>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Runs</span>
                  <span className={styles.statValue}>{player.runs}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Catches</span>
                  <span className={styles.statValue}>{player.catches}</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statLabel}>Stumpings</span>
                  <span className={styles.statValue}>{player.stumpings}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Function to render table for desktop view
  const renderTable = () => {
    return (
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Team</th>
              <th>Position</th>
              <th>Matches</th>
              <th>Period</th>
              {selectedPosition === 'batsman' && (
                <>
                  <th>Runs</th>
                  <th>4s</th>
                  <th>6s</th>
                  <th>50s</th>
                  <th>100s</th>
                </>
              )}
              {selectedPosition === 'bowler' && (
                <>
                  <th>Wickets</th>
                  <th>3W</th>
                  <th>4W</th>
                  <th>5W</th>
                  <th>Maidens</th>
                </>
              )}
              {selectedPosition === 'allrounder' && (
                <>
                  <th>Runs</th>
                  <th>Wickets</th>
                  <th>Catches</th>
                </>
              )}
              {selectedPosition === 'wicketkeeper' && (
                <>
                  <th>Runs</th>
                  <th>Catches</th>
                  <th>Stumpings</th>
                </>
              )}
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((player, index) => (
              <tr key={`${player.name}-${player.week}-${index}`}>
                <td>{player.name}</td>
                <td>{player.team}</td>
                <td>
                  <span className={`${styles.roleBadge} ${styles[player.position]}`}>
                    {player.position === 'batsman' ? 'Batsman' :
                     player.position === 'bowler' ? 'Bowler' :
                     player.position === 'allrounder' ? 'All-rounder' :
                     player.position === 'wicketkeeper' ? 'Wicket-keeper' :
                     player.position}
                  </span>
                </td>
                <td>{player.matchCount || 1}</td>
                <td>{player.week === 'all' ? 'Tournament' : `Week ${player.week}`}</td>
                {selectedPosition === 'batsman' && (
                  <>
                    <td>{player.runs}</td>
                    <td>{player.fours}</td>
                    <td>{player.sixes}</td>
                    <td>{player.fifties}</td>
                    <td>{player.hundreds}</td>
                  </>
                )}
                {selectedPosition === 'bowler' && (
                  <>
                    <td>{player.wickets}</td>
                    <td>{player.threeWickets}</td>
                    <td>{player.fourWickets}</td>
                    <td>{player.fiveWickets}</td>
                    <td>{player.maidens}</td>
                  </>
                )}
                {selectedPosition === 'allrounder' && (
                  <>
                    <td>{player.runs}</td>
                    <td>{player.wickets}</td>
                    <td>{player.catches}</td>
                  </>
                )}
                {selectedPosition === 'wicketkeeper' && (
                  <>
                    <td>{player.runs}</td>
                    <td>{player.catches}</td>
                    <td>{player.stumpings}</td>
                  </>
                )}
                <td className={styles.pointsColumn}>{player.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Player Performance Statistics</h1>
      
      {error ? (
        <div className={styles.error}>{error}</div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Player Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.filters}>
              <div className={styles.filterGroup}>
                <label htmlFor="position-filter">Position:</label>
                <select
                  id="position-filter"
                  className={styles.select}
                  value={selectedPosition}
                  onChange={(e) => setSelectedPosition(e.target.value)}
                >
                  <option value="all">All Positions</option>
                  <option value="batsman">Batsman</option>  
                  <option value="bowler">Bowler</option>   
                  <option value="allrounder">All-rounder</option>  
                  <option value="wicketkeeper">Wicket-keeper</option>
                </select>
              </div>
              
              <div className={styles.filterGroup}>
                <label htmlFor="week-filter">Period:</label>
                <select
                  id="week-filter"
                  className={styles.select}
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                >
                  <option value="all">Tournament (All Weeks)</option>
                  {availableWeeks.map(week => (
                    <option key={week} value={week}>Week {week}</option>
                  ))}
                </select>
              </div>
              
              <div className={styles.filterGroup}>
                <label htmlFor="search-filter">Search:</label>
                <input
                  id="search-filter"
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search by player or team..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            {loading ? (
              <div className={styles.loading}>Loading player statistics...</div>
            ) : filteredData.length === 0 ? (
              <div className={styles.noData}>
                <p>No player data found for the selected filters.</p>
                <p>Try changing your filter selections or search term.</p>
              </div>
            ) : (
              <>
                {/* Table for desktop view */}
                <div className={styles.desktopView}>
                  {renderTable()}
                </div>
                
                {/* Card-based layout for mobile view */}
                <div className={styles.mobileView}>
                  <div className={styles.cardsContainer}>
                    {filteredData.map((player, index) => renderPlayerCard(player))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PlayerPerformancePage;
