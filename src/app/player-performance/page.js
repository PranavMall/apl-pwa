"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/tabs';
import styles from './page.module.css';

// Define player roles constants to match PlayerMasterService
const PLAYER_ROLES = {
  BATSMAN: 'batsman',
  BOWLER: 'bowler',
  ALLROUNDER: 'allrounder',
  WICKETKEEPER: 'wicketkeeper'
};

const PlayerPerformancePage = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeRole, setActiveRole] = useState(PLAYER_ROLES.BATSMAN);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('');

  useEffect(() => {
    fetchPlayers();
    fetchTeams();
  }, [activeRole, selectedTeam]);

  const fetchTeams = async () => {
    try {
      const playersRef = collection(db, 'playersMaster');
      const snapshot = await getDocs(playersRef);
      
      // Extract unique team values
      const uniqueTeams = new Set();
      snapshot.forEach(doc => {
        const playerData = doc.data();
        if (playerData.team && playerData.team !== 'unknown') {
          uniqueTeams.add(playerData.team);
        }
      });
      
      setTeams(Array.from(uniqueTeams).sort());
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      console.log(`Fetching players for role: ${activeRole}, team: ${selectedTeam || 'all'}`);

      const playersRef = collection(db, 'playersMaster');
      
      // Build the query based on filters
      let playerQuery;
      
      if (selectedTeam && activeRole) {
        playerQuery = query(
          playersRef,
          where('role', '==', activeRole),
          where('team', '==', selectedTeam),
          where('active', '==', true)
        );
      } else if (selectedTeam) {
        playerQuery = query(
          playersRef,
          where('team', '==', selectedTeam),
          where('active', '==', true)
        );
      } else if (activeRole) {
        playerQuery = query(
          playersRef,
          where('role', '==', activeRole),
          where('active', '==', true)
        );
      } else {
        playerQuery = query(
          playersRef,
          where('active', '==', true)
        );
      }
      
      const querySnapshot = await getDocs(playerQuery);
      const playersData = [];

      querySnapshot.forEach(doc => {
        const playerData = doc.data();
        // Only add players with valid stats and names
        if (playerData.name) {
          // Default stats for players that don't have them
          const stats = playerData.stats || {
            matches: 0,
            battingRuns: 0,
            bowlingRuns: 0,
            wickets: 0,
            catches: 0,
            stumpings: 0,
            points: 0,
            fifties: 0,
            hundreds: 0,
            fours: 0,
            sixes: 0
          };
          
          playersData.push({
            id: doc.id,
            name: playerData.name,
            role: playerData.role || 'unknown',
            team: playerData.team || 'Unknown',
            isForeign: playerData.isForeign || false,
            matches: stats.matches || 0,
            battingRuns: stats.battingRuns || 0,
            bowlingRuns: stats.bowlingRuns || 0,
            wickets: stats.wickets || 0,
            catches: stats.catches || 0,
            stumpings: stats.stumpings || 0,
            runOuts: stats.runOuts || 0,
            fifties: stats.fifties || 0,
            hundreds: stats.hundreds || 0,
            fours: stats.fours || 0,
            sixes: stats.sixes || 0,
            points: stats.points || 0,
            battingAverage: calculateAverage(stats.battingRuns, stats.matches),
            bowlingAverage: calculateAverage(stats.bowlingRuns, stats.wickets),
            strikeRate: stats.strikeRate || '0.00',
            economyRate: stats.economyRate || '0.00'
          });
        }
      });
      
      setPlayers(playersData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching players:', error);
      setError('Failed to load player data');
      setLoading(false);
    }
  };

  const calculateAverage = (runs, divisor) => {
    if (!divisor || divisor === 0) return '0.00';
    return (runs / divisor).toFixed(2);
  };

  const sortPlayers = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sortedPlayers = [...players].sort((a, b) => {
      if (key === 'name' || key === 'team') {
        return direction === 'asc' 
          ? String(a[key]).localeCompare(String(b[key]))
          : String(b[key]).localeCompare(String(a[key]));
      }
      
      const valueA = parseFloat(a[key]) || 0;
      const valueB = parseFloat(b[key]) || 0;
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });

    setPlayers(sortedPlayers);
  };

  const renderPlayerStats = (player) => {
    const renderRoleSpecificStats = () => {
      switch (activeRole) {
        case PLAYER_ROLES.BATSMAN:
          return (
            <>
              <td className={styles.tableCell}>{player.team}</td>
              <td className={styles.tableCell}>{player.matches || 0}</td>
              <td className={styles.tableCell}>{player.battingRuns || 0}</td>
              <td className={styles.tableCell}>{player.fours || 0}</td>
              <td className={styles.tableCell}>{player.sixes || 0}</td>
              <td className={styles.tableCell}>{player.battingAverage}</td>
              <td className={styles.tableCell}>{player.fifties || 0}</td>
              <td className={styles.tableCell}>{player.hundreds || 0}</td>
              <td className={styles.tableCell}>{Math.round(player.points) || 0}</td>
            </>
          );
        
        case PLAYER_ROLES.BOWLER:
          return (
            <>
              <td className={styles.tableCell}>{player.team}</td>
              <td className={styles.tableCell}>{player.matches || 0}</td>
              <td className={styles.tableCell}>{player.wickets || 0}</td>
              <td className={styles.tableCell}>{player.bowlingAverage}</td>
              <td className={styles.tableCell}>{player.economyRate || '0.00'}</td>
              <td className={styles.tableCell}>{Math.round(player.points) || 0}</td>
            </>
          );
        
        case PLAYER_ROLES.ALLROUNDER:
          return (
            <>
              <td className={styles.tableCell}>{player.team}</td>
              <td className={styles.tableCell}>{player.matches || 0}</td>
              <td className={styles.tableCell}>{player.battingRuns || 0}</td>
              <td className={styles.tableCell}>{player.wickets || 0}</td>
              <td className={styles.tableCell}>{player.battingAverage}</td>
              <td className={styles.tableCell}>{player.bowlingAverage}</td>
              <td className={styles.tableCell}>{Math.round(player.points) || 0}</td>
            </>
          );
        
        case PLAYER_ROLES.WICKETKEEPER:
          return (
            <>
              <td className={styles.tableCell}>{player.team}</td>
              <td className={styles.tableCell}>{player.matches || 0}</td>
              <td className={styles.tableCell}>{player.battingRuns || 0}</td>
              <td className={styles.tableCell}>{player.catches || 0}</td>
              <td className={styles.tableCell}>{player.stumpings || 0}</td>
              <td className={styles.tableCell}>{Math.round(player.points) || 0}</td>
            </>
          );

        default:
          return (
            <>
              <td className={styles.tableCell}>{player.team}</td>
              <td className={styles.tableCell}>{player.role}</td>
              <td className={styles.tableCell}>{player.matches || 0}</td>
              <td className={styles.tableCell}>{Math.round(player.points) || 0}</td>
            </>
          );
      }
    };

    return (
      <>
        <td className={styles.tableCell}>{player.name}</td>
        {renderRoleSpecificStats()}
      </>
    );
  };

  const getTableHeaders = () => {
    const baseHeaders = [
      { key: 'name', label: 'Name' }
    ];

    // Add team header if no team is selected
    if (!selectedTeam) {
      baseHeaders.push({ key: 'team', label: 'Team' });
    }

          const roleSpecificHeaders = {
      [PLAYER_ROLES.BATSMAN]: [
        { key: 'matches', label: 'Matches' },
        { key: 'battingRuns', label: 'Runs' },
        { key: 'fours', label: '4s' },
        { key: 'sixes', label: '6s' },
        { key: 'battingAverage', label: 'Average' },
        { key: 'fifties', label: '50s' },
        { key: 'hundreds', label: '100s' }
      ],
      [PLAYER_ROLES.BOWLER]: [
        { key: 'matches', label: 'Matches' },
        { key: 'wickets', label: 'Wickets' },
        { key: 'bowlingAverage', label: 'Average' },
        { key: 'economyRate', label: 'Economy' }
      ],
      [PLAYER_ROLES.ALLROUNDER]: [
        { key: 'matches', label: 'Matches' },
        { key: 'battingRuns', label: 'Runs' },
        { key: 'wickets', label: 'Wickets' },
        { key: 'battingAverage', label: 'Batting Avg' },
        { key: 'bowlingAverage', label: 'Bowling Avg' }
      ],
      [PLAYER_ROLES.WICKETKEEPER]: [
        { key: 'matches', label: 'Matches' },
        { key: 'battingRuns', label: 'Runs' },
        { key: 'catches', label: 'Catches' },
        { key: 'stumpings', label: 'Stumpings' }
      ]
    };

    // Check if role exists in our mapping, if not use an empty array
    const roleHeaders = roleSpecificHeaders[activeRole] || [];
    
    // Add fantasy points header to all roles
    const fantasyHeader = { key: 'points', label: 'Fantasy Points' };

    return [...baseHeaders, ...roleHeaders, fantasyHeader];
  };

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader>
          <CardTitle>Player Performance Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.filters}>
            {teams.length > 0 && (
              <div className={styles.teamFilter}>
                <label htmlFor="team-filter">Filter by Team:</label>
                <select 
                  id="team-filter"
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className={styles.select}
                >
                  <option value="">All Teams</option>
                  {teams.map(team => (
                    <option key={team} value={team}>{team}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          
          <Tabs 
            value={activeRole} 
            onValueChange={(value) => setActiveRole(value)}
          >
            <TabsList>
              <TabsTrigger value={PLAYER_ROLES.BATSMAN}>
                Batsmen
              </TabsTrigger>
              <TabsTrigger value={PLAYER_ROLES.BOWLER}>
                Bowlers
              </TabsTrigger>
              <TabsTrigger value={PLAYER_ROLES.ALLROUNDER}>
                All-rounders
              </TabsTrigger>
              <TabsTrigger value={PLAYER_ROLES.WICKETKEEPER}>
                Wicket-keepers
              </TabsTrigger>
            </TabsList>

            {Object.values(PLAYER_ROLES).map((role) => (
              <TabsContent key={role} value={role}>
                {loading ? (
                  <div className={styles.loading}>Loading players...</div>
                ) : error ? (
                  <div className={styles.error}>{error}</div>
                ) : players.length === 0 ? (
                  <div className={styles.noData}>
                    No {role} data available
                    {selectedTeam && ` for team ${selectedTeam}`}
                  </div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          {getTableHeaders().map((header) => (
                            <th
                              key={header.key}
                              className={styles.tableHeader}
                              onClick={() => sortPlayers(header.key)}
                            >
                              {header.label}
                              {sortConfig.key === header.key && (
                                <span className={styles.sortArrow}>
                                  {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                                </span>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {players.map((player) => (
                          <tr key={player.id} className={styles.tableRow}>
                            {renderPlayerStats(player)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlayerPerformancePage;
