// src/app/admin/players/page.js
"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../../../firebase';
import { collection, doc, getDoc, getDocs, query, where, setDoc } from 'firebase/firestore';
import { PlayerMasterService } from '@/app/services/PlayerMasterService';
import styles from './players.module.css';

export default function PlayerAdmin() {
  const [players, setPlayers] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [newAltId, setNewAltId] = useState('');
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processingPlayerId, setProcessingPlayerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  useEffect(() => {
    loadPlayers();
  }, []);
  
  const loadPlayers = async () => {
    setLoading(true);
    const playerList = await getPlayerList();
    setPlayers(playerList);
    setLoading(false);
  };
  
  const getPlayerList = async () => {
    try {
      const playersRef = collection(db, 'playersMaster');
      const snapshot = await getDocs(playersRef);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    } catch (error) {
      console.error('Error getting player list:', error);
      return [];
    }
  };
  
  const handleAddMapping = async () => {
    if (!selectedPlayer || !newAltId.trim()) return;
    
    try {
      setMessage({ type: 'info', text: 'Processing... This may take a moment.' });
      setProcessingPlayerId(selectedPlayer.id);
      
      const result = await PlayerMasterService.mapRelatedPlayers(selectedPlayer.id, [newAltId.trim()]);
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `Player mapping added successfully. Processed ${result.entriesProcessed || 0} entries from ${result.uniqueMatches || 0} matches.` 
        });
        setNewAltId('');
        
        // Refresh the selected player to show updated stats
        const refreshedPlayer = await refreshPlayerData(selectedPlayer.id);
        setSelectedPlayer(refreshedPlayer);
        
        // Also update in the players list
        loadPlayers(); 
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add mapping' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setProcessingPlayerId(null);
    }
  };
  
  const refreshPlayerData = async (playerId) => {
    const playerRef = doc(db, 'playersMaster', playerId);
    const playerDoc = await getDoc(playerRef);
    if (playerDoc.exists()) {
      return { id: playerDoc.id, ...playerDoc.data() };
    }
    return null;
  };
  
  const handleRoleChange = async (newRole) => {
    if (!selectedPlayer) return;
    
    try {
      // Create a new player object with updated role
      const updatedPlayer = {
        ...selectedPlayer,
        role: newRole
      };
      
      // Update the player in the database
      await PlayerMasterService.upsertPlayer({
        id: selectedPlayer.id,
        name: selectedPlayer.name,
        role: newRole,
        team: selectedPlayer.team || '',
        alternateIds: selectedPlayer.alternateIds || [],
        // Preserve other fields
        active: selectedPlayer.active !== false,
        stats: selectedPlayer.stats || {}
      });
      
      // Update local state
      setSelectedPlayer(updatedPlayer);
      setMessage({ type: 'success', text: 'Player role updated successfully' });
      
      // Update in the main list
      setPlayers(players.map(p => 
        p.id === selectedPlayer.id ? { ...p, role: newRole } : p
      ));
    } catch (error) {
      setMessage({ type: 'error', text: 'Error updating player role: ' + error.message });
    }
  };
  
  const handleTeamChange = async (newTeam) => {
    if (!selectedPlayer) return;
    
    try {
      // Create a new player object with updated team
      const updatedPlayer = {
        ...selectedPlayer,
        team: newTeam
      };
      
      // Update the player in the database
      await PlayerMasterService.upsertPlayer({
        id: selectedPlayer.id,
        name: selectedPlayer.name,
        role: selectedPlayer.role || 'unknown',
        team: newTeam,
        alternateIds: selectedPlayer.alternateIds || [],
        // Preserve other fields
        active: selectedPlayer.active !== false,
        stats: selectedPlayer.stats || {}
      });
      
      // Update local state
      setSelectedPlayer(updatedPlayer);
      setMessage({ type: 'success', text: 'Player team updated successfully' });
      
      // Update in the main list
      setPlayers(players.map(p => 
        p.id === selectedPlayer.id ? { ...p, team: newTeam } : p
      ));
    } catch (error) {
      setMessage({ type: 'error', text: 'Error updating player team: ' + error.message });
    }
  };
  
  const handleRebuildPlayerStats = async () => {
    if (!selectedPlayer) return;
    
    try {
      setMessage({ type: 'info', text: 'Rebuilding player stats... This may take a moment.' });
      setProcessingPlayerId(selectedPlayer.id);
      
      // Call the same method as for adding a mapping, but with an empty array of new IDs
      // This will reset and rebuild all stats without adding new alternate IDs
      const result = await PlayerMasterService.mapRelatedPlayers(selectedPlayer.id, []);
      
      if (result.success) {
        setMessage({ 
          type: 'success', 
          text: `Player stats rebuilt successfully. Processed ${result.entriesProcessed || 0} entries from ${result.uniqueMatches || 0} matches.` 
        });
        
        // Refresh the selected player to show updated stats
        const refreshedPlayer = await refreshPlayerData(selectedPlayer.id);
        setSelectedPlayer(refreshedPlayer);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to rebuild player stats' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setProcessingPlayerId(null);
    }
  };
  
  // Filter players based on search term
  const filteredPlayers = searchTerm.trim() 
    ? players.filter(player => 
        (player.name && player.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        player.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (player.team && player.team.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (player.alternateIds && player.alternateIds.some(id => id.toLowerCase().includes(searchTerm.toLowerCase())))
      )
    : players;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Player Management</h1>
      
      {/* Search bar */}
      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search players by name, ID, team..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>
      
      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <div className={styles.adminGrid}>
        <div className={styles.playerListContainer}>
          <h2>Player List ({filteredPlayers.length})</h2>
          
          {loading ? (
            <div className={styles.loading}>Loading players...</div>
          ) : (
            <div className={styles.playerList}>
              {filteredPlayers.map(player => (
                <div 
                  key={player.id} 
                  className={`${styles.playerItem} ${selectedPlayer?.id === player.id ? styles.selected : ''}`}
                  onClick={() => setSelectedPlayer(player)}
                >
                  <div className={styles.playerName}>{player.name || player.id}</div>
                  <div className={styles.playerDetails}>
                    <span className={styles.playerTeam}>{player.team || 'Unknown'}</span>
                    <span className={`${styles.playerRole} ${styles[player.role] || ''}`}>
                      {player.role || 'unknown'}
                    </span>
                  </div>
                  {player.alternateIds?.length > 0 && (
                    <div className={styles.alternateIds}>
                      Alt IDs: {player.alternateIds.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className={styles.playerDetails}>
          {selectedPlayer ? (
            <div className={styles.playerCard}>
              <h3 className={styles.playerCardTitle}>
                {selectedPlayer.name || selectedPlayer.id}
                {processingPlayerId === selectedPlayer.id && (
                  <span className={styles.processingLabel}>Processing...</span>
                )}
              </h3>
              
              <div className={styles.fieldGroup}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>ID:</label>
                  <div className={styles.fieldValue}>{selectedPlayer.id}</div>
                </div>
                
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Name:</label>
                  <div className={styles.fieldValue}>{selectedPlayer.name || 'N/A'}</div>
                </div>
                
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Team:</label>
                  <div className={styles.fieldInput}>
                    <input
                      type="text"
                      value={selectedPlayer.team || ''}
                      onChange={(e) => handleTeamChange(e.target.value)}
                      placeholder="e.g., IND, AUS, CSK, MI"
                    />
                  </div>
                </div>
                
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Role:</label>
                  <div className={styles.fieldInput}>
                    <select 
                      value={selectedPlayer.role || 'unknown'}
                      onChange={(e) => handleRoleChange(e.target.value)}
                    >
                      <option value="batsman">Batsman</option>
                      <option value="bowler">Bowler</option>
                      <option value="allrounder">All-rounder</option>
                      <option value="wicketkeeper">Wicket-keeper</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className={styles.statsSection}>
                <h4>Player Stats</h4>
                <div className={styles.statsGrid}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Matches:</span>
                    <span className={styles.statValue}>{selectedPlayer.stats?.matches || 0}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Batting:</span>
                    <span className={styles.statValue}>{selectedPlayer.stats?.battingRuns || 0} runs</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>4s/6s:</span>
                    <span className={styles.statValue}>
                      {selectedPlayer.stats?.fours || 0}/{selectedPlayer.stats?.sixes || 0}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Bowling:</span>
                    <span className={styles.statValue}>{selectedPlayer.stats?.wickets || 0} wickets</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>50s/100s:</span>
                    <span className={styles.statValue}>
                      {selectedPlayer.stats?.fifties || 0}/{selectedPlayer.stats?.hundreds || 0}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Points:</span>
                    <span className={styles.statValue}>{Math.round(selectedPlayer.stats?.points || 0)}</span>
                  </div>
                </div>
                
                <button 
                  className={styles.rebuildButton}
                  onClick={handleRebuildPlayerStats}
                  disabled={processingPlayerId === selectedPlayer.id}
                >
                  Rebuild Player Stats
                </button>
              </div>
              
              <div className={styles.mappingSection}>
                <h4>Alternate IDs Management</h4>
                
                {selectedPlayer.alternateIds?.length > 0 ? (
                  <div className={styles.alternateIdsList}>
                    <label className={styles.altIdsLabel}>Current Alternate IDs:</label>
                    <div className={styles.altIdsChips}>
                      {selectedPlayer.alternateIds.map((id, index) => (
                        <span key={index} className={styles.altIdChip}>{id}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className={styles.noAlternateIds}>No alternate IDs</p>
                )}
                
                <div className={styles.addMapping}>
                  <label className={styles.addMappingLabel}>
                    Add Alternate ID:
                    <input
                      type="text"
                      value={newAltId}
                      onChange={(e) => setNewAltId(e.target.value)}
                      className={styles.addMappingInput}
                      placeholder="e.g., rohit"
                      disabled={processingPlayerId === selectedPlayer.id}
                    />
                  </label>
                  
                  <button 
                    onClick={handleAddMapping}
                    className={styles.addMappingButton}
                    disabled={!newAltId.trim() || processingPlayerId === selectedPlayer.id}
                  >
                    Add & Rebuild Stats
                  </button>
                </div>
                
                <p className={styles.mappingInfo}>
                  Adding a new alternate ID will automatically merge all stats from entries using that ID.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.noPlayerSelected}>
              <p>Select a player from the list</p>
            </div>
          )}
        </div>
      </div>
      
      <div className={styles.importSection}>
        <h3 className={styles.importTitle}>Import Team Players</h3>
        <p className={styles.importDescription}>
          Paste HTML from team page and enter team code (e.g., GT, CSK, MI)
        </p>
        
        <div className={styles.importForm}>
          <div className={styles.importField}>
            <label>Team Code:</label>
            <input id="team-code-input" type="text" placeholder="GT" className={styles.teamCodeInput} />
          </div>
          
          <div className={styles.importField}>
            <label>HTML from Team Page:</label>
            <textarea 
              id="team-html-input"
              className={styles.htmlInput}
              placeholder="Paste HTML here..."
            ></textarea>
          </div>
          
          <button
            onClick={() => {
              // Keep your existing import team players functionality
              if (window.handleImportTeamData) {
                window.handleImportTeamData();
              } else {
                alert('Import function not available');
              }
            }}
            className={styles.importButton}
          >
            Import Team Players
          </button>
        </div>
      </div>
    </div>
  );
}
