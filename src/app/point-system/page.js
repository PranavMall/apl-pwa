"use client";

import React from 'react';
import styles from "./page.module.css";

const categories = [
  {
    title: "Batsman",
    icon: "🏏",
    image: "https://png.pngtree.com/png-vector/20240827/ourmid/pngtree-cricket-player-shot-icon-png-image_13633784.png",
    points: [
      { action: "Each Run", value: "1 point" },
      { action: "Boundary (4 Runs)", value: "1 point" },
      { action: "Six (6 Runs)", value: "2 points" },
      { action: "30 Runs", value: "25 points" },
      { action: "Half-Century (50 Runs)", value: "50 points" },
      { action: "Century (100 Runs)", value: "100 points" },
      { action: "Duck Out", value: "-5 points" },
    ],
    accent: "#3498db", // Blue
  },
  {
    title: "Bowler",
    icon: "🎯",
    image: "https://image.shutterstock.com/image-vector/bowler-illustration-cricket-right-handed-260nw-2066571398.jpg",
    points: [
      { action: "1 or 2 Wickets", value: "25 points" },
      { action: "3 Wickets", value: "50 points" },
      { action: "4 Wickets", value: "100 points" },
      { action: "5 Wickets", value: "150 points" },
      { action: "Maiden Over", value: "8 points" },
      { action: "Economy Rate < 6", value: "4 points" },
    ],
    accent: "#e74c3c", // Red
  },
  {
    title: "Fielder",
    icon: "🧤",
    image: "https://i.pinimg.com/736x/d0/1d/f0/d01df0cff7c62e9c323c269e45ea8716.jpg",
    points: [
      { action: "Catch", value: "8 points" },
      { action: "Stumping", value: "12 points" },
      { action: "Direct Throw", value: "12 points" },
      { action: "Run Out", value: "8 points" },
      { action: "Duck Out", value: "-5 points" },
    ],
    accent: "#2ecc71", // Green
  },
  {
    title: "Player",
    icon: "👑",
    image: "https://cdn3d.iconscout.com/3d/premium/thumb/cricket-captain-3d-icon-download-in-png-blend-fbx-gltf-file-formats--boy-sports-man-pack-stadiums-icons-8083961.png",
    points: [
      { action: "Starting XI", value: "5 points" },
      { action: "Refer a Friend", value: "25 points (Max 3 friends)" },
      { action: "Late Registrations", value: "-25 points per match" },
      { action: "Captain", value: "2x multiplier" },
      { action: "Vice Captain", value: "1.5x multiplier" },
      { action: "Weekly Top of the Table Team", value: "25 points" },
      { action: "Purple Cap for the Week", value: "50 points" },
      { action: "Orange Cap for the Week", value: "50 points" },
    ],
    accent: "#f39c12", // Yellow
  },
];

export default function PointSystemPage() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>Fantasy Cricket Point System</h1>
        <p className={styles.pageSubtitle}>
          Understanding how points are calculated for your fantasy cricket team
        </p>
      </div>

      <div className={styles.categories}>
        {categories.map((category, index) => (
          <div key={index} className={styles.categoryCard} style={{ '--accent-color': category.accent }}>
            <div className={styles.categoryHeader}>
              <div className={styles.iconContainer} style={{ backgroundColor: category.accent }}>
                <span className={styles.icon}>{category.icon}</span>
              </div>
              <h2 className={styles.categoryTitle}>{category.title}</h2>
            </div>
            
            {category.image && (
              <div className={styles.imageContainer}>
                <img src={category.image} alt={category.title} className={styles.categoryImage} />
              </div>
            )}
            
            <div className={styles.pointsContainer}>
              <ul className={styles.pointsList}>
                {category.points.map((point, pointIndex) => (
                  <li key={pointIndex} className={styles.pointItem}>
                    <span className={styles.pointAction}>{point.action}</span>
                    <span className={styles.pointValue}>{point.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.additionalInfo}>
        <div className={styles.infoBox}>
          <h3>How Points Work</h3>
          <p>
            Points are calculated based on real match performances and updated live during matches.
            Your captain earns 2x points, and your vice-captain earns 1.5x points. Choose wisely!
          </p>
        </div>
        <div className={styles.infoBox}>
          <h3>Weekly Transfers</h3>
          <p>
            You can make team changes during designated transfer windows. 
            Strategic transfers can significantly boost your points total.
          </p>
        </div>
      </div>
    </div>
  );
}
