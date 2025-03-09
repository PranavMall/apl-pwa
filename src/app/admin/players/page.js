// src/app/admin/players/page.js
"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase'; // Adjust path as needed for your project
import { PlayerMasterService } from '@/app/services/PlayerMasterService';
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

const handleMigrateFromPoints = async () => {
  try {
    setMessage({ type: 'info', text: 'Starting migration...' });
    
    // Get all unique playerIds from playerPoints
    const pointsRef = collection(db, 'playerPoints');
    const snapshot = await getDocs(pointsRef);
    
    const uniquePlayerIds = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.playerId) {
        uniquePlayerIds.add(data.playerId);
      }
    });
    
    console.log(`Found ${uniquePlayerIds.size} unique players to migrate`);
    
    let count = 0;
    for (const playerId of uniquePlayerIds) {
      try {
        // Get all performance entries for this player
        const playerEntries = snapshot.docs.filter(doc => 
          doc.data().playerId === playerId
        );
        
        if (playerEntries.length > 0) {
          // Find an entry with player name
          const entryWithName = playerEntries.find(doc => 
            doc.data().performance?.name
          ) || playerEntries[0];
          
          const playerData = entryWithName.data();
          
          // Create or update player in master DB
          await PlayerMasterService.upsertPlayer({
            id: playerId,
            name: playerData.performance?.name || playerId,
            // Try to determine role from performance type
            role: playerData.performance?.bowling ? 'bowler' : 
                  playerData.performance?.batting ? 'batsman' : 'unknown',
            // Initialize with zero stats - we'll calculate them next
            stats: {
              matches: 0,
              runs: 0,
              wickets: 0,
              catches: 0,
              stumpings: 0,
              runOuts: 0,
              fifties: 0,
              hundreds: 0
            }
          });
          
          // Now process all entries to calculate cumulative stats
          const processedMatches = new Set(); // Track matches to count them once
          
          // Sort entries by timestamp to process chronologically
          const sortedEntries = playerEntries.sort((a, b) => {
            const timeA = new Date(a.data().timestamp || 0).getTime();
            const timeB = new Date(b.data().timestamp || 0).getTime();
            return timeA - timeB;
          });
          
          for (const entry of sortedEntries) {
            const entryData = entry.data();
            const performance = entryData.performance || {};
            const matchId = entryData.matchId;
            
            // Only count each match once for match count
            const isNewMatch = !processedMatches.has(matchId);
            if (isNewMatch) {
              processedMatches.add(matchId);
            }
            
            // Gather stats from this performance
            const matchStats = {
              isNewMatch,
              runs: performance.batting ? (performance.runs || 0) : 0,
              wickets: performance.bowling ? (performance.wickets || 0) : 0,
              catches: performance.catches || 0,
              stumpings: performance.stumpings || 0,
              runOuts: performance.runouts || 0
            };
            
            // Update player stats with this performance
            await PlayerMasterService.updatePlayerStats(playerId, matchStats);
          }
          
          count++;
          console.log(`Processed ${count}/${uniquePlayerIds.size}: ${playerId}`);
        }
      } catch (playerError) {
        console.error(`Error processing player ${playerId}:`, playerError);
      }
    }
    
    setMessage({ type: 'success', text: `Migrated ${count} players from points data` });
    loadPlayers(); // Refresh the list
  } catch (error) {
    console.error('Migration error:', error);
    setMessage({ type: 'error', text: error.message });
  }
};
  
  return (
    <div>
      <h1>Player Management</h1>
      <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
    <button 
      onClick={handleMigrateFromPoints}
      style={{ 
        padding: '8px 16px', 
        backgroundColor: '#4caf50', 
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer'
      }}
    >
      Migrate Players from Points Data
    </button>
    {/* Other action buttons */}
  </div>
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
             {/* Add role dropdown */}

    <div style={{ marginTop: '15px' }}>
      <label>
        Role:
        <select 
          value={selectedPlayer.role || 'unknown'}
          onChange={(e) => {
            // Create a new player object with updated role
            const updatedPlayer = {
              ...selectedPlayer,
              role: e.target.value
            };
            setSelectedPlayer(updatedPlayer);
          }}
          style={{ width: '100%', marginTop: '5px', padding: '5px' }}
        >
          <option value="batsman">Batsman</option>
          <option value="bowler">Bowler</option>
          <option value="allrounder">All-rounder</option>
          <option value="wicketkeeper">Wicket-keeper</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>
    </div>
    
    {/* Add team input field */}
    <div style={{ marginTop: '15px' }}>
      <label>
        Team:
        <input
          type="text"
          value={selectedPlayer.team || ''}
          onChange={(e) => {
            // Create a new player object with updated team
            const updatedPlayer = {
              ...selectedPlayer,
              team: e.target.value
            };
            setSelectedPlayer(updatedPlayer);
          }}
          placeholder="e.g., IND, AUS, CSK, MI"
          style={{ width: '100%', marginTop: '5px', padding: '5px' }}
        />
      </label>
    </div>
    
    {/* Add a save button for the updated fields */}
    <div style={{ marginTop: '20px' }}>
      <button
        onClick={async () => {
          try {
            // Update the player with all current fields
            await PlayerMasterService.upsertPlayer({
              id: selectedPlayer.id,
              name: selectedPlayer.name,
              role: selectedPlayer.role || 'unknown',
              team: selectedPlayer.team || '',
              alternateIds: selectedPlayer.alternateIds || [],
              // Preserve other fields
              active: selectedPlayer.active !== false,
              stats: selectedPlayer.stats || {}
            });
            
            setMessage({ type: 'success', text: 'Player updated successfully' });
            loadPlayers(); // Refresh the list
          } catch (error) {
            setMessage({ type: 'error', text: 'Error updating player: ' + error.message });
          }
        }}
        style={{ 
          padding: '8px 16px',
          backgroundColor: '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        Save Player Changes
      </button>
    </div>
              
              <div style={{ marginTop: '10px' }}>
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
