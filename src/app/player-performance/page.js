"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/tabs';
import { PlayerService } from '../services/playerService';
import { cricketService } from '../services/cricketService';
import styles from './page.module.css';

const PlayerPerformancePage = () => {
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState(PlayerService.PLAYER_ROLES.BATSMAN);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  useEffect(() => {
    fetchPlayers();
  }, [activeRole]);

const fetchPlayers = async () => {
  try {
    setLoading(true);
    console.log('Fetching players for role:', activeRole);

    // First get all matches for the tournament
    const matchesRef = collection(db, 'matches');
    const matchesQuery = query(
      matchesRef,
      where('matchInfo.seriesName', '==', 'Pakistan ODI Tri-Series, 2025')
    );
    const matchesSnapshot = await getDocs(matchesQuery);
    const matchIds = matchesSnapshot.docs.map(doc => doc.id);

    // Fetch players with role
    const playersRef = collection(db, 'players');
    const roleQuery = query(
      playersRef,
      where('role', '==', activeRole)
    );
    
    const querySnapshot = await getDocs(roleQuery);
    const playersData = [];

    // Process each player
    for (const doc of querySnapshot.docs) {
      const playerData = doc.data();
      
      // Get player's points only for tournament matches
      const pointsQuery = query(
        collection(db, 'playerPoints'),
        where('matchId', 'in', matchIds)
      );

      const pointsSnapshot = await getDocs(pointsQuery);
      let totalPoints = 0;
      let matchPerformances = [];

      // Calculate total points and collect performance data
      pointsSnapshot.docs.forEach(pointDoc => {
        const pointData = pointDoc.data();
        if (pointData.playerId === doc.id) {
          totalPoints += pointData.points || 0;
          if (pointData.performance) {
            matchPerformances.push({
              matchId: pointData.matchId,
              points: pointData.points,
              performance: pointData.performance
            });
          }
        }
      });

      // Only add players who have participated in the tournament
      if (matchPerformances.length > 0) {
        playersData.push({
          id: doc.id,
          name: playerData.name,
          fantasyPoints: totalPoints,
          ...playerData,
          ...calculatePlayerStats(matchPerformances)
        });
      }
    }
    
    setPlayers(playersData);
  } catch (error) {
    console.error('Error fetching players:', error);
    setError('Failed to load player data');
  } finally {
    setLoading(false);
  }
};


const calculatePlayerStats = (matchPerformances) => {
  const stats = {
    matches: matchPerformances.length,
    runs: 0,
    balls: 0,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    wickets: 0,
    bowlingRuns: 0,
    bowlingBalls: 0,
    catches: 0,
    stumpings: 0,
    dismissals: 0,
    battingAverage: '0.00',
    strikeRate: '0.00',
    economyRate: '0.00',
    bowlingAverage: '0.00'
  };

  // Aggregate performance data
  matchPerformances.forEach(match => {
    const perf = match.performance;
    if (perf.batting) {
      stats.runs += perf.batting.runs || 0;
      stats.balls += perf.batting.balls || 0;
      stats.fours += perf.batting.fours || 0;
      stats.sixes += perf.batting.sixes || 0;
      if (perf.batting.runs >= 100) stats.hundreds++;
      else if (perf.batting.runs >= 50) stats.fifties++;
    }
    
    if (perf.bowling) {
      stats.wickets += perf.bowling.wickets || 0;
      stats.bowlingRuns += perf.bowling.runs || 0;
      stats.bowlingBalls += perf.bowling.balls || 0;
    }
    
    if (perf.fielding) {
      stats.catches += perf.fielding.catches || 0;
      stats.stumpings += perf.fielding.stumpings || 0;
      stats.dismissals = stats.catches + stats.stumpings;
    }
  });

  // Calculate averages and rates
  if (stats.matches > 0) {
    stats.battingAverage = (stats.runs / stats.matches).toFixed(2);
  }
  
  if (stats.balls > 0) {
    stats.strikeRate = ((stats.runs / stats.balls) * 100).toFixed(2);
  }
  
  if (stats.bowlingBalls > 0) {
    stats.economyRate = ((stats.bowlingRuns / stats.bowlingBalls) * 6).toFixed(2);
  }

  if (stats.wickets > 0) {
    stats.bowlingAverage = (stats.bowlingRuns / stats.wickets).toFixed(2);
  }

  return stats;
};

  const sortPlayers = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sortedPlayers = [...players].sort((a, b) => {
      if (key === 'name') {
        return direction === 'asc' 
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
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
      case PlayerService.PLAYER_ROLES.BATSMAN:
        return (
          <>
            <td className={styles.tableCell}>{player.battingStyle || '-'}</td>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.runs || 0}</td>
            <td className={styles.tableCell}>{player.battingAverage}</td>
            <td className={styles.tableCell}>{player.strikeRate}</td>
            <td className={styles.tableCell}>{player.fifties || 0}</td>
            <td className={styles.tableCell}>{player.hundreds || 0}</td>
            <td className={styles.tableCell}>{Math.round(player.fantasyPoints) || 0}</td>
          </>
        );
      
      case PlayerService.PLAYER_ROLES.BOWLER:
        return (
          <>
            <td className={styles.tableCell}>{player.bowlingStyle || '-'}</td>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.wickets || 0}</td>
            <td className={styles.tableCell}>{player.economyRate}</td>
            <td className={styles.tableCell}>{player.bowlingAverage}</td>
            <td className={styles.tableCell}>{player.fiveWickets || 0}</td>
            <td className={styles.tableCell}>{Math.round(player.fantasyPoints) || 0}</td>
          </>
        );
      
      case PlayerService.PLAYER_ROLES.ALLROUNDER:
        return (
          <>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.runs || 0}</td>
            <td className={styles.tableCell}>{player.wickets || 0}</td>
            <td className={styles.tableCell}>{player.battingAverage}</td>
            <td className={styles.tableCell}>{player.bowlingAverage}</td>
            <td className={styles.tableCell}>{Math.round(player.fantasyPoints) || 0}</td>
          </>
        );
      
      case PlayerService.PLAYER_ROLES.WICKETKEEPER:
        return (
          <>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.runs || 0}</td>
            <td className={styles.tableCell}>{player.dismissals || 0}</td>
            <td className={styles.tableCell}>{player.stumpings || 0}</td>
            <td className={styles.tableCell}>{player.catches || 0}</td>
            <td className={styles.tableCell}>{Math.round(player.fantasyPoints) || 0}</td>
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

  const roleSpecificHeaders = {
    [PlayerService.PLAYER_ROLES.BATSMAN]: [
      { key: 'battingStyle', label: 'Batting Style' },
      { key: 'matches', label: 'Matches' },
      { key: 'runs', label: 'Runs' },
      { key: 'battingAverage', label: 'Average' },
      { key: 'strikeRate', label: 'Strike Rate' },
      { key: 'fifties', label: '50s' },
      { key: 'hundreds', label: '100s' }
    ],
    [PlayerService.PLAYER_ROLES.BOWLER]: [
      { key: 'bowlingStyle', label: 'Bowling Style' },
      { key: 'matches', label: 'Matches' },
      { key: 'wickets', label: 'Wickets' },
      { key: 'economyRate', label: 'Economy' },
      { key: 'bowlingAverage', label: 'Average' },
      { key: 'fiveWickets', label: '5 Wickets' }
    ],
    [PlayerService.PLAYER_ROLES.ALLROUNDER]: [
      { key: 'matches', label: 'Matches' },
      { key: 'runs', label: 'Runs' },
      { key: 'wickets', label: 'Wickets' },
      { key: 'battingAverage', label: 'Batting Avg' },
      { key: 'bowlingAverage', label: 'Bowling Avg' }
    ],
    [PlayerService.PLAYER_ROLES.WICKETKEEPER]: [
      { key: 'matches', label: 'Matches' },
      { key: 'runs', label: 'Runs' },
      { key: 'dismissals', label: 'Dismissals' },
      { key: 'stumpings', label: 'Stumpings' },
      { key: 'catches', label: 'Catches' }
    ]
  };

  // Add fantasy points header to all roles
  const fantasyHeader = { key: 'fantasyPoints', label: 'Fantasy Points' };

  return [...baseHeaders, ...roleSpecificHeaders[activeRole], fantasyHeader];
};

  return (
  <div className={styles.container}>
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Player Performance Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs 
          value={activeRole} 
          onValueChange={(value) => setActiveRole(value)}
        >
          <TabsList>
            <TabsTrigger value={PlayerService.PLAYER_ROLES.BATSMAN}>
              Batsmen
            </TabsTrigger>
            <TabsTrigger value={PlayerService.PLAYER_ROLES.BOWLER}>
              Bowlers
            </TabsTrigger>
            <TabsTrigger value={PlayerService.PLAYER_ROLES.ALLROUNDER}>
              All-rounders
            </TabsTrigger>
            <TabsTrigger value={PlayerService.PLAYER_ROLES.WICKETKEEPER}>
              Wicket-keepers
            </TabsTrigger>
          </TabsList>

          {Object.values(PlayerService.PLAYER_ROLES).map((role) => (
            <TabsContent key={role} value={role}>
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
                            <span>{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
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
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  </div>
);
};

export default PlayerPerformancePage;
