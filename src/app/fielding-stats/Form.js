"use client";

import { useState, useEffect } from "react";
import { getPlayersForMatch, updateFieldingStats } from "./api";

const FieldingForm = ({ matches, onSuccess }) => {
  const [selectedMatch, setSelectedMatch] = useState("");
  const [players, setPlayers] = useState([]);
  const [fieldingEntries, setFieldingEntries] = useState([
    { playerId: "", catches: 0, stumpings: 0, runouts: 0 }
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedMatch) {
      setLoading(true);
      getPlayersForMatch(selectedMatch)
        .then(players => {
          setPlayers(players);
          setLoading(false);
        })
        .catch(error => {
          console.error("Error fetching players:", error);
          setLoading(false);
        });
    } else {
      setPlayers([]);
    }
  }, [selectedMatch]);

  const handleMatchChange = (e) => {
    setSelectedMatch(e.target.value);
    setFieldingEntries([{ playerId: "", catches: 0, stumpings: 0, runouts: 0 }]);
  };

  const handleAddPlayer = () => {
    setFieldingEntries([
      ...fieldingEntries,
      { playerId: "", catches: 0, stumpings: 0, runouts: 0 }
    ]);
  };

  const handleRemovePlayer = (index) => {
    const updatedEntries = [...fieldingEntries];
    updatedEntries.splice(index, 1);
    setFieldingEntries(updatedEntries);
  };

  const handleEntryChange = (index, field, value) => {
    const updatedEntries = [...fieldingEntries];
    updatedEntries[index][field] = field === "playerId" ? value : parseInt(value);
    setFieldingEntries(updatedEntries);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await updateFieldingStats(selectedMatch, fieldingEntries);
      onSuccess();
      // Reset form
      setFieldingEntries([{ playerId: "", catches: 0, stumpings: 0, runouts: 0 }]);
    } catch (error) {
      console.error("Error updating fielding stats:", error);
      alert("Failed to update fielding stats");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Select Match:</label>
        <select 
          value={selectedMatch} 
          onChange={handleMatchChange}
          required
        >
          <option value="">-- Select a match --</option>
          {matches.map(match => (
            <option key={match.id} value={match.id}>
              {match.team1} vs {match.team2} - {match.date}
            </option>
          ))}
        </select>
      </div>

      {fieldingEntries.map((entry, index) => (
        <div key={index} className="fielding-entry">
          <h3>Player {index + 1}</h3>
          
          <div className="form-group">
            <label>Select Player:</label>
            <select
              value={entry.playerId}
              onChange={(e) => handleEntryChange(index, "playerId", e.target.value)}
              required
              disabled={loading || !selectedMatch}
            >
              <option value="">-- Select player --</option>
              {players.map(player => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Catches:</label>
            <input
              type="number"
              min="0"
              value={entry.catches}
              onChange={(e) => handleEntryChange(index, "catches", e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Stumpings:</label>
            <input
              type="number"
              min="0"
              value={entry.stumpings}
              onChange={(e) => handleEntryChange(index, "stumpings", e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label>Run Outs:</label>
            <input
              type="number"
              min="0"
              value={entry.runouts}
              onChange={(e) => handleEntryChange(index, "runouts", e.target.value)}
              disabled={loading}
            />
          </div>

          {index > 0 && (
            <button
              type="button"
              onClick={() => handleRemovePlayer(index)}
              disabled={loading}
              className="remove-btn"
            >
              Remove Player
            </button>
          )}
        </div>
      ))}

      <div className="form-actions">
        <button
          type="button"
          onClick={handleAddPlayer}
          disabled={loading || !selectedMatch}
          className="add-btn"
        >
          Add Another Player
        </button>
        <button
          type="submit"
          disabled={loading || !selectedMatch || fieldingEntries.some(e => !e.playerId)}
          className="submit-btn"
        >
          {loading ? "Updating..." : "Update Fielding Stats"}
        </button>
      </div>
    </form>
  );
};

export default FieldingForm;
