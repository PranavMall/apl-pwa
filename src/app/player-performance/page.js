"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import styles from './page.module.css';

const PlayerPerformancePage = () => {
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRole] = useState('batsman');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  useEffect(() => {
    fetchData();
  }, [activeRole]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch matches first
      const matchesRef = collection(db, 'matches');
      const matchesSnapshot = await getDocs(matchesRef);
      const matchesData = [];
      matchesSnapshot.forEach((doc) => {
        matchesData.push({ id: doc.id, ...doc.data() });
      });
      setMatches(matchesData);

      // Fetch players
      const playersRef = collection(db, 'players');
      const roleQuery = query(
        playersRef,
        where('role', '==', activeRole),
        orderBy('name', 'asc')
      );
      
      const querySnapshot = await getDocs(roleQuery);
      const playersData = [];
      
      querySnapshot.forEach((doc) => {
        const playerData = doc.data();
        const playerStats = calculatePlayerStats(playerData.name, matchesData);
        
        const enhancedData = {
          id: doc.id,
          ...playerData,
          ...playerStats
        };
        playersData.push(enhancedData);
      });
      
      setPlayers(playersData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePlayerStats = (playerName, matches) => {
    const stats = {
      matches: 0,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0,
      fifties: 0,
      hundreds: 0,
      wickets: 0,
      overs: 0,
      economyRate: 0,
      bowlingRuns: 0,
      catches: 0,
      stumpings: 0
    };

    matches.forEach(match => {
      const { scorecard } = match;
      if (!scorecard?.team1 || !scorecard?.team2) return;

      // Process batting stats
      [scorecard.team1, scorecard.team2].forEach(team => {
        const battingData = team.batsmen?.find(b => b.name === playerName);
        if (battingData) {
          stats.matches++;
          stats.runs += parseInt(battingData.runs) || 0;
          stats.balls += parseInt(battingData.balls) || 0;
          stats.fours += parseInt(battingData.fours) || 0;
          stats.sixes += parseInt(battingData.sixes) || 0;
          
          const runs = parseInt(battingData.runs) || 0;
          if (runs >= 50 && runs < 100) stats.fifties++;
          if (runs >= 100) stats.hundreds++;
        }

        // Process bowling stats
        const bowlingData = team.bowlers?.find(b => b.name === playerName);
        if (bowlingData) {
          if (!stats.matches) stats.matches++;
          stats.wickets += parseInt(bowlingData.wickets) || 0;
          stats.bowlingRuns += parseInt(bowlingData.runs) || 0;
          const overs = parseFloat(bowlingData.overs) || 0;
          stats.overs += overs;
        }
      });
    });

    // Calculate averages and rates
    stats.battingAverage = stats.runs && stats.matches ? (stats.runs / stats.matches).toFixed(2) : '0.00';
    stats.strikeRate = stats.runs && stats.balls ? ((stats.runs / stats.balls) * 100).toFixed(2) : '0.00';
    stats.economyRate = stats.bowlingRuns && stats.overs ? (stats.bowlingRuns / (stats.overs * 6)).toFixed(2) : '0.00';

    return stats;
  };

  const sortPlayers = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });

    const sortedPlayers = [...players].sort((a, b) => {
      const valueA = parseFloat(a[key]) || 0;
      const valueB = parseFloat(b[key]) || 0;
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });

    setPlayers(sortedPlayers);
  };

  const renderPlayerStats = (player) => {
    switch (activeRole) {
      case 'batsman':
        return (
          <>
            <td className={styles.tableCell}>{player.battingStyle || '-'}</td>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.runs || 0}</td>
            <td className={styles.tableCell}>{player.battingAverage}</td>
            <td className={styles.tableCell}>{player.strikeRate}</td>
            <td className={styles.tableCell}>{player.fifties || 0}</td>
            <td className={styles.tableCell}>{player.hundreds || 0}</td>
          </>
        );
      
      case 'bowler':
        return (
          <>
            <td className={styles.tableCell}>{player.bowlingStyle || '-'}</td>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.wickets || 0}</td>
            <td className={styles.tableCell}>{player.economyRate}</td>
            <td className={styles.tableCell}>{player.bowlingAverage}</td>
            <td className={styles.tableCell}>{player.fiveWickets || 0}</td>
          </>
        );
      
      case 'allrounder':
        return (
          <>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.runs || 0}</td>
            <td className={styles.tableCell}>{player.wickets || 0}</td>
            <td className={styles.tableCell}>{player.battingAverage}</td>
            <td className={styles.tableCell}>{player.bowlingAverage}</td>
          </>
        );
      
      case 'wicketkeeper':
        return (
          <>
            <td className={styles.tableCell}>{player.matches || 0}</td>
            <td className={styles.tableCell}>{player.runs || 0}</td>
            <td className={styles.tableCell}>{player.dismissals || 0}</td>
            <td className={styles.tableCell}>{player.stumpings || 0}</td>
            <td className={styles.tableCell}>{player.catches || 0}</td>
          </>
        );
    }
  };

  const getTableHeaders = () => {
    switch (activeRole) {
      case 'batsman':
        return [
          { key: 'name', label: 'Name' },
          { key: 'battingStyle', label: 'Batting Style' },
          { key: 'matches', label: 'Matches' },
          { key: 'runs', label: 'Runs' },
          { key: 'battingAverage', label: 'Average' },
          { key: 'strikeRate', label: 'Strike Rate' },
          { key: 'fifties', label: '50s' },
          { key: 'hundreds', label: '100s' }
        ];
      
      case 'bowler':
        return [
          { key: 'name', label: 'Name' },
          { key: 'bowlingStyle', label: 'Bowling Style' },
          { key: 'matches', label: 'Matches' },
          { key: 'wickets', label: 'Wickets' },
          { key: 'economyRate', label: 'Economy' },
          { key: 'bowlingAverage', label: 'Average' },
          { key: 'fiveWickets', label: '5 Wickets' }
        ];
      
      case 'allrounder':
        return [
          { key: 'name', label: 'Name' },
          { key: 'matches', label: 'Matches' },
          { key: 'runs', label: 'Runs' },
          { key: 'wickets', label: 'Wickets' },
          { key: 'battingAverage', label: 'Batting Avg' },
          { key: 'bowlingAverage', label: 'Bowling Avg' }
        ];
      
      case 'wicketkeeper':
        return [
          { key: 'name', label: 'Name' },
          { key: 'matches', label: 'Matches' },
          { key: 'runs', label: 'Runs' },
          { key: 'dismissals', label: 'Dismissals' },
          { key: 'stumpings', label: 'Stumpings' },
          { key: 'catches', label: 'Catches' }
        ];
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading players...</div>;
  }

  return (
    <div className={styles.container}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Player Performance Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeRole} onValueChange={setActiveRole}>
            <TabsList>
              <TabsTrigger value="batsman">Batsmen</TabsTrigger>
              <TabsTrigger value="bowler">Bowlers</TabsTrigger>
              <TabsTrigger value="allrounder">All-rounders</TabsTrigger>
              <TabsTrigger value="wicketkeeper">Wicket-keepers</TabsTrigger>
            </TabsList>

            {['batsman', 'bowler', 'allrounder', 'wicketkeeper'].map((role) => (
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
                          <td className={styles.tableCell}>{player.name}</td>
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
