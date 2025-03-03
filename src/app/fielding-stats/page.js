"use client";

import React, { useState, useEffect } from "react";
import { auth } from "../../firebase";
import { getPlayersWithPoints } from "./api";
import FieldingForm from "./Form";
import withAuth from "@/app/components/withAuth";
import styles from "./page.module.css";

const FieldingStatsPage = () => {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        setLoading(true);
        const playerData = await getPlayersWithPoints();
        setPlayers(playerData);
      } catch (error) {
        console.error("Error fetching players:", error);
        setError("Failed to load players");
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, []);

  const handleSubmitSuccess = () => {
    setSuccess("Fielding stats updated successfully!");
    setTimeout(() => setSuccess(null), 3000);
  };

  if (loading) return <div className={styles.loading}>Loading players...</div>;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Fielding Stats Management</h1>
      {success && <div className={styles.successAlert}>{success}</div>}
      <FieldingForm players={players} onSuccess={handleSubmitSuccess} />
    </div>
  );
};

export default withAuth(FieldingStatsPage);
