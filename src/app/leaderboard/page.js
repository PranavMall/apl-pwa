"use client";

import React, { useState, useEffect } from "react";
import { collection, query, getDocs, where, orderBy } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "@/app/context/authContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import styles from "./leaderboard.module.css";
import { transferService } from "../services/transferService";

const LeaderboardPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [weekNumbers, setWeekNumbers] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);
  const [userRank, setUserRank] = useState(null);

  useEffect(() => {
    fetchLeaderboardData();
  }, []);

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
        users[doc.id] = {
          id: doc.id,
          teamName: doc.data().teamName || "Unnamed Team",
          photoURL: doc.data().photoURL,
          weeks: {},
          totalPoints: 0
        };
      });
      
      // Get completed transfer windows to determine which weeks to show
      const windows = tournament.transferWindows || [];
      const completedWindows = windows
        .filter(window => window.status === "completed")
        .sort((a, b) => b.weekNumber - a.weekNumber)
        .slice(0, 5); // Get last 5 completed weeks
      
      setWeekNumbers(completedWindows.map(window => window.weekNumber));
      
      // Get weekly stats for all users
      const weeklyStatsRef = collection(db, "userWeeklyStats");
      const q = query(
        weeklyStatsRef,
        where("tournamentId", "==", tournament.id)
      );
      
      const statsSnapshot = await getDocs(q);
      
      // Process stats for each user
      statsSnapshot.forEach(doc => {
        const statsData = doc.data();
        const userId = statsData.userId;
        const weekNumber = statsData.weekNumber;
        const points = statsData.points || 0;
        
        if (users[userId]) {
          // Add week points
          users[userId].weeks[weekNumber] = points;
          
          // Update total points
          users[userId].totalPoints += points;
        }
      });
      
      // Convert to array and sort by total points
      const leaderboardArray = Object.values(users)
        .filter(user => user.totalPoints > 0) // Only show users with points
        .sort((a, b) => b.totalPoints - a.totalPoints);
      
      // Assign ranks
      leaderboardArray.forEach((user, index) => {
        user.rank = index + 1;
        
        // If this is the current user, save their rank
        if (user.id === (user?.id)) {
          setUserRank(user.rank);
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
      
      <Card className={styles.leaderboardCard}>
        <CardHeader>
          <CardTitle>{activeTournament?.name || "Tournament"} Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboardData.length > 0 ? (
            <div className={styles.tableWrapper}>
              <table className={styles.leaderboardTable}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    {weekNumbers.map(weekNum => (
                      <th key={weekNum}>Week {weekNum}</th>
                    ))}
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
                      <td className={styles.totalColumn}>
                        {team.totalPoints}
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
          The leaderboard shows the last 5 completed weeks of the tournament.
          Total points determine your overall rank.
        </p>
      </div>
    </div>
  );
};

export default LeaderboardPage;
