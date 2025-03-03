"use client";

import React, { useState, useEffect } from "react";
import { getPlayerMatches, updateFieldingStats } from "./api";
import styles from "./page.module.css";

const FieldingForm = ({ players, onSuccess }) => {
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [selectedMatch, setSelectedMatch] = useState("");
  const [playerMatches, setPlayerMatches] = useState([]);
  const [fieldingStats, setFieldingStats] = useState({
    catches: 0,
    stumpings: 0,
    runouts: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedPlayer) {
      setLoading(true);
      getPlayerMatches(selectedPlayer)
        .then(matches => {
          setPlayerMatches(matches);
          setSelectedMatch(""); // Reset match selection
          setLoading(false);
        })
        .catch(error => {
          console.error("Error fetching player matches:", error);
          setLoading(false);
        });
    } else {
      setPlayerMatches([]);
      setSelectedMatch("");
    }
  }, [selectedPlayer]);

  const handlePlayerChange = (e) => {
    setSelectedPlayer(e.target.value);
  };

  const handleMatchChange = (e) => {
    setSelectedMatch(e.target.value);
  };

  const handleFieldingChange = (field, value) => {
    setFieldingStats({
      ...fieldingStats,
      [field]: parseInt(value)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedPlayer || !selectedMatch) {
      alert("Please select both a player and a match");
      return;
    }
    
    setLoading(true);
    
    try {
      await updateFieldingStats(selectedMatch, fieldingStats);
      onSuccess();
      // Reset form
      setFieldingStats({
        catches: 0,
        stumpings: 0,
        runouts: 0
      });
    } catch (error) {
      console.error("Error updating fielding stats:", error);
      alert("Failed to update fielding stats");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.formGroup}>
        <label className={styles.label}>Select Player:</label>
        <select 
          value={selectedPlayer} 
          onChange={handlePlayerChange}
          className={styles.select}
          disabled={loading}
          required
        >
          <option value="">-- Select a player --</option>
          {players.map(player => (
            <option key={player.id} value={player.id}>
              {player.name}
            </option>
          ))}
        </select>
      </div>

      {selectedPlayer && (
        <div className={styles.formGroup}>
          <label className={styles.label}>Select Match:</label>
          <select 
            value={selectedMatch} 
            onChange={handleMatchChange}
            className={styles.select}
            disabled={loading || playerMatches.length === 0}
            required
          >
            <option value="">-- Select a match --</option>
            {playerMatches.map(match => (
              <option key={match.docId} value={match.docId}>
                {match.matchInfo} ({match.date}) {match.existingFielding ? "- Has fielding" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedMatch && (
        <div className={styles.fieldingStats}>
          <h3 className={styles.subtitle}>Fielding Statistics</h3>
          
          <div className={styles.formGroup}>
            <label className={styles.label}>Catches:</label>
            <input
              type="number"
              min="0"
              value={fieldingStats.catches}
              onChange={(e) => handleFieldingChange("catches", e.target.value)}
              className={styles.input}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Stumpings:</label>
            <input
              type="number"
              min="0"
              value={fieldingStats.stumpings}
              onChange={(e) => handleFieldingChange("stumpings", e.target.value)}
              className={styles.input}
              disabled={loading}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Run Outs:</label>
            <input
              type="number"
              min="0"
              value={fieldingStats.runouts}
              onChange={(e) => handleFieldingChange("runouts", e.target.value)}
              className={styles.input}
              disabled={loading}
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={loading || !selectedPlayer || !selectedMatch}
      >
        {loading ? "Updating..." : "Update Fielding Stats"}
      </button>
    </form>
  );
};

export default FieldingForm;
