"use client";

import React, { useState, useEffect, useMemo } from "react";
import { collection, query, getDocs, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "@/app/context/authContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import styles from "./leaderboard.module.css";
import { transferService } from "../services/transferService";
import { LeagueService } from "../services/leagueService";

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

const LeaderboardPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [weekNumbers, setWeekNumbers] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [userRank, setUserRank] = useState(null);
  
  // League-related state
  const [userLeagues, setUserLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [leagueLeaderboardData, setLeagueLeaderboardData] = useState([]);
  const [loadingLeagueData, setLoadingLeagueData] = useState(false);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'rank',
    direction: 'asc'
  });
  
  useEffect(() => {
    fetchLeaderboardData();
  }, []);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  // Sort function for table data
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Memoized sorted data
  const sortedLeaderboardData = useMemo(() => {
    let sortableData = [...leaderboardData];
    if (sortConfig.key) {
      sortableData.sort((a, b) => {
        // Handle nested week points
        if (sortConfig.key.startsWith('week_')) {
          const weekNum = parseInt(sortConfig.key.split('_')[1]);
          const aValue = a.weeks[weekNum] || 0;
          const bValue = b.weeks[weekNum] || 0;
          
          if (sortConfig.direction === 'asc') {
            return aValue - bValue;
          } else {
            return bValue - aValue;
          }
        }
        
        // Handle other columns
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [leaderboardData, sortConfig]);
  
  // Memoized sorted league data
  const sortedLeagueData = useMemo(() => {
    let sortableData = [...leagueLeaderboardData];
    if (sortConfig.key) {
      sortableData.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [leagueLeaderboardData, sortConfig]);

  const getSortIndicator = (key) => {
    if (sortConfig.key === key) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  const fetchUserLeagues = async () => {
    try {
      const leagues = await LeagueService.getUserLeagues(user.uid);
      setUserLeagues(leagues);
      
      // Check if there's a cached selected league
      const cachedLeagueId = localStorage.getItem('selectedLeagueId');
      if (cachedLeagueId) {
        const league = leagues.find(l => l.id === cachedLeagueId);
        if (league) {
          handleLeagueSelection(cachedLeagueId);
        }
      }
    } catch (error) {
      console.error('Error fetching user leagues:', error);
    }
  };

  const handleLeagueSelection = async (leagueId) => {
    if (!leagueId) {
      setSelectedLeague(null);
      localStorage.removeItem('selectedLeagueId');
      localStorage.removeItem('leagueLeaderboardData');
      return;
    }
    
    try {
      setLoadingLeagueData(true);
      
      // Save selected league ID to localStorage
      localStorage.setItem('selectedLeagueId', leagueId);
      
      const selectedLeagueObj = userLeagues.find(league => league.id === leagueId);
      setSelectedLeague(selectedLeagueObj);
      
      // Check if there's cached data and if it's still valid
      const cachedData = localStorage.getItem(`leagueLeaderboard_${leagueId}`);
      if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        const now = Date.now();
        
        if (now - timestamp < CACHE_DURATION) {
          // Use cached data if it's less than 5 minutes old
          console.log('Using cached league leaderboard data');
          setLeagueLeaderboardData(data);
          setLoadingLeagueData(false);
          return;
        }
      }
      
      // Fetch fresh data if no cache or cache expired
      const leaderboardData = await LeagueService.getLeagueLeaderboard(leagueId);
      setLeagueLeaderboardData(leaderboardData);
      
      // Cache the new data
      localStorage.setItem(`leagueLeaderboard_${leagueId}`, JSON.stringify({
        data: leaderboardData,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error loading league leaderboard:', error);
      setError('Failed to load league leaderboard. Please try again.');
    } finally {
      setLoadingLeagueData(false);
    }
  };

  const fetchLeaderboardData = async () => {
    try {
      setLoading(true);
      
      // Check for cached data
      const cachedData = localStorage.getItem('globalLeaderboardData');
      if (cachedData) {
        const { data, tournament, weekNums, timestamp } = JSON.parse(cachedData);
        const now = Date.now();
        
        if (now - timestamp < CACHE_DURATION) {
          // Use cached data if it's less than 5 minutes old
          console.log('Using cached global leaderboard data');
          setLeaderboardData(data);
          setActiveTournament(tournament);
          setWeekNumbers(weekNums);
          
          // Set user rank from cached data
          if (user) {
            const userEntry = data.find(entry => entry.id === user.uid);
            if (userEntry) {
              setUserRank(userEntry.rank);
            }
          }
          
          setLoading(false);
          return;
        }
      }
      
      // Get active tournament
      const tournament = await transferService.getActiveTournament();
      if (!tournament) {
        setError("No active tournament found.");
        setLoading(false);
        return;
      }
      
      setActiveTournament(tournament);
      
      // Get all user data
      const usersRef = collection(db, "users");
      const usersSnapshot = await getDocs(usersRef);
      
      const users = {};
      usersSnapshot.forEach(doc => {
        // Get user data
        const userData = doc.data();
        
        // Include all users who have a teamName (as they've registered)
        if (userData.teamName) {
          users[doc.id] = {
            id: doc.id,
            teamName: userData.teamName || "Unnamed Team",
            photoURL: userData.photoURL,
            weeks: {},
            weeklyTotalPoints: 0,
            referralPoints: userData.referralPoints || 0,
            totalPoints: 0  // We'll calculate this from weekly stats
          };
        }
      });
      
      // Define completed weeks to show
      const completedWindows = tournament.transferWindows
        .filter(window => window.status === "completed")
        .sort((a, b) => b.weekNumber - a.weekNumber)
        .slice(0, 5); // Get last 5 completed weeks
      
      setWeekNumbers(completedWindows.map(window => window.weekNumber));
      
      // Get weekly stats for all users
      const weeklyStatsRef = collection(db, "userWeeklyStats");
      
      // For each user, query their weekly stats for each week
      for (const userId in users) {
        let weeklyTotalPoints = 0;
        
        // Process each week separately
        for (const window of completedWindows) {
          const weekNum = window.weekNumber;
          
          // Get stats for this specific week using the week-specific document ID
          const weeklyStatRef = doc(db, "userWeeklyStats", `${userId}_${tournament.id}_${weekNum}`);
          const weeklyStatDoc = await getDoc(weeklyStatRef);
          
          if (weeklyStatDoc.exists()) {
            const weeklyPoints = weeklyStatDoc.data().points || 0;
            
            // Update the weeks object with this week's points
            users[userId].weeks[weekNum] = weeklyPoints;
            
            // Add to weekly total
            weeklyTotalPoints += weeklyPoints;
          } else {
            // If no data for this week, set to 0 or null
            users[userId].weeks[weekNum] = 0;
          }
        }
        
        // Update weekly total
        users[userId].weeklyTotalPoints = weeklyTotalPoints;
        
        // Calculate total points (weekly points + referral bonus)
        users[userId].totalPoints = weeklyTotalPoints + users[userId].referralPoints;
      }
      
      // Convert to array and sort by total points
      const leaderboardArray = Object.values(users)
        .sort((a, b) => b.totalPoints - a.totalPoints);
      
      // Assign ranks
      leaderboardArray.forEach((teamUser, index) => {
        teamUser.rank = index + 1;
        
        // If this is the current user, save their rank
        if (teamUser.id === user?.uid) {
          setUserRank(teamUser.rank);
        }
      });
      
      setLeaderboardData(leaderboardArray);
      
      // Cache the data
      localStorage.setItem('globalLeaderboardData', JSON.stringify({
        data: leaderboardArray,
        tournament,
        weekNums: completedWindows.map(window => window.weekNumber),
        timestamp: Date.now()
      }));
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching leaderboard data:", error);
      setError("Failed to load leaderboard data. Please try again later.");
      setLoading(false);
    }
  };

  // Force refresh function to bypass cache
  const handleRefreshData = () => {
    // Clear relevant cache items
    localStorage.removeItem('globalLeaderboardData');
    if (selectedLeague) {
      localStorage.removeItem(`leagueLeaderboard_${selectedLeague.id}`);
    }
    
    // Refetch data
    fetchLeaderboardData();
    if (selectedLeague) {
      handleLeagueSelection(selectedLeague.id);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading leaderboard data...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Leaderboard</h1>
      
      <div className={styles.leaderboardControls}>
        <div className={styles.leaderboardFilter}>
          <label htmlFor="league-filter">Filter by League:</label>
          <select
            id="league-filter"
            value={selectedLeague?.id || ''}
            onChange={(e) => handleLeagueSelection(e.target.value)}
            className={styles.leagueSelect}
          >
            <option value="">Global Leaderboard</option>
            {userLeagues.map(league => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </select>
        </div>
        
        <button 
          onClick={handleRefreshData} 
          className={styles.refreshButton}
        >
          Refresh Data
        </button>
      </div>
      
      <Card className={styles.leaderboardCard}>
        <CardHeader>
          <CardTitle>
            {selectedLeague ? `${selectedLeague.name} Leaderboard` : `${activeTournament?.name || "Tournament"} Leaderboard`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedLeague ? (
            loadingLeagueData ? (
              <div className={styles.loading}>Loading league data...</div>
            ) : sortedLeagueData.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.leaderboardTable}>
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('leagueRank')}>
                        Rank{getSortIndicator('leagueRank')}
                      </th>
                      <th onClick={() => handleSort('teamName')}>
                        Team{getSortIndicator('teamName')}
                      </th>
                      <th onClick={() => handleSort('totalPoints')}>
                        Points{getSortIndicator('totalPoints')}
                      </th>
                      <th onClick={() => handleSort('rank')}>
                        Overall Rank{getSortIndicator('rank')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeagueData.map((team) => (
                      <tr key={team.id} className={team.id === user?.uid ? styles.currentUser : ""}>
                        <td className={styles.rankColumn}>
                          {team.leagueRank <= 3 ? (
                            <span className={`${styles.topRank} ${styles[`rank${team.leagueRank}`]}`}>
                              {team.leagueRank}
                            </span>
                          ) : (
                            team.leagueRank
                          )}
                        </td>
                        <td className={styles.teamColumn}>
                          <div className={styles.teamInfo}>
                            {team.photoURL ? (
                              <img 
                                src={team.photoURL} 
                                alt="User" 
                                className={styles.userPhoto} 
                              />
                            ) : (
                              <div className={styles.userPhotoPlaceholder}>
                                {team.teamName.charAt(0)}
                              </div>
                            )}
                            <span>{team.teamName}</span>
                            {team.id === user?.uid && <span className={styles.youBadge}>You</span>}
                          </div>
                        </td>
                        <td className={styles.totalColumn}>
                          {team.totalPoints || 0}
                        </td>
                        <td>
                          {team.rank || 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.noData}>
                <p>No leaderboard data available for this league yet.</p>
              </div>
            )
          ) : (
            // Original global leaderboard content
            sortedLeaderboardData.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.leaderboardTable}>
                  <thead>
                    <tr>
                      <th onClick={() => handleSort('rank')}>
                        Rank{getSortIndicator('rank')}
                      </th>
                      <th onClick={() => handleSort('teamName')}>
                        Team{getSortIndicator('teamName')}
                      </th>
                      {weekNumbers.map(weekNum => (
                        <th key={weekNum} onClick={() => handleSort(`week_${weekNum}`)}>
                          Week {weekNum}{getSortIndicator(`week_${weekNum}`)}
                        </th>
                      ))}
                      <th onClick={() => handleSort('referralPoints')}>
                        Bonus Points{getSortIndicator('referralPoints')}
                      </th>
                      <th onClick={() => handleSort('totalPoints')}>
                        Total Points{getSortIndicator('totalPoints')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeaderboardData.map((team) => (
                      <tr key={team.id} className={team.id === user?.uid ? styles.currentUser : ""}>
                        <td className={styles.rankColumn}>
                          {team.rank <= 3 ? (
                            <span className={`${styles.topRank} ${styles[`rank${team.rank}`]}`}>
                              {team.rank}
                            </span>
                          ) : (
                            team.rank
                          )}
                        </td>
                        <td className={styles.teamColumn}>
                          <div className={styles.teamInfo}>
                            {team.photoURL ? (
                              <img 
                                src={team.photoURL} 
                                alt="User" 
                                className={styles.userPhoto} 
                              />
                            ) : (
                              <div className={styles.userPhotoPlaceholder}>
                                {team.teamName.charAt(0)}
                              </div>
                            )}
                            <span>{team.teamName}</span>
                            {team.id === user?.uid && <span className={styles.youBadge}>You</span>}
                          </div>
                        </td>
                        {weekNumbers.map(weekNum => (
                          <td key={weekNum} className={styles.pointsColumn}>
                            {team.weeks[weekNum] || '-'}
                          </td>
                        ))}
                        <td className={styles.bonusColumn}>
                          {team.referralPoints || 0}
                        </td>
                        <td className={styles.totalColumn}>
                          {team.totalPoints || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.noData}>
                <p>No leaderboard data available yet.</p>
                <p>Teams will appear here once points are scored.</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
      
      {user && userRank && (
        <div className={styles.userRankCard}>
          <p>Your current rank: <span className={styles.rankHighlight}>{userRank}</span> out of {leaderboardData.length} teams</p>
        </div>
      )}
      
      <div className={styles.infoCard}>
        <h3>How Points Are Calculated</h3>
        <p>
          Points are calculated based on your team's performance in each match.
          Captain gets 2x points and Vice-Captain gets 1.5x points.
        </p>
        <p>
          Bonus points are awarded for referrals (25 points per successful referral, up to 3 referrals).
        </p>
        <p>
          The leaderboard shows the last 5 completed weeks of the tournament.
          Total points determine your overall rank (Weekly points + Bonus points).
        </p>
      </div>
    </div>
  );
};

export default LeaderboardPage;
