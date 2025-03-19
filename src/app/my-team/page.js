"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase';
import { useAuth } from '@/app/context/authContext';
import withAuth from '@/app/components/withAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { transferService } from '../services/transferService';
import styles from './team.module.css';

const MyTeamPage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [userTeam, setUserTeam] = useState(null);
  const [transferWindow, setTransferWindow] = useState(null);
  const [isTransferActive, setIsTransferActive] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('batsmen');
  const [saving, setSaving] = useState(false);
  
  // States for team selection
  const [availablePlayers, setAvailablePlayers] = useState({
    batsmen: [],
    bowlers: [],
    allrounders: [],
    wicketkeepers: []
  });
  const [selectedPlayers, setSelectedPlayers] = useState({
    batsmen: [],
    bowlers: [],
    allrounders: [],
    wicketkeepers: []
  });
  const [captain, setCaptain] = useState(null);
  const [viceCaptain, setViceCaptain] = useState(null);
  
  useEffect(() => {
    if (user) {
      fetchTeamData();
      checkTransferWindow();
    }
  }, [user]);
  
  const fetchTeamData = async () => {
    try {
      setLoading(true);
      
      // Get active tournament
      const activeTournament = await transferService.getActiveTournament();
      
      if (!activeTournament) {
        setLoading(false);
        return;
      }
      
      // Get user team
      const userTeam = await transferService.getUserTeam(user.uid, activeTournament.id);
      setUserTeam(userTeam);
      
      if (userTeam) {
        // Organize selected players by role
        const playersByRole = {
          batsmen: [],
          bowlers: [],
          allrounders: [],
          wicketkeepers: []
        };
        
        userTeam.players.forEach(player => {
          if (player.role === 'batsman') playersByRole.batsmen.push(player);
          else if (player.role === 'bowler') playersByRole.bowlers.push(player);
          else if (player.role === 'allrounder') playersByRole.allrounders.push(player);
          else if (player.role === 'wicketkeeper') playersByRole.wicketkeepers.push(player);
          
          if (player.isCaptain) setCaptain(player);
          if (player.isViceCaptain) setViceCaptain(player);
        });
        
        setSelectedPlayers(playersByRole);
      }
      
      // Get weekly stats
      const weeklyStats = await transferService.getUserWeeklyStats(user.uid);
      setWeeklyStats(weeklyStats);
      
      // Fetch available players
      await fetchAvailablePlayers();
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching team data:', error);
      setLoading(false);
    }
  };
  
  const fetchAvailablePlayers = async () => {
    try {
      const players = await transferService.getAvailablePlayers();
      setAvailablePlayers(players);
    } catch (error) {
      console.error('Error fetching available players:', error);
    }
  };
  
  const checkTransferWindow = async () => {
    try {
      const { isActive, window } = await transferService.isTransferWindowActive();
      setIsTransferActive(isActive);
      setTransferWindow(window);
    } catch (error) {
      console.error('Error checking transfer window:', error);
    }
  };
  
  const handleEnterEditMode = () => {
    setEditMode(true);
  };
  
  const handleCancelEdit = () => {
    // Reset to original team
    if (userTeam) {
      const playersByRole = {
        batsmen: [],
        bowlers: [],
        allrounders: [],
        wicketkeepers: []
      };
      
      userTeam.players.forEach(player => {
        if (player.role === 'batsman') playersByRole.batsmen.push(player);
        else if (player.role === 'bowler') playersByRole.bowlers.push(player);
        else if (player.role === 'allrounder') playersByRole.allrounders.push(player);
        else if (player.role === 'wicketkeeper') playersByRole.wicketkeepers.push(player);
        
        if (player.isCaptain) setCaptain(player);
        if (player.isViceCaptain) setViceCaptain(player);
      });
      
      setSelectedPlayers(playersByRole);
    }
    
    setEditMode(false);
    setMessage({ text: '', type: '' });
  };
  
  const handlePlayerSelection = (player, role, isSelected) => {
    if (isSelected) {
      // Remove player
      setSelectedPlayers(prev => ({
        ...prev,
        [role]: prev[role].filter(p => p.id !== player.id)
      }));
      
      // If removing captain or vice-captain, reset them
      if (captain && captain.id === player.id) setCaptain(null);
      if (viceCaptain && viceCaptain.id === player.id) setViceCaptain(null);
    } else {
      // Check if we can add more of this role
      const maxByRole = {
        batsmen: 4,
        bowlers: 4,
        allrounders: 2,
        wicketkeepers: 1
      };
      
      if (selectedPlayers[role].length >= maxByRole[role]) {
        setMessage({ 
          text: `You can only select ${maxByRole[role]} ${role}`, 
          type: 'error' 
        });
        return;
      }
      
      // Add player
      setSelectedPlayers(prev => ({
        ...prev,
        [role]: [...prev[role], player]
      }));
    }
  };
  
  const handleCaptainSelection = (player) => {
    // If selecting a new captain who is already vice-captain, reset vice-captain
    if (viceCaptain && viceCaptain.id === player.id) {
      setViceCaptain(null);
    }
    setCaptain(player.id === captain?.id ? null : player);
  };
  
  const handleViceCaptainSelection = (player) => {
    // Cannot select captain as vice-captain
    if (captain && captain.id === player.id) {
      setMessage({ text: 'Captain cannot be vice-captain', type: 'error' });
      return;
    }
    setViceCaptain(player.id === viceCaptain?.id ? null : player);
  };
  
  const saveTeam = async () => {
    try {
      setMessage({ text: '', type: '' });
      
      // Validate team selection
      const totalPlayers = 
        selectedPlayers.batsmen.length + 
        selectedPlayers.bowlers.length + 
        selectedPlayers.allrounders.length + 
        selectedPlayers.wicketkeepers.length;
      
      if (totalPlayers !== 11) {
        setMessage({ 
          text: `You must select exactly 11 players. Current: ${totalPlayers}`, 
          type: 'error' 
        });
        return;
      }
      
      if (!captain) {
        setMessage({ text: 'You must select a captain', type: 'error' });
        return;
      }
      
      if (!viceCaptain) {
        setMessage({ text: 'You must select a vice-captain', type: 'error' });
        return;
      }
      
      setSaving(true);
      
      // Flatten players array and mark captain/vice-captain
      const allPlayers = [
        ...selectedPlayers.batsmen.map(p => ({
          ...p,
          isCaptain: captain.id === p.id,
          isViceCaptain: viceCaptain.id === p.id
        })),
        ...selectedPlayers.bowlers.map(p => ({
          ...p,
          isCaptain: captain.id === p.id,
          isViceCaptain: viceCaptain.id === p.id
        })),
        ...selectedPlayers.allrounders.map(p => ({
          ...p,
          isCaptain: captain.id === p.id,
          isViceCaptain: viceCaptain.id === p.id
        })),
        ...selectedPlayers.wicketkeepers.map(p => ({
          ...p,
          isCaptain: captain.id === p.id,
          isViceCaptain: viceCaptain.id === p.id
        }))
      ];
      
      const result = await transferService.saveUserTeam(user.uid, allPlayers);
      if (result.success) {
        setMessage({ text: 'Team saved successfully!', type: 'success' });
        // Refresh team data
        setEditMode(false);
        fetchTeamData();
      } else {
        setMessage({ 
          text: `Error saving team: ${result.error || 'Unknown error'}`, 
          type: 'error' 
        });
      }
      
      setSaving(false);
    } catch (error) {
      console.error('Error saving team:', error);
      setMessage({ 
        text: 'Error saving team. Please try again.', 
        type: 'error' 
      });
      setSaving(false);
    }
  };
  
  // Group players by role for display
  const groupPlayersByRole = (players) => {
    return players.reduce((grouped, player) => {
      const category = player.role || 'unknown';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(player);
      return grouped;
    }, {});
  };
  
  // Filter players based on search term
  const filterPlayers = (players, searchTerm) => {
    if (!searchTerm.trim()) return players;
    
    return players.filter(player => 
      player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (player.team && player.team.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  };
  
  const filteredAvailablePlayers = {
    batsmen: filterPlayers(availablePlayers.batsmen, searchTerm),
    bowlers: filterPlayers(availablePlayers.bowlers, searchTerm),
    allrounders: filterPlayers(availablePlayers.allrounders, searchTerm),
    wicketkeepers: filterPlayers(availablePlayers.wicketkeepers, searchTerm)
  };
  
  if (loading) {
    return <div className={styles.loading}>Loading team data...</div>;
  }
  
  const getTeamColor = (teamName) => {
    // Team colors mapping
    const teamColors = {
      'MI': '#004BA0', // Mumbai Indians
      'CSK': '#F9CD05', // Chennai Super Kings
      'RCB': '#EC1C24', // Royal Challengers Bangalore
      'KKR': '#3A225D', // Kolkata Knight Riders
      'SRH': '#FF822A', // Sunrisers Hyderabad
      'DC': '#00008B', // Delhi Capitals
      'PBKS': '#ED1F27', // Punjab Kings
      'RR': '#254AA5', // Rajasthan Royals
      'GT': '#1D429C', // Gujarat Titans
      'LSG': '#A72056', // Lucknow Super Giants
      'IND': '#0571B0', // India
      'AUS': '#FFCD00', // Australia
      'ENG': '#002868', // England
      'PAK': '#01411C', // Pakistan
      'NZ': '#000000', // New Zealand
      'SA': '#007C59', // South Africa
      'WI': '#7B0041', // West Indies
      'SL': '#003478', // Sri Lanka
      'BAN': '#006A4E', // Bangladesh
      'AFG': '#003893', // Afghanistan
    };
    
    // Default to a generic color if team not found
    return teamColors[teamName] || '#718096';
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>My Team</h1>
      
      {/* Team summary at the top */}
      {userTeam && (
        <Card className={`${styles.teamSummaryCard} ${editMode ? styles.editMode : ''}`}>
          <CardHeader>
            <CardTitle>Team Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.teamSummary}>
              <div className={styles.captainInfo}>
                <div className={styles.summarySection}>
                  <h3>Captain</h3>
                  {captain ? (
                    <div className={styles.playerBadge}>
                      <span className={styles.badgeName}>{captain.name}</span>
                      <span 
                        className={styles.badgeTeam}
                        style={{ backgroundColor: getTeamColor(captain.team) }}
                      >
                        {captain.team}
                      </span>
                      <span className={styles.multiplier}>2x</span>
                    </div>
                  ) : (
                    <span className={styles.notSelected}>Not selected</span>
                  )}
                </div>
                
                <div className={styles.summarySection}>
                  <h3>Vice-Captain</h3>
                  {viceCaptain ? (
                    <div className={styles.playerBadge}>
                      <span className={styles.badgeName}>{viceCaptain.name}</span>
                      <span 
                        className={styles.badgeTeam}
                        style={{ backgroundColor: getTeamColor(viceCaptain.team) }}
                      >
                        {viceCaptain.team}
                      </span>
                      <span className={styles.multiplier}>1.5x</span>
                    </div>
                  ) : (
                    <span className={styles.notSelected}>Not selected</span>
                  )}
                </div>
              </div>
              
              <div className={styles.teamCount}>
                <h3>Team Composition</h3>
                <div className={styles.countBadges}>
                  <span className={styles.countBadge}>
                    Batsmen: {selectedPlayers.batsmen.length}/4
                  </span>
                  <span className={styles.countBadge}>
                    Bowlers: {selectedPlayers.bowlers.length}/4
                  </span>
                  <span className={styles.countBadge}>
                    All-rounders: {selectedPlayers.allrounders.length}/2
                  </span>
                  <span className={styles.countBadge}>
                    Wicket-keepers: {selectedPlayers.wicketkeepers.length}/1
                  </span>
                  <span className={`${styles.countBadge} ${styles.totalCount}`}>
                    Total: {selectedPlayers.batsmen.length + selectedPlayers.bowlers.length + 
                    selectedPlayers.allrounders.length + selectedPlayers.wicketkeepers.length}/11
                  </span>
                </div>
              </div>
              
              {transferWindow && (
                <div className={styles.transferInfo}>
                  <h3>Transfer Window</h3>
                  {isTransferActive ? (
                    <div className={styles.activeWindow}>
                      <span>Transfer Window Open!</span>
                      <span>Closes on {new Date(transferWindow.endDate).toLocaleDateString()}</span>
                    </div>
                  ) : (
                    <div className={styles.inactiveWindow}>
                      <span>Transfer Window Closed</span>
                      {transferWindow.startDate && 
                        <span>Next window opens on {new Date(transferWindow.startDate).toLocaleDateString()}</span>
                      }
                    </div>
                  )}
                  <div className={styles.transfersRemaining}>
                    <span>Transfers Remaining: {userTeam?.transfersRemaining || 0}</span>
                  </div>
                </div>
              )}
              
              {isTransferActive && !editMode && (
                <button 
                  className={styles.editTeamButton}
                  onClick={handleEnterEditMode}
                >
                  Edit Team
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      {editMode ? (
        <Card className={styles.editCard}>
          <CardHeader>
            <CardTitle>Edit Your Team</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.searchContainer}>
              <input
                type="text"
                placeholder="Search players by name or team..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            
            <div className={styles.tabs}>
              {["batsmen", "bowlers", "allrounders", "wicketkeepers"].map((category) => (
                <button
                  key={category}
                  className={`${styles.tab} ${activeTab === category ? styles.activeTab : ""}`}
                  onClick={() => setActiveTab(category)}
                >
                  {category === "batsmen" ? "Batsmen (4)" : 
                  category === "bowlers" ? "Bowlers (4)" : 
                  category === "allrounders" ? "All-rounders (2)" : "Wicket-keepers (1)"}
                </button>
              ))}
            </div>
            
            <div className={styles.playersGrid}>
              {activeTab === "batsmen" && filteredAvailablePlayers.batsmen.map(player => {
                const isSelected = selectedPlayers.batsmen.some(p => p.id === player.id);
                const isCaptain = captain?.id === player.id;
                const isViceCaptain = viceCaptain?.id === player.id;
                
                return (
                  <div 
                    key={player.id}
                    className={`${styles.playerCard} ${isSelected ? styles.selectedPlayer : ''}`}
                    onClick={() => handlePlayerSelection(player, 'batsmen', isSelected)}
                  >
                    <div className={styles.playerName}>{player.name}</div>
                    <div 
                      className={styles.playerTeam}
                      style={{ backgroundColor: getTeamColor(player.team) }}
                    >
                      {player.team}
                    </div>
                    <div className={styles.playerPoints}>{Math.round(player.stats?.points || 0)} pts</div>
                    
                    {isSelected && (
                      <div className={styles.captainButtons}>
                        <button 
                          className={`${styles.captainButton} ${isCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCaptainSelection(player);
                          }}
                        >
                          C
                        </button>
                        <button 
                          className={`${styles.viceCaptainButton} ${isViceCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViceCaptainSelection(player);
                          }}
                        >
                          VC
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {activeTab === "bowlers" && filteredAvailablePlayers.bowlers.map(player => {
                const isSelected = selectedPlayers.bowlers.some(p => p.id === player.id);
                const isCaptain = captain?.id === player.id;
                const isViceCaptain = viceCaptain?.id === player.id;
                
                return (
                  <div 
                    key={player.id}
                    className={`${styles.playerCard} ${isSelected ? styles.selectedPlayer : ''}`}
                    onClick={() => handlePlayerSelection(player, 'bowlers', isSelected)}
                  >
                    <div className={styles.playerName}>{player.name}</div>
                    <div 
                      className={styles.playerTeam}
                      style={{ backgroundColor: getTeamColor(player.team) }}
                    >
                      {player.team}
                    </div>
                    <div className={styles.playerPoints}>{Math.round(player.stats?.points || 0)} pts</div>
                    
                    {isSelected && (
                      <div className={styles.captainButtons}>
                        <button 
                          className={`${styles.captainButton} ${isCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCaptainSelection(player);
                          }}
                        >
                          C
                        </button>
                        <button 
                          className={`${styles.viceCaptainButton} ${isViceCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViceCaptainSelection(player);
                          }}
                        >
                          VC
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {activeTab === "allrounders" && filteredAvailablePlayers.allrounders.map(player => {
                const isSelected = selectedPlayers.allrounders.some(p => p.id === player.id);
                const isCaptain = captain?.id === player.id;
                const isViceCaptain = viceCaptain?.id === player.id;
                
                return (
                  <div 
                    key={player.id}
                    className={`${styles.playerCard} ${isSelected ? styles.selectedPlayer : ''}`}
                    onClick={() => handlePlayerSelection(player, 'allrounders', isSelected)}
                  >
                    <div className={styles.playerName}>{player.name}</div>
                    <div 
                      className={styles.playerTeam}
                      style={{ backgroundColor: getTeamColor(player.team) }}
                    >
                      {player.team}
                    </div>
                    <div className={styles.playerPoints}>{Math.round(player.stats?.points || 0)} pts</div>
                    
                    {isSelected && (
                      <div className={styles.captainButtons}>
                        <button 
                          className={`${styles.captainButton} ${isCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCaptainSelection(player);
                          }}
                        >
                          C
                        </button>
                        <button 
                          className={`${styles.viceCaptainButton} ${isViceCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViceCaptainSelection(player);
                          }}
                        >
                          VC
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              
              {activeTab === "wicketkeepers" && filteredAvailablePlayers.wicketkeepers.map(player => {
                const isSelected = selectedPlayers.wicketkeepers.some(p => p.id === player.id);
                const isCaptain = captain?.id === player.id;
                const isViceCaptain = viceCaptain?.id === player.id;
                
                return (
                  <div 
                    key={player.id}
                    className={`${styles.playerCard} ${isSelected ? styles.selectedPlayer : ''}`}
                    onClick={() => handlePlayerSelection(player, 'wicketkeepers', isSelected)}
                  >
                    <div className={styles.playerName}>{player.name}</div>
                    <div 
                      className={styles.playerTeam}
                      style={{ backgroundColor: getTeamColor(player.team) }}
                    >
                      {player.team}
                    </div>
                    <div className={styles.playerPoints}>{Math.round(player.stats?.points || 0)} pts</div>
                    
                    {isSelected && (
                      <div className={styles.captainButtons}>
                        <button 
                          className={`${styles.captainButton} ${isCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCaptainSelection(player);
                          }}
                        >
                          C
                        </button>
                        <button 
                          className={`${styles.viceCaptainButton} ${isViceCaptain ? styles.selected : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViceCaptainSelection(player);
                          }}
                        >
                          VC
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className={styles.editActions}>
              <button 
                className={styles.cancelButton}
                onClick={handleCancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                className={styles.saveTeamButton}
                onClick={saveTeam}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Team'}
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={styles.teamCard}>
          <CardHeader>
            <CardTitle>Current Team</CardTitle>
          </CardHeader>
          <CardContent>
            {userTeam ? (
              <>
                <div className={styles.specialPlayers}>
                  <div className={styles.playerRole}>
                    <h3>Captain</h3>
                    {captain ? (
                      <div className={styles.captainCard}>
                        <span className={styles.captainName}>{captain.name}</span>
                        <div className={styles.playerDetails}>
                          <span className={styles.roleBadge}>{captain.role}</span>
                          <span 
                            className={styles.teamBadge}
                            style={{ backgroundColor: getTeamColor(captain.team) }}
                          >
                            {captain.team}
                          </span>
                        </div>
                        <div className={styles.captainMultiplier}>
                          2x Points
                        </div>
                      </div>
                    ) : (
                      <div className={styles.notSelected}>Not selected</div>
                    )}
                  </div>
                  
                  <div className={styles.playerRole}>
                    <h3>Vice-Captain</h3>
                    {viceCaptain ? (
                      <div className={styles.viceCaptainCard}>
                        <span className={styles.captainName}>{viceCaptain.name}</span>
                        <div className={styles.playerDetails}>
                          <span className={styles.roleBadge}>{viceCaptain.role}</span>
                          <span 
                            className={styles.teamBadge}
                            style={{ backgroundColor: getTeamColor(viceCaptain.team) }}
                          >
                            {viceCaptain.team}
                          </span>
                        </div>
                        <div className={styles.captainMultiplier}>
                          1.5x Points
                        </div>
                      </div>
                    ) : (
                      <div className={styles.notSelected}>Not selected</div>
                    )}
                  </div>
                </div>
                
                <div className={styles.playerCategories}>
                  {Object.entries(selectedPlayers).map(([role, players]) => (
                    players.length > 0 && (
                      <div key={role} className={styles.roleSection}>
                        <h3 className={styles.roleTitle}>
                          {role.charAt(0).toUpperCase() + role.slice(1)} ({players.length})
                        </h3>
                        <div className={styles.playersGrid}>
                          {players.map(player => (
                            <div key={player.id} className={styles.playerCard}>
                              <div className={styles.playerName}>{player.name}</div>
                              <div 
                                className={styles.playerTeam}
                                style={{ backgroundColor: getTeamColor(player.team) }}
                              >
                                {player.team}
                              </div>
                              {(player.isCaptain || player.isViceCaptain) && (
                                <div className={styles.captainBadge}>
                                  {player.isCaptain ? 'C' : 'VC'}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </>
            ) : (
              <div className={styles.noTeamMessage}>
                <p>You don't have a team yet for the current tournament.</p>
                {isTransferActive && (
                  <button 
                    className={styles.createTeamButton}
                    onClick={handleEnterEditMode}
                  >
                    Create Team
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      <div className={styles.statsSection}>
        <Card className={styles.statsCard}>
          <CardHeader>
            <CardTitle>Weekly Performance</CardTitle>
          </CardHeader>
          <CardContent>
            {weeklyStats.length > 0 ? (
              <div className={styles.weeklyStatsTable}>
                <table>
                  <thead>
                    <tr>
                      <th>Week</th>
                      <th>Points</th>
                      <th>Rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyStats.map((stat) => (
                      <tr key={stat.weekNumber}>
                        <td>Week {stat.weekNumber}</td>
                        <td>{stat.points}</td>
                        <td>{stat.rank}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.noStats}>
                <p>No weekly stats available yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default withAuth(MyTeamPage);
