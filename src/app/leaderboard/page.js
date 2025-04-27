"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { collection, query, getDocs, where, orderBy, doc, getDoc, limit } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "@/app/context/authContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import styles from "./leaderboard.module.css";
import { transferService } from "../services/transferService";
import { LeagueService } from "../services/leagueService";

// Constants defined outside the component to avoid recreation on each render
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const GLOBAL_LEADERBOARD_CACHE_KEY = 'globalLeaderboardData';
const LEAGUE_LEADERBOARD_CACHE_PREFIX = 'leagueLeaderboard_';
const SELECTED_LEAGUE_CACHE_KEY = 'selectedLeagueId';

// Helper function to safely access localStorage (only in browser)
const safeLocalStorage = {
  getItem: (key) => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  },
  setItem: (key, value) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, value);
    }
  },
  removeItem: (key) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key);
    }
  }
};

// Create a custom hook for managing cached data
const useCachedData = (cacheKey, fetchFunc, dependencies = []) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Check cache if not forcing refresh and we have a cacheKey
      if (!forceRefresh && cacheKey) {
        const cachedData = safeLocalStorage.getItem(cacheKey);
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            const now = Date.now();
            
            if (now - parsed.timestamp < CACHE_DURATION) {
              setData(parsed);
              setLoading(false);
              return parsed;
            }
          } catch (parseError) {
            console.error(`Error parsing cached data for ${cacheKey}:`, parseError);
            // Continue to fetch fresh data if parse error
          }
        }
      }
      
      // Fetch fresh data
      const result = await fetchFunc();
      
      // Cache the result if we have data and a cacheKey
      if (result && cacheKey) {
        const dataToCache = { 
          ...result, 
          timestamp: Date.now() 
        };
        safeLocalStorage.setItem(cacheKey, JSON.stringify(dataToCache));
      }
      
      setData(result);
      return result;
    } catch (err) {
      console.error(`Error fetching data for ${cacheKey}:`, err);
      setError(`Failed to load data. ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [cacheKey, fetchFunc]);

  // Fetch data on initial load or when dependencies change
  useEffect(() => {
    fetchData();
  }, dependencies);

  return { data, loading, error, refetch: () => fetchData(true) };
};

const LeaderboardPage = () => {
  const { user } = useAuth();
  const [activeTournament, setActiveTournament] = useState(null);
  const [weekNumbers, setWeekNumbers] = useState([]);
  const [userRank, setUserRank] = useState(null);
  const [userLeagues, setUserLeagues] = useState([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  
  // Initialize selectedLeagueId from localStorage (client-side only)
  useEffect(() => {
    const savedLeagueId = safeLocalStorage.getItem(SELECTED_LEAGUE_CACHE_KEY);
    if (savedLeagueId) {
      setSelectedLeagueId(savedLeagueId);
    }
  }, []);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: 'rank',
    direction: 'asc'
  });
  
  // Fetch global leaderboard data
  const fetchGlobalLeaderboard = useCallback(async () => {
    // Get active tournament
    const tournament = await transferService.getActiveTournament();
    if (!tournament) {
      throw new Error("No active tournament found.");
    }
    
    setActiveTournament(tournament);
    
    // Define completed weeks to show
    const completedWindows = tournament.transferWindows
      .filter(window => window.status === "completed")
      .sort((a, b) => b.weekNumber - a.weekNumber)
      .slice(0, 5); // Get last 5 completed weeks
    
    const weekNums = completedWindows.map(window => window.weekNumber);
    setWeekNumbers(weekNums);
    
    // Perform a single batch query for all users with the teamName field
    const usersRef = collection(db, "users");
    const usersQuery = query(usersRef, where("teamName", "!=", null));
    const usersSnapshot = await getDocs(usersQuery);
    
    // Create a map of userId to user data for faster lookups
    const usersMap = {};
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.teamName) {
        usersMap[doc.id] = {
          id: doc.id,
          teamName: userData.teamName || "Unnamed Team",
          photoURL: userData.photoURL,
          weeks: {},
          weeklyTotalPoints: 0,
          referralPoints: userData.referralPoints || 0,
          totalPoints: userData.totalPoints || 0,
          rank: userData.rank || 0
        };
      }
    });
    
    // Get ALL weekly stats from the tournament, not just last 5 weeks
    const weeklyStatsRef = collection(db, "userWeeklyStats");
    const weeklyStatsQuery = query(
      weeklyStatsRef,
      where("tournamentId", "==", tournament.id)
    );
    
    const weeklyStatsSnapshot = await getDocs(weeklyStatsQuery);
    const allWeeklyStats = [];
    
    weeklyStatsSnapshot.forEach(doc => {
      allWeeklyStats.push(doc.data());
    });
    
    // Process weekly stats to calculate points for all weeks AND last 5 weeks
    for (const userId in usersMap) {
      // Filter stats for this user
      const userStats = allWeeklyStats.filter(stat => stat.userId === userId);
      
      // Calculate total points from ALL weeks (for actual total)
      const totalFromAllWeeks = userStats.reduce((sum, stat) => sum + (stat.points || 0), 0);
      usersMap[userId].weeklyTotalPoints = totalFromAllWeeks;
      
      // Store points for the 5 display weeks separately
      weekNums.forEach(weekNum => {
        const weekStat = userStats.find(stat => stat.weekNumber === weekNum);
        if (weekStat) {
          usersMap[userId].weeks[weekNum] = weekStat.points || 0;
        } else {
          usersMap[userId].weeks[weekNum] = 0;
        }
      });
    }
    
    // Convert to array and calculate totals
    const leaderboardArray = Object.values(usersMap);
    
    // Update total points for each user (ALL weeks + referral points)
    leaderboardArray.forEach(user => {
      user.totalPoints = user.weeklyTotalPoints + (user.referralPoints || 0);
    });
    
    // Sort by total points
    leaderboardArray.sort((a, b) => b.totalPoints - a.totalPoints);
    
    // Assign ranks
    leaderboardArray.forEach((teamUser, index) => {
      teamUser.rank = index + 1;
      
      // If this is the current user, save their rank
      if (user && teamUser.id === user.uid) {
        setUserRank(teamUser.rank);
      }
    });
    
    return {
      data: leaderboardArray,
      tournament,
      weekNums
    };
  }, [user]);
  
  const { 
    data: globalLeaderboardData, 
    loading: globalLoading, 
    error: globalError,
    refetch: refetchGlobal 
  } = useCachedData(
    GLOBAL_LEADERBOARD_CACHE_KEY, 
    fetchGlobalLeaderboard,
    [user?.uid]
  );
  
  // Fetch user leagues
  useEffect(() => {
    const fetchUserLeagues = async () => {
      if (!user) return;
      
      try {
        const leagues = await LeagueService.getUserLeagues(user.uid);
        setUserLeagues(leagues);
        
        // Check if cached selected league still exists in user leagues
        if (selectedLeagueId) {
          const leagueExists = leagues.some(l => l.id === selectedLeagueId);
          if (!leagueExists) {
            setSelectedLeagueId('');
            localStorage.removeItem(SELECTED_LEAGUE_CACHE_KEY);
          }
        }
      } catch (error) {
        console.error('Error fetching user leagues:', error);
      }
    };
    
    fetchUserLeagues();
  }, [user]);
  
  // Fetch league leaderboard data when a league is selected
  const fetchLeagueLeaderboard = useCallback(async () => {
    if (!selectedLeagueId) return null;
    
    const leaderboardData = await LeagueService.getLeagueLeaderboard(selectedLeagueId);
    return { data: leaderboardData };
  }, [selectedLeagueId]);
  
  const { 
    data: leagueData, 
    loading: leagueLoading, 
    error: leagueError,
    refetch: refetchLeague 
  } = useCachedData(
    selectedLeagueId ? `${LEAGUE_LEADERBOARD_CACHE_PREFIX}${selectedLeagueId}` : null,
    fetchLeagueLeaderboard,
    [selectedLeagueId]
  );
  
  // Handle league selection
  const handleLeagueSelection = useCallback((leagueId) => {
    setSelectedLeagueId(leagueId);
    
    if (leagueId) {
      safeLocalStorage.setItem(SELECTED_LEAGUE_CACHE_KEY, leagueId);
    } else {
      safeLocalStorage.removeItem(SELECTED_LEAGUE_CACHE_KEY);
    }
  }, []);
  
  // Force refresh function to bypass cache
  const handleRefreshData = () => {
    if (selectedLeagueId) {
      refetchLeague();
    } else {
      refetchGlobal();
    }
  };
  
  // Sort function for table data
  const handleSort = useCallback((key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);
  
  // Get sorted data based on current config - memoized to prevent unnecessary recalculations
  const sortedData = useMemo(() => {
    // Determine which data to sort
    const dataToSort = selectedLeagueId && leagueData?.data 
      ? [...leagueData.data] 
      : globalLeaderboardData?.data ? [...globalLeaderboardData.data] : [];
    
    if (!dataToSort.length || !sortConfig.key) return dataToSort;
    
    return dataToSort.sort((a, b) => {
      // Handle nested week points
      if (sortConfig.key.startsWith('week_')) {
        const weekNum = parseInt(sortConfig.key.split('_')[1]);
        const aValue = a.weeks ? (a.weeks[weekNum] || 0) : 0;
        const bValue = b.weeks ? (b.weeks[weekNum] || 0) : 0;
        
        return sortConfig.direction === 'asc' 
          ? aValue - bValue 
          : bValue - aValue;
      }
      
      // Handle other columns
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, [
    sortConfig, 
    selectedLeagueId, 
    leagueData?.data, 
    globalLeaderboardData?.data
  ]);
  
  // Helper for rendering sort indicator
  const getSortIndicator = useCallback((key) => {
    return sortConfig.key === key 
      ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') 
      : '';
  }, [sortConfig]);
  
  // Determine loading and error states
  const isLoading = selectedLeagueId ? leagueLoading : globalLoading;
  const error = selectedLeagueId ? leagueError : globalError;
  
  // Get selected league object
  const selectedLeague = useMemo(() => {
    if (!selectedLeagueId) return null;
    return userLeagues.find(league => league.id === selectedLeagueId) || null;
  }, [selectedLeagueId, userLeagues]);

  if (isLoading) {
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
            value={selectedLeagueId}
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
            {selectedLeague 
              ? `${selectedLeague.name} Leaderboard` 
              : `${activeTournament?.name || "Tournament"} Leaderboard`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {selectedLeagueId ? (
            // League leaderboard
            sortedData.length > 0 ? (
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
                    {sortedData.map((team) => (
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
            // Global leaderboard
            sortedData.length > 0 ? (
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
                    {sortedData.map((team) => (
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
          <p>Your current rank: <span className={styles.rankHighlight}>{userRank}</span> out of {sortedData.length} teams</p>
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
          The leaderboard shows the last {weekNumbers.length} completed weeks of the tournament.
          Total points include all weeks' performance plus any bonus points earned.
        </p>
      </div>
    </div>
  );
};

export default LeaderboardPage;
