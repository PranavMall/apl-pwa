"use client";

import React, { useState } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { auth, db } from "../../firebase"; // Ensure the correct path to firebase.js
import styles from "./page.module.css";

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("batsmen");

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

  const matches = [
    { team1: "Team A", team2: "Team B", time: "10:00 AM" },
    { team1: "Team C", team2: "Team D", time: "2:00 PM" },
  ];

  return (
    <div className={styles.dashboard}>
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

      {/* Leaderboard Section */}
      <section className={styles.leaderboard}>
        <h2>Leaderboard Highlights</h2>
        <ul className={styles.leaderboardList}>
          <li>1. User1 - 2500 pts</li>
          <li>2. User2 - 2400 pts</li>
          <li>3. User3 - 2300 pts</li>
        </ul>
      </section>

      {/* Player Performance Section */}
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

      {/* Upcoming Matches Section */}
      <section className={styles.upcomingMatches}>
        <h2>Upcoming Matches</h2>
        <div className={styles.matchCards}>
          {matches.map((match, index) => (
            <div key={index} className={styles.matchCard}>
              <p>
                {match.team1} vs {match.team2}
              </p>
              <p>{match.time}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}