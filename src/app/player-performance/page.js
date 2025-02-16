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

    // First get all matches
    const matches = await cricketService.getMatchesFromFirebase();
    console.log('Fetched matches:', matches.length);

    // Fetch players with role
    const playersRef = collection(db, 'players');
    const roleQuery = query(
      playersRef,
      where('role', '==', activeRole),
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(roleQuery);
    const playersData = [];

    // Process each player
    for (const doc of querySnapshot.docs) {
      const playerData = doc.data();
      
      // Get player's points from playerPoints collection
      const pointsQuery = query(
        collection(db, 'playerPoints'),
        where('playerId', '==', doc.id),
        orderBy('timestamp', 'desc')
      );

      const pointsSnapshot = await getDocs(pointsQuery);
      const totalFantasyPoints = pointsSnapshot.docs.reduce((sum, pointDoc) => {
        const points = pointDoc.data().points || 0;
        return sum + points;
      }, 0);

      // Initialize stats
      let playerStats = {
        id: doc.id,
        name: playerData.name,
        matches: 0,
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
        battingStyle: playerData.battingStyle,
        bowlingStyle: playerData.bowlingStyle,
        fantasyPoints: totalFantasyPoints
      };

      // Process matches for player statistics
      matches.forEach(match => {
        if (!match?.scorecard?.team1 || !match?.scorecard?.team2) return;

        [match.scorecard.team1, match.scorecard.team2].forEach(team => {
          // Check batting stats
          if (team.batsmen) {
            Object.values(team.batsmen).forEach(batsman => {
              if (batsman.name === playerData.name) {
                playerStats.matches++;
                playerStats.runs += parseInt(batsman.runs) || 0;
                playerStats.balls += parseInt(batsman.balls) || 0;
                playerStats.fours += parseInt(batsman.fours) || 0;
                playerStats.sixes += parseInt(batsman.sixes) || 0;

                const runs = parseInt(batsman.runs) || 0;
                if (runs >= 50 && runs < 100) playerStats.fifties++;
                if (runs >= 100) playerStats.hundreds++;
              }
            });
          }

          // Check bowling stats
          if (team.bowlers) {
            Object.values(team.bowlers).forEach(bowler => {
              if (bowler.name === playerData.name) {
                if (!playerStats.matches) playerStats.matches++;
                playerStats.wickets += parseInt(bowler.wickets) || 0;
                playerStats.bowlingRuns += parseInt(bowler.runs) || 0;
                
                const overs = parseFloat(bowler.overs) || 0;
                const fullOvers = Math.floor(overs);
                const partOver = (overs % 1) * 10;
                playerStats.bowlingBalls += (fullOvers * 6) + partOver;
              }
            });
          }

          // Check fielding stats
          if (team.batsmen) {
            Object.values(team.batsmen).forEach(batsman => {
              if (batsman.dismissal) {
                if (batsman.dismissal.includes(`c ${playerData.name}`)) {
                  playerStats.catches++;
                  playerStats.dismissals++;
                } else if (batsman.dismissal.includes(`st ${playerData.name}`)) {
                  playerStats.stumpings++;
                  playerStats.dismissals++;
                }
              }
            });
          }
        });
      });

      // Calculate averages and rates
      playerStats.battingAverage = playerStats.matches > 0 ? 
        (playerStats.runs / playerStats.matches).toFixed(2) : '0.00';
      
      playerStats.strikeRate = playerStats.balls > 0 ? 
        ((playerStats.runs / playerStats.balls) * 100).toFixed(2) : '0.00';
      
      playerStats.economyRate = playerStats.bowlingBalls > 0 ? 
        ((playerStats.bowlingRuns / playerStats.bowlingBalls) * 6).toFixed(2) : '0.00';
      
      playerStats.bowlingAverage = playerStats.wickets > 0 ? 
        (playerStats.bowlingRuns / playerStats.wickets).toFixed(2) : '0.00';

      playersData.push(playerStats);
    }
    
    setPlayers(playersData);
  } catch (error) {
    console.error('Error fetching players:', error);
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
      if (!match?.scorecard?.team1 || !match?.scorecard?.team2) return;

      // Process both teams
      [match.scorecard.team1, match.scorecard.team2].forEach(team => {
        // Handle batting stats
        const batsmen = team.batsmen || [];
        if (Array.isArray(batsmen)) {
          const battingData = batsmen.find(b => b?.name === playerName);
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
        }

        // Handle bowling stats
        const bowlers = team.bowlers || [];
        if (Array.isArray(bowlers)) {
          const bowlingData = bowlers.find(b => b?.name === playerName);
          if (bowlingData) {
            if (!stats.matches) stats.matches++;
            stats.wickets += parseInt(bowlingData.wickets) || 0;
            stats.bowlingRuns += parseInt(bowlingData.runs) || 0;
            const overs = parseFloat(bowlingData.overs) || 0;
            stats.overs += overs;
          }
        }

        // Handle fielding stats
        if (Array.isArray(batsmen)) {
          batsmen.forEach(batsman => {
            if (batsman?.dismissal) {
              if (batsman.dismissal.includes(`c ${playerName}`)) {
                stats.catches++;
              } else if (batsman.dismissal.includes(`st ${playerName}`)) {
                stats.stumpings++;
              }
            }
          });
        }
      });
    });

    // Calculate derived statistics
    stats.dismissals = stats.catches + stats.stumpings;
    stats.battingAverage = stats.matches > 0 ? (stats.runs / stats.matches).toFixed(2) : '0.00';
    stats.strikeRate = stats.balls > 0 ? ((stats.runs / stats.balls) * 100).toFixed(2) : '0.00';
    stats.economyRate = stats.overs > 0 ? (stats.bowlingRuns / (stats.overs * 6)).toFixed(2) : '0.00';
    stats.bowlingAverage = stats.wickets > 0 ? (stats.bowlingRuns / stats.wickets).toFixed(2) : '0.00';

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
