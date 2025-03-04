// src/app/admin/players/page.js
"use client";

import React, { useState, useEffect } from 'react';
import { getPlayerList, mapPlayerIds } from '../player-management';

export default function PlayerAdmin() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [newAltId, setNewAltId] = useState('');
  const [message, setMessage] = useState(null);
  
  useEffect(() => {
    loadPlayers();
  }, []);
  
  const loadPlayers = async () => {
    const playerList = await getPlayerList();
    setPlayers(playerList);
  };
  
  const handleAddMapping = async () => {
    if (!selectedPlayer || !newAltId.trim()) return;
    
    try {
      const result = await mapPlayerIds(selectedPlayer.id, [newAltId.trim()]);
      
      if (result.success) {
        setMessage({ type: 'success', text: 'Player mapping added successfully' });
        setNewAltId('');
        loadPlayers(); // Refresh the list
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add mapping' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };
  
  return (
    <div>
      <h1>Player Management</h1>
      
      {message && (
        <div style={{ color: message.type === 'error' ? 'red' : 'green' }}>
          {message.text}
        </div>
      )}
      
      <div style={{ display: 'flex', marginTop: '20px' }}>
        <div style={{ width: '50%', padding: '10px' }}>
          <h2>Player List</h2>
          <div style={{ height: '500px', overflowY: 'auto' }}>
            {players.map(player => (
              <div 
                key={player.id} 
                style={{ 
                  padding: '10px', 
                  border: '1px solid #ddd',
                  margin: '5px 0',
                  backgroundColor: selectedPlayer?.id === player.id ? '#f0f0f0' : 'white',
                  cursor: 'pointer'
                }}
                onClick={() => setSelectedPlayer(player)}
              >
                <div><strong>{player.name || player.id}</strong></div>
                <div>Role: {player.role || 'Unknown'}</div>
                <div>Alternate IDs: {player.alternateIds?.join(', ') || 'None'}</div>
              </div>
            ))}
          </div>
        </div>
        
        <div style={{ width: '50%', padding: '10px' }}>
          <h2>Map Player IDs</h2>
          
          {selectedPlayer ? (
            <div>
              <h3>Selected: {selectedPlayer.name || selectedPlayer.id}</h3>
              
              <div style={{ marginTop: '20px' }}>
                <label>
                  Add Alternate ID:
                  <input
                    type="text"
                    value={newAltId}
                    onChange={(e) => setNewAltId(e.target.value)}
                    style={{ width: '100%', marginTop: '5px', padding: '5px' }}
                  />
                </label>
                
                <button 
                  onClick={handleAddMapping}
                  style={{ marginTop: '10px', padding: '5px 10px' }}
                  disabled={!newAltId.trim()}
                >
                  Add Mapping
                </button>
              </div>
              
              <div style={{ marginTop: '20px' }}>
                <h4>Current Alternate IDs:</h4>
                {selectedPlayer.alternateIds?.length > 0 ? (
                  <ul>
                    {selectedPlayer.alternateIds.map((id, index) => (
                      <li key={index}>{id}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No alternate IDs</p>
                )}
              </div>
            </div>
          ) : (
            <p>Select a player from the list</p>
          )}
        </div>
      </div>
    </div>
  );
}
