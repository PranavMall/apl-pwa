"use client";

import React, { useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { cricketService } from "../services/cricketService";
import styles from "./page.module.css";
import withAuth from "@/app/components/withAuth";

const DashboardPage = () => {
  const [activeTab, setActiveTab] = useState("batsmen");
  const [userDetails, setUserDetails] = useState(null);
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const user = auth.currentUser;
        if (!user) {
          throw new Error('Authentication required');
        }

        // Fetch user details
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setUserDetails(userDoc.data());
        }

        // Use CricketService correctly
        const matchData = await cricketService.getMatchesFromFirebase();
        console.log("Fetched match data:", matchData);
        setMatches(matchData || []);
        
        if (matchData?.length > 0) {
          setSelectedMatch(matchData[0]);
        }

      } catch (error) {
        console.error("Error fetching data:", error);
        setError(error.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const renderMatchCard = (match) => {
    if (!match?.matchId) return null;
    
    return (
      <div 
        key={match.matchId} 
        className={`${styles.matchCard} ${selectedMatch?.matchId === match.matchId ? styles.selectedMatch : ''}`}
        onClick={() => setSelectedMatch(match)}
      >
        <div className={styles.matchTeams}>
          <p>{match.matchInfo?.team1?.teamName || 'Team 1'} vs {match.matchInfo?.team2?.teamName || 'Team 2'}</p>
        </div>
        {match.scorecard && (
          <div className={styles.matchScore}>
            <p>{match.scorecard?.team1?.score || '0/0'}</p>
            <p>{match.scorecard?.team2?.score || '0/0'}</p>
          </div>
        )}
        <div className={styles.matchStatus}>
          <p>{match.matchInfo?.status || 'Status unavailable'}</p>
        </div>
      </div>
    );
  };

  const renderPlayerStats = () => {
    if (!selectedMatch?.scorecard) {
      return <div className={styles.noData}>No scorecard data available</div>;
    }

    const scorecard = selectedMatch.scorecard;
    let players = [];

    try {
      if (activeTab === "batsmen") {
        const team1Batsmen = Array.isArray(scorecard.team1?.batsmen) ? scorecard.team1.batsmen : [];
        const team2Batsmen = Array.isArray(scorecard.team2?.batsmen) ? scorecard.team2.batsmen : [];
        players = [...team1Batsmen, ...team2Batsmen];
      } else if (activeTab === "bowlers") {
        const team1Bowlers = Array.isArray(scorecard.team1?.bowlers) ? scorecard.team1.bowlers : [];
        const team2Bowlers = Array.isArray(scorecard.team2?.bowlers) ? scorecard.team2.bowlers : [];
        players = [...team1Bowlers, ...team2Bowlers];
      } else if (activeTab === "allRounders") {
        const team1Batsmen = Array.isArray(scorecard.team1?.batsmen) ? scorecard.team1.batsmen : [];
        const team2Batsmen = Array.isArray(scorecard.team2?.batsmen) ? scorecard.team2.batsmen : [];
        const allBatsmen = [...team1Batsmen, ...team2Batsmen];
        
        const team1Bowlers = Array.isArray(scorecard.team1?.bowlers) ? scorecard.team1.bowlers : [];
        const team2Bowlers = Array.isArray(scorecard.team2?.bowlers) ? scorecard.team2.bowlers : [];
        const allBowlers = [...team1Bowlers, ...team2Bowlers];
        
        players = allBatsmen.filter(batsman => 
          allBowlers.some(bowler => bowler.name === batsman.name)
        );
      }

      return players.map((player, index) => (
        <div key={`${player.name}-${index}`} className={styles.playerRow}>
          <p>{player.name || 'Unknown Player'}</p>
          {activeTab === "batsmen" && (
            <>
              <p>Runs: {player.runs ?? 0}</p>
              <p>Balls: {player.balls ?? 0}</p>
              <p>SR: {player.strikeRate ?? 0}</p>
            </>
          )}
          {activeTab === "bowlers" && (
            <>
              <p>Overs: {player.overs ?? 0}</p>
              <p>Wickets: {player.wickets ?? 0}</p>
              <p>Economy: {player.economy ?? 0}</p>
            </>
          )}
          {activeTab === "allRounders" && (
            <>
              <p>Runs: {player.runs ?? 0}</p>
              <p>Wickets: {player.wickets ?? 0}</p>
            </>
          )}
        </div>
      ));
    } catch (error) {
      console.error("Error rendering player stats:", error);
      return <div className={styles.error}>Error displaying player statistics</div>;
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.dashboard}>
      <section className={styles.profileSection}>
        {userDetails && (
          <div className={styles.profile}>
            <img
              src={userDetails.photoURL || "/default-avatar.png"}
              alt="Profile"
              className={styles.profileImage}
            />
            <p>{userDetails.name || 'Unknown User'}</p>
          </div>
        )}
      </section>

      <section className={styles.liveMatches}>
        <h2>Live Big Bash Matches</h2>
        <div className={styles.matchCards}>
          {matches.length > 0 ? matches.map(renderMatchCard) : (
            <div className={styles.noMatches}>No live matches available</div>
          )}
        </div>
      </section>

      <section className={styles.playerPerformance}>
        <h2>Player Performance</h2>
        <div className={styles.tabs}>
          {["batsmen", "bowlers", "allRounders"].map((category) => (
            <button
              key={category}
              className={`${styles.tab} ${activeTab === category ? styles.activeTab : ""}`}
              onClick={() => setActiveTab(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>
          {renderPlayerStats()}
        </div>
      </section>

      <section className={styles.leaderboard}>
        <h2>Leaderboard Highlights</h2>
        <ul className={styles.leaderboardList}>
          <li>1. User1 - 2500 pts</li>
          <li>2. User2 - 2400 pts</li>
          <li>3. User3 - 2300 pts</li>
        </ul>
      </section>
    </div>
  );
};

export default withAuth(DashboardPage);
