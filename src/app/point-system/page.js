"use client";

import styles from "./page.module.css";

const categories = [
  {
    title: "Batsman",
    image: "https://png.pngtree.com/png-vector/20240827/ourmid/pngtree-cricket-player-shot-icon-png-image_13633784.png", // Path to the batsman image
    points: [
      "Each Run: 1 point",
      "4 Runs: 1 point",
      "6 Runs: 2 points",
      "30 Runs: 25 points",
      "50 Runs: 50 points",
      "100 Runs: 100 points",
    ],
  },
  {
    title: "Bowler",
    image: "https://image.shutterstock.com/image-vector/bowler-illustration-cricket-right-handed-260nw-2066571398.jpg", // Path to the bowler image
    points: [
      "1 or 2 Wickets: 25 points",
      "3 Wickets: 50 points",
      "4 Wickets: 100 points",
      "5 Wickets: 150 points",
      "Maiden Over: 8 points",
    ],
  },
  {
    title: "Fielder",
    image: "https://i.pinimg.com/736x/d0/1d/f0/d01df0cff7c62e9c323c269e45ea8716.jpg", // Path to the fielder image
    points: [
      "Catch: 8 points",
      "Stumping: 12 points",
      "Direct Throw: 12 points",
      "Run Out: 8 points",
      "Duck Out: -5 points",
    ],
  },
  {
    title: "Player",
    image: "https://cdn3d.iconscout.com/3d/premium/thumb/cricket-captain-3d-icon-download-in-png-blend-fbx-gltf-file-formats--boy-sports-man-pack-stadiums-icons-8083961.png", // Path to the player image
    points: [
      "Starting XI: 5 points",
      "Refer a Friend: 25 points (Max 3 friends)",
      "Late Registrations: -25 points per match",
      "Captain: 2x multiplier",
      "Vice Captain: 1.5x multiplier",
      "Weekly Top of the Table Team: 25 points",
      "Purple Cap for the Week: 50 points",
      "Orange Cap for the Week: 50 points",
    ],
  },
];

export default function PointSystemPage() {
  return (
    <div className={styles.container}>
      {categories.map((category, index) => (
        <div key={index} className={styles.card}>
          <h2>{category.title}</h2>
          <img src={category.image} alt={category.title} className={styles.image} />
          <ul>
            {category.points.map((point, idx) => (
              <li key={idx}>{point}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
