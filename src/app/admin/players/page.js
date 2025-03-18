// src/app/admin/players/page.js
"use client";

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../firebase'; // Adjust path as needed for your project
import { PlayerMasterService } from '@/app/services/PlayerMasterService';
import { getPlayerList, mapPlayerIds } from '../player-management';
import { importTeamPlayers } from '../scripts/parseIplTeamData';

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

const handleImportTeamData = async () => {
  try {
    setMessage({ type: 'info', text: 'Processing team data...' });
    
    // Get the HTML content from the textarea
    const htmlContent = document.getElementById('team-html-input').value;
    const teamCode = document.getElementById('team-code-input').value;
    
    if (!htmlContent || !teamCode) {
      setMessage({ type: 'error', text: 'Please enter both HTML content and team code' });
      return;
    }
    
    console.log(`Processing HTML for team ${teamCode}`);
    
    const result = await importTeamPlayers(htmlContent, teamCode);
    
    if (result.success) {
      setMessage({ 
        type: 'success', 
        text: `Successfully imported ${result.playerCount} players from ${result.teamName}!` 
      });
      loadPlayers(); // Refresh the list
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to import team data' });
    }
  } catch (error) {
    console.error('Error importing team data:', error);
    setMessage({ type: 'error', text: error.message });
  }
};

const handleMigrateFromPoints = async () => {
  try {
    setMessage({ type: 'info', text: 'Starting migration...' });
    
    // Step 1: Get all unique player IDs
    const pointsRef = collection(db, 'playerPoints');
    const snapshot = await getDocs(pointsRef);
    
    const uniquePlayerIds = new Set();
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.playerId) {
        uniquePlayerIds.add(data.playerId);
      }
    });
    
    console.log(`Found ${uniquePlayerIds.size} unique player IDs to process`);
    
    // Step 2: Create a mapping of alternate IDs to primary IDs
    const primaryIdMap = new Map(); // altId -> primaryId
    
    // Get all players in the master DB
    const playersRef = collection(db, 'playersMaster');
    const playersSnapshot = await getDocs(playersRef);
    
    // Build the mapping
    playersSnapshot.forEach(doc => {
      const player = doc.data();
      const primaryId = doc.id;
      
      // Add all alternate IDs to the map
      if (player.alternateIds && Array.isArray(player.alternateIds)) {
        player.alternateIds.forEach(altId => {
          primaryIdMap.set(altId, primaryId);
        });
      }
    });
    
    console.log(`Processed ${primaryIdMap.size} alternate ID mappings`);
    
    // Step 3: Process each player ID
    let count = 0;
    for (const playerId of uniquePlayerIds) {
      try {
        // Find the primary ID for this player
        const primaryId = primaryIdMap.get(playerId) || playerId;
        
        // Get all entries for this player ID
        const playerEntries = snapshot.docs.filter(doc => 
          doc.data().playerId === playerId
        );
        
        if (playerEntries.length > 0) {
          // Find an entry with the player's name
          const entryWithName = playerEntries.find(doc => 
            doc.data().performance?.name
          ) || playerEntries[0];
          
          const playerData = entryWithName.data();
          
          // Ensure the player exists in the master DB
          let masterPlayer = await PlayerMasterService.findPlayerByAnyId(primaryId);
          
          if (!masterPlayer) {
            // Create the player if they don't exist
            await PlayerMasterService.upsertPlayer({
              id: primaryId,
              name: playerData.performance?.name || primaryId,
              role: playerData.performance?.bowling ? 'bowler' : 
                    playerData.performance?.batting ? 'batsman' : 'unknown',
              alternateIds: primaryId !== playerId ? [playerId] : []
            });
          } else if (primaryId !== playerId && !masterPlayer.alternateIds?.includes(playerId)) {
            // Add this ID as an alternate if it's not already there
            const updatedAlternateIds = [...(masterPlayer.alternateIds || []), playerId];
            await PlayerMasterService.mapRelatedPlayers(primaryId, [playerId]);
          }
          
          // Now process all entries to update stats
          const processedMatches = new Set(); // Track matches to count them once
          
          for (const entry of playerEntries) {
            const entryData = entry.data();
            const performance = entryData.performance || {};
            const matchId = entryData.matchId;
            const points = entryData.points || 0; // Extract points from the root level
            
            // Only count each match once for match count
            const isNewMatch = !processedMatches.has(matchId);
            if (isNewMatch) {
              processedMatches.add(matchId);
            }
            
            // Gather stats from this performance
            const matchStats = {
    isNewMatch,
    battingRuns: performance.batting ? parseInt(performance.runs || 0) : 0,
    bowlingRuns: performance.bowling ? parseInt(performance.bowler_runs || 0) : 0,
    wickets: performance.bowling ? parseInt(performance.wickets || 0) : 0,
    catches: parseInt(performance.catches || 0),
    stumpings: parseInt(performance.stumpings || 0),
    runOuts: parseInt(performance.runouts || 0),
    points: points, // Add the direct points value
    fifties: performance.batting && parseInt(performance.runs || 0) >= 50 && parseInt(performance.runs || 0) < 100 ? 1 : 0,
    hundreds: performance.batting && parseInt(performance.runs || 0) >= 100 ? 1 : 0
  };
            
            // Update the PRIMARY player's stats
            await PlayerMasterService.updatePlayerStats(primaryId, matchStats);
          }
          
          count++;
          console.log(`Processed ${count}/${uniquePlayerIds.size}: ${playerId} -> ${primaryId}`);
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
<button 
  onClick={() => document.getElementById('team-html-input').focus()}
  style={{ 
    padding: '8px 16px', 
    backgroundColor: '#0070f3',  // Blue color for IPL
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginLeft: '10px'  // Add some space
  }}
>
  Import IPL 2025 Players
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
             {/* ADD THE NEW IMPORT FORM HERE - INSIDE THE MAIN DIV */}
    <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h3>Import Team Players</h3>
      <p>Paste HTML from team page and enter team code (e.g., GT, CSK, MI)</p>
      
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>Team Code:</label>
        <input 
          id="team-code-input"
          type="text" 
          placeholder="GT" 
          style={{ width: '100px', padding: '5px' }}
        />
      </div>
      
      <div style={{ marginBottom: '10px' }}>
        <label style={{ display: 'block', marginBottom: '5px' }}>HTML from Team Page:</label>
        <textarea 
          id="team-html-input"
          style={{ width: '100%', height: '200px', padding: '5px' }} 
          placeholder="Paste HTML here..."
        ></textarea>
      </div>
      
      <button
        onClick={handleImportTeamData}
        style={{ 
          padding: '8px 16px', 
          backgroundColor: '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Import Team Players
      </button>
    </div>
    </div>
  );
}
