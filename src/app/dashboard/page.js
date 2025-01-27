"use client";

import React, { useState, useEffect } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase";
import { CricketService } from "../services/cricketService";
import styles from "./page.module.css";
import withAuth from "@/app/components/withAuth";

const DashboardPage = () => {
  const [activeTab, setActiveTab] = useState("batsmen");
  const [userDetails, setUserDetails] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  const players = {
    batsmen: [
      { name: "Player 1", runs: 450, points: 120 },
      { name: "Player 2", runs: 380, points: 100 },
    ],
    bowlers: [
      { name: "Player 3", wickets: 25, points: 130 },
      { name: "Player 4", wickets: 20, points: 110 },
    ],
    allRounders: [
      { name: "Player 5", runs: 200, wickets: 10, points: 140 },
    ],
    wicketKeepers: [{ name: "Player 6", runs: 300, points: 90 }],
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch user details
        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setUserDetails(userDoc.data());
          }
        }

        // Fetch and sync cricket matches
        await CricketService.syncMatchData();
        const matchData = await CricketService.getMatchesFromFirebase();
        setMatches(matchData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Set up real-time updates for matches
    const unsubscribe = CricketService.subscribeToMatches((updatedMatches) => {
      setMatches(updatedMatches);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const renderMatchCard = (match) => (
    <div key={match.matchId} className={styles.matchCard}>
      <div className={styles.matchTeams}>
        <p>{match.matchInfo?.team1?.teamName} vs {match.matchInfo?.team2?.teamName}</p>
      </div>
      {match.scorecard && (
        <div className={styles.matchScore}>
          <p>{match.scorecard.team1Score}</p>
          <p>{match.scorecard.team2Score}</p>
        </div>
      )}
      <div className={styles.matchStatus}>
        <p>{match.matchInfo?.status}</p>
      </div>
    </div>
  );

  if (loading) {
    return <div className={styles.loading}>Loading dashboard...</div>;
  }

  return (
    <div className={styles.dashboard}>
      {/* Profile Section */}
      <section className={styles.profileSection}>
        {userDetails && (
          <div className={styles.profile}>
            <img
              src={userDetails.photoURL || "/default-avatar.png"}
              alt="Profile"
              className={styles.profileImage}
            />
            <p>{userDetails.name}</p>
          </div>
        )}
      </section>

      {/* Live Matches Section */}
      <section className={styles.liveMatches}>
        <h2>Live Big Bash Matches</h2>
        <div className={styles.matchCards}>
          {matches.map(renderMatchCard)}
        </div>
      </section>

      {/* Your Team Section */}
      <section className={styles.yourTeam}>
        <h2>Your Team</h2>
        <div className={styles.teamCards}>
          {players.batsmen.map((player, index) => (
            <div key={index} className={styles.card}>
              <img
                src={`/images/player${index + 1}.png`}
                alt={player.name}
                className={styles.playerImage}
              />
              <div className={styles.cardDetails}>
                <p className={styles.playerName}>{player.name}</p>
                <p className={styles.playerPoints}>{player.points} pts</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Rest of your existing sections remain the same */}
      <section className={styles.leaderboard}>
        <h2>Leaderboard Highlights</h2>
        <ul className={styles.leaderboardList}>
          <li>1. User1 - 2500 pts</li>
          <li>2. User2 - 2400 pts</li>
          <li>3. User3 - 2300 pts</li>
        </ul>
      </section>

      <section className={styles.playerPerformance}>
        <h2>Player Performance</h2>
        <div className={styles.tabs}>
          {Object.keys(players).map((category) => (
            <button
              key={category}
              className={`${styles.tab} ${
                activeTab === category ? styles.activeTab : ""
              }`}
              onClick={() => setActiveTab(category)}
            >
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.tabContent}>
          {players[activeTab].map((player, index) => (
            <div key={index} className={styles.playerRow}>
              <p>{player.name}</p>
              {activeTab === "batsmen" && <p>Runs: {player.runs}</p>}
              {activeTab === "bowlers" && <p>Wickets: {player.wickets}</p>}
              {activeTab === "allRounders" && (
                <>
                  <p>Runs: {player.runs}</p>
                  <p>Wickets: {player.wickets}</p>
                </>
              )}
              <p>Points: {player.points}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default withAuth(DashboardPage);
