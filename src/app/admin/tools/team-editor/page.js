"use client";

import React, { useState, useEffect } from 'react';
import { db } from '../../../../firebase';
import styles from '../../tournaments/admin.module.css';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';

const AdminTeamEditor = () => {
  const [userId, setUserId] = useState('');
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(null);
  const [replacementPlayer, setReplacementPlayer] = useState({
    id: '',
    name: '',
    role: 'bowler', // Default role
  });
  const [weekNumber, setWeekNumber] = useState(1);
  const [activeTournament, setActiveTournament] = useState(null);

  // Fetch active tournament on component mount
  useEffect(() => {
    const fetchActiveTournament = async () => {
      try {
        const tournamentsRef = collection(db, 'tournaments');
        const q = query(
          tournamentsRef, 
          where('status', '==', 'active'), 
          limit(1)
        );
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const tournamentData = snapshot.docs[0].data();
          setActiveTournament({
            id: snapshot.docs[0].id,
            ...tournamentData
          });
        }
      } catch (err) {
        console.error('Error fetching tournament:', err);
        setError('Failed to load active tournament');
      }
    };
    
    fetchActiveTournament();
  }, []);

  const fetchLatestTeam = async () => {
    if (!userId) {
      setError('Please enter a user ID');
      return;
    }
    
    setLoading(true);
    setError(null);
    setMessage(null);
    
    try {
      if (!activeTournament) {
        throw new Error('No active tournament found');
      }
      
      // First check userTransferHistory
      const historyRef = collection(db, 'userTransferHistory');
      const q = query(
        historyRef,
        where('userId', '==', userId),
        where('tournamentId', '==', activeTournament.id),
        orderBy('weekNumber', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        // Found a transfer history
        const historyData = snapshot.docs[0].data();
        setTeamData({
          source: 'userTransferHistory',
          weekNumber: historyData.weekNumber,
          players: historyData.players || [],
          tournamentId: historyData.tournamentId,
          transferWindow: historyData.transferWindow || {},
          documentId: snapshot.docs[0].id
        });
        setWeekNumber(historyData.weekNumber + 1); // Default to next week
      } else {
        // Check userTeams
        const teamDocRef = doc(db, 'userTeams', `${userId}_${activeTournament.id}`);
        const teamDoc = await getDoc(teamDocRef);
        
        if (teamDoc.exists()) {
          const userData = teamDoc.data();
          setTeamData({
            source: 'userTeams',
            players: userData.players || [],
            tournamentId: activeTournament.id,
            lastTransferWindow: userData.lastTransferWindow || {},
            documentId: teamDoc.id
          });
          setWeekNumber(1); // Default to week 1 if no transfer history
        } else {
          throw new Error('No team found for this user');
        }
      }
    } catch (err) {
      console.error('Error fetching team:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReplacePlayer = (index) => {
    setSelectedPlayerIndex(index);
  };

  const confirmReplacement = () => {
    if (!replacementPlayer.id || !replacementPlayer.name) {
      setError('Please enter both player ID and name');
      return;
    }
    
    if (selectedPlayerIndex === null) {
      setError('No player selected for replacement');
      return;
    }
    
    // Create a copy of the players array
    const updatedPlayers = [...teamData.players];
    
    // Keep the captain/vice-captain status from the original player
    const originalPlayer = updatedPlayers[selectedPlayerIndex];
    
    // Replace the player
    updatedPlayers[selectedPlayerIndex] = {
      ...replacementPlayer,
      isCaptain: originalPlayer.isCaptain || false,
      isViceCaptain: originalPlayer.isViceCaptain || false,
      lastUpdated: new Date().toISOString()
    };
    
    // Update state
    setTeamData({
      ...teamData,
      players: updatedPlayers
    });
    
    // Reset selection
    setSelectedPlayerIndex(null);
    setReplacementPlayer({
      id: '',
      name: '',
      role: 'bowler'
    });
    
    setMessage('Player replaced successfully in the preview. Click "Update Team" to save changes.');
  };

  const saveTeamChanges = async () => {
    if (!teamData || !userId || !activeTournament) {
      setError('Missing required data');
      return;
    }
    
    setLoading(true);
    setError(null);
    setMessage(null);
    
    try {
      // Get transfer window data for the selected week
      const transferWindow = activeTournament.transferWindows.find(w => w.weekNumber === parseInt(weekNumber));
      
      if (!transferWindow) {
        throw new Error(`No transfer window found for week ${weekNumber}`);
      }
      
      // 1. Create/update userTransferHistory
      const transferHistoryRef = doc(db, 'userTransferHistory', `${userId}_${activeTournament.id}_${weekNumber}`);
      
      await setDoc(transferHistoryRef, {
        userId,
        tournamentId: activeTournament.id,
        weekNumber: parseInt(weekNumber),
        players: teamData.players,
        transferDate: new Date(),
        transferWindow: {
          weekNumber: transferWindow.weekNumber,
          startDate: transferWindow.startDate,
          endDate: transferWindow.endDate
        },
        lastUpdated: new Date()
      });
      
      // 2. Update userTeams collection
      const userTeamRef = doc(db, 'userTeams', `${userId}_${activeTournament.id}`);
      const userTeamDoc = await getDoc(userTeamRef);
      
      if (userTeamDoc.exists()) {
        const userData = userTeamDoc.data();
        
        await setDoc(userTeamRef, {
          ...userData,
          players: teamData.players,
          lastTransferDate: new Date(),
          lastUpdated: new Date(),
          lastTransferWindow: {
            weekNumber: transferWindow.weekNumber,
            startDate: transferWindow.startDate,
            endDate: transferWindow.endDate
          }
        }, { merge: true });
      } else {
        // Create a new userTeam document if it doesn't exist
        await setDoc(userTeamRef, {
          userId,
          tournamentId: activeTournament.id,
          registrationDate: new Date(),
          isLateRegistration: false,
          players: teamData.players,
          transfersRemaining: 2,
          lastTransferDate: new Date(),
          lastTransferWindow: {
            weekNumber: transferWindow.weekNumber,
            startDate: transferWindow.startDate,
            endDate: transferWindow.endDate
          },
          lastUpdated: new Date()
        });
      }
      
      setMessage('Team updated successfully!');
    } catch (err) {
      console.error('Error saving team changes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-team-editor">
      <h1>Admin Team Editor</h1>
      
      {error && <div className="error-message">{error}</div>}
      {message && <div className="success-message">{message}</div>}
      
      <div className="search-section">
        <h2>1. Find User Team</h2>
        <div className="input-group">
          <label>User ID:</label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter user ID"
          />
          <button onClick={fetchLatestTeam} disabled={loading}>
            {loading ? 'Loading...' : 'Find Team'}
          </button>
        </div>
      </div>
      
      {teamData && (
        <div className="team-section">
          <h2>2. Edit Team</h2>
          <p>
            <strong>Source:</strong> {teamData.source}
            {teamData.weekNumber && <span> (Week {teamData.weekNumber})</span>}
          </p>
          
          <div className="players-list">
            <h3>Players:</h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Captain</th>
                  <th>Vice Captain</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {teamData.players.map((player, index) => (
                  <tr key={index} className={selectedPlayerIndex === index ? 'selected' : ''}>
                    <td>{player.name}</td>
                    <td>{player.role}</td>
                    <td>{player.isCaptain ? 'Yes' : 'No'}</td>
                    <td>{player.isViceCaptain ? 'Yes' : 'No'}</td>
                    <td>
                      <button onClick={() => handleReplacePlayer(index)}>
                        Replace
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {selectedPlayerIndex !== null && (
            <div className="replacement-form">
              <h3>Replace Player</h3>
              <p>Replacing: {teamData.players[selectedPlayerIndex].name}</p>
              
              <div className="form-group">
                <label>New Player ID:</label>
                <input
                  type="text"
                  value={replacementPlayer.id}
                  onChange={(e) => setReplacementPlayer({...replacementPlayer, id: e.target.value})}
                  placeholder="e.g., josh-hazlewood"
                />
              </div>
              
              <div className="form-group">
                <label>New Player Name:</label>
                <input
                  type="text"
                  value={replacementPlayer.name}
                  onChange={(e) => setReplacementPlayer({...replacementPlayer, name: e.target.value})}
                  placeholder="e.g., Josh Hazlewood"
                />
              </div>
              
              <div className="form-group">
                <label>Role:</label>
                <select
                  value={replacementPlayer.role}
                  onChange={(e) => setReplacementPlayer({...replacementPlayer, role: e.target.value})}
                >
                  <option value="batsman">Batsman</option>
                  <option value="bowler">Bowler</option>
                  <option value="allrounder">All-rounder</option>
                  <option value="wicketkeeper">Wicket-keeper</option>
                </select>
              </div>
              
              <div className="button-group">
                <button onClick={confirmReplacement}>Confirm Replacement</button>
                <button onClick={() => setSelectedPlayerIndex(null)}>Cancel</button>
              </div>
            </div>
          )}
          
          <div className="update-section">
            <h3>3. Save Changes</h3>
            <div className="form-group">
              <label>Update for Week Number:</label>
              <input
                type="number"
                value={weekNumber}
                onChange={(e) => setWeekNumber(parseInt(e.target.value))}
                min="1"
              />
            </div>
            
            <button 
              onClick={saveTeamChanges}
              disabled={loading}
              className="save-button"
            >
              {loading ? 'Saving...' : 'Update Team'}
            </button>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .admin-team-editor {
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          font-family: Arial, sans-serif;
        }
        
        h1, h2, h3 {
          color: #333;
        }
        
        .error-message {
          background: #ffebee;
          color: #c62828;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
        }
        
        .success-message {
          background: #e8f5e9;
          color: #2e7d32;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
        }
        
        .input-group {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          align-items: center;
        }
        
        input, select {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 16px;
        }
        
        button {
          background: #4285f4;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
        }
        
        button:hover {
          background: #2a75f3;
        }
        
        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        
        table th, table td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: left;
        }
        
        table th {
          background: #f5f5f5;
        }
        
        tr.selected {
          background: #e3f2fd;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .replacement-form, .update-section {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 4px;
          margin-top: 20px;
        }
        
        .button-group {
          display: flex;
          gap: 10px;
        }
        
        .save-button {
          background: #4caf50;
          font-size: 18px;
          padding: 10px 20px;
          margin-top: 10px;
        }
        
        .save-button:hover {
          background: #388e3c;
        }
      `}</style>
    </div>
  );
};

export default AdminTeamEditor;
