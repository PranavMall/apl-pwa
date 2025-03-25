"use client";

import React, { useState, useEffect } from "react";
import { collection, query, getDocs, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "@/app/context/authContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import styles from "./leaderboard.module.css";
import { transferService } from "../services/transferService";
import { LeagueService } from "../services/leagueService";

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

  useEffect(() => {
    fetchLeaderboardData();
  }, []);

  useEffect(() => {
    if (user) {
      fetchUserLeagues();
    }
  }, [user]);

  const fetchUserLeagues = async () => {
    try {
      const leagues = await LeagueService.getUserLeagues(user.uid);
      setUserLeagues(leagues);
    } catch (error) {
      console.error('Error fetching user leagues:', error);
    }
  };

  const handleLeagueSelection = async (leagueId) => {
    if (!leagueId) {
      setSelectedLeague(null);
      return;
    }
    
    try {
      setLoadingLeagueData(true);
      const selectedLeagueObj = userLeagues.find(league => league.id === leagueId);
      setSelectedLeague(selectedLeagueObj);
      
      // Fetch league leaderboard data
      const leaderboardData = await LeagueService.getLeagueLeaderboard(leagueId);
      setLeagueLeaderboardData(leaderboardData);
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
    setLoading(false);
  } catch (error) {
    console.error("Error fetching leaderboard data:", error);
    setError("Failed to load leaderboard data. Please try again later.");
    setLoading(false);
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
            ) : leagueLeaderboardData.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.leaderboardTable}>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      <th>Points</th>
                      <th>Overall Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leagueLeaderboardData.map((team) => (
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
            leaderboardData.length > 0 ? (
              <div className={styles.tableWrapper}>
                <table className={styles.leaderboardTable}>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Team</th>
                      {weekNumbers.map(weekNum => (
                        <th key={weekNum}>Week {weekNum}</th>
                      ))}
                      <th>Bonus Points</th>
                      <th>Total Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData.map((team) => (
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
