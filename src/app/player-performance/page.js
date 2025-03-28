"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
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

  useEffect(() => {
    fetchPlayerPerformanceData();
  }, []);

  useEffect(() => {
    // Apply filters when data, position, week, or search term changes
    let data = [...playerData];
    
    // Filter by position - case insensitive matching
    if (selectedPosition && selectedPosition !== 'all') {
      data = data.filter(player => 
        player.position?.toLowerCase() === selectedPosition.toLowerCase()
      );
    }
    
    // Filter by week
    if (selectedWeek && selectedWeek !== 'all') {
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
      const processedData = result.processedRows ? 
        result.processedRows.map(row => calculateMetrics(row)) : [];
      
      // Extract available weeks for filter
      const weeks = new Set();
      processedData.forEach(player => {
        if (player.week) weeks.add(player.week);
      });
      setAvailableWeeks(Array.from(weeks).sort((a, b) => a - b));
      
      setPlayerData(processedData);
      setFilteredData(processedData);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching player performance data:', err);
      setError('Failed to load player performance data. Please try again later.');
      setLoading(false);
    }
  };

  // Helper function to calculate metrics from points
const calculateMetrics = (player) => {
    return {
      // Common metrics
      runs: parseInt(player.Runs) || 0,
      totalPoints: parseInt(player["Total Points"]) || 0,
      position: player["Player Position"]?.toLowerCase() || 'unknown', // Get position from Player Position field
      team: player.Team || 'unknown',
      name: player.Players || 'Unknown Player',
      week: parseInt(player.Week) || 0,
      match: player.Match || '',
      
      // Batting metrics
      fours: parseInt(player["4 Runs"]) || 0,
      sixes: parseInt(player["6 Runs"]) || 0,
      thirties: parseInt(player["30 Runs"]) || 0,
      fifties: parseInt(player["Half Century"]) || 0,
      hundreds: parseInt(player.Century) || 0,
      
      // Bowling metrics
      wickets: parseInt(player.Wicket) || 0,
      threeWickets: parseInt(player["3-Wicket"]) || 0,
      fourWickets: parseInt(player["4-Wicket"]) || 0,
      fiveWickets: parseInt(player["5-Wicket"]) || 0,
      maidens: parseInt(player["Maiden Over"]) || 0,
      
      // Fielding metrics
      catches: parseInt(player.Catch) || 0,
      stumpings: parseInt(player.Stumping) || 0,
      directThrows: parseInt(player["Direct Throw"]) || 0,
      runOuts: parseInt(player["Run out"]) || 0
    };
  };

  // Function to render table headers based on player position
  const renderTableHeaders = () => {
    switch (selectedPosition) {
      case 'batsman':
        return (
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>Runs</th>
            <th>4s</th>
            <th>6s</th>
            <th>50s</th>
            <th>100s</th>
            <th>Points</th>
          </tr>
        );
      case 'bowler':
        return (
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>Wickets</th>
            <th>3W</th>
            <th>4W</th>
            <th>5W</th>
            <th>Maidens</th>
            <th>Points</th>
          </tr>
        );
      case 'wicketkeeper':
        return (
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>Runs</th>
            <th>Catches</th>
            <th>Stumpings</th>
            <th>Dismissals</th>
            <th>Points</th>
          </tr>
        );
      case 'allrounder':
        return (
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>Runs</th>
            <th>Wickets</th>
            <th>Catches</th>
            <th>Points</th>
          </tr>
        );
      default:
        return (
          <tr>
            <th>Player</th>
            <th>Team</th>
            <th>Position</th>
            <th>Points</th>
          </tr>
        );
    }
  };

  // Function to render table rows based on player position
  const renderPlayerRow = (player) => {
    switch (selectedPosition) {
      case 'batsman':
        return (
          <tr key={`${player.name}-${player.week}-${player.match}`}>
            <td>{player.name}</td>
            <td>{player.team}</td>
            <td>{player.runs}</td>
            <td>{player.fours}</td>
            <td>{player.sixes}</td>
            <td>{player.fifties}</td>
            <td>{player.hundreds}</td>
            <td className={styles.pointsColumn}>{player.totalPoints}</td>
          </tr>
        );
      case 'bowler':
        return (
          <tr key={`${player.name}-${player.week}-${player.match}`}>
            <td>{player.name}</td>
            <td>{player.team}</td>
            <td>{player.wickets}</td>
            <td>{player.threeWickets}</td>
            <td>{player.fourWickets}</td>
            <td>{player.fiveWickets}</td>
            <td>{player.maidens}</td>
            <td className={styles.pointsColumn}>{player.totalPoints}</td>
          </tr>
        );
      case 'wicketkeeper':
        return (
          <tr key={`${player.name}-${player.week}-${player.match}`}>
            <td>{player.name}</td>
            <td>{player.team}</td>
            <td>{player.runs}</td>
            <td>{player.catches}</td>
            <td>{player.stumpings}</td>
            <td>{player.directThrows + player.runOuts}</td>
            <td className={styles.pointsColumn}>{player.totalPoints}</td>
          </tr>
        );
      case 'allrounder':
        return (
          <tr key={`${player.name}-${player.week}-${player.match}`}>
            <td>{player.name}</td>
            <td>{player.team}</td>
            <td>{player.runs}</td>
            <td>{player.wickets}</td>
            <td>{player.catches}</td>
            <td className={styles.pointsColumn}>{player.totalPoints}</td>
          </tr>
        );
      default:
        return (
          <tr key={`${player.name}-${player.week}-${player.match}`}>
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
            <td className={styles.pointsColumn}>{player.totalPoints}</td>
          </tr>
        );
    }
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
                <label htmlFor="week-filter">Week:</label>
                <select
                  id="week-filter"
                  className={styles.select}
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                >
                  <option value="all">All Weeks</option>
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
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    {renderTableHeaders()}
                  </thead>
                  <tbody>
                    {filteredData.map(player => renderPlayerRow(player))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PlayerPerformancePage;
