"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/firebase';
import { useAuth } from '@/app/context/authContext';
import withAuth from '@/app/components/withAuth';
// Import components from your existing component structure
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/tabs';
import styles from './profile.module.css';
import { transferService } from '../services/transferService';
import { generateReferralCode } from '../utils/referralUtils';

const UserProfilePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [referralCode, setReferralCode] = useState('');
  const [transferWindow, setTransferWindow] = useState(null);
  const [isTransferActive, setIsTransferActive] = useState(false);
  const [userTeam, setUserTeam] = useState(null);
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
  const [weeklyStats, setWeeklyStats] = useState([]);

  // Load user profile and team
  useEffect(() => {
    if (user) {
      fetchUserData();
      fetchAvailablePlayers();
      checkTransferWindow();
    }
  }, [user]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // Fetch user profile
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserProfile(userData);
        setTeamName(userData.teamName || '');
        setBio(userData.bio || '');
        setPhotoURL(userData.photoURL || '');
        setReferralCode(userData.referralCode || generateReferralCode(user.uid));
      }
      
      // Fetch weekly stats
      fetchWeeklyStats();
      
      // Fetch user team for current tournament
      const activeTournament = await transferService.getActiveTournament();
      if (activeTournament) {
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
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setLoading(false);
    }
  };

  const fetchWeeklyStats = async () => {
    try {
      const statsData = await transferService.getUserWeeklyStats(user.uid);
      setWeeklyStats(statsData);
    } catch (error) {
      console.error('Error fetching weekly stats:', error);
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

  const handlePhotoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      // Show preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoURL(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = async () => {
    if (!photoFile) return photoURL;
    
    try {
      const storageRef = ref(storage, `profile-images/${user.uid}`);
      await uploadBytes(storageRef, photoFile);
      return await getDownloadURL(storageRef);
    } catch (error) {
      console.error('Error uploading photo:', error);
      throw error;
    }
  };

  const saveProfile = async () => {
    if (!teamName.trim()) {
      alert('Team name is required');
      return;
    }
    
    try {
      setSaving(true);
      
      // Upload photo if changed
      let profilePhotoURL = photoURL;
      if (photoFile) {
        profilePhotoURL = await uploadPhoto();
      }
      
      // Generate referral code if not exists
      const code = referralCode || generateReferralCode(user.uid);
      
      // Update user profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        teamName: teamName.trim(),
        bio: bio.trim(),
        photoURL: profilePhotoURL,
        referralCode: code,
        updatedAt: new Date()
      });
      
      setReferralCode(code);
      alert('Profile saved successfully');
      setSaving(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Error saving profile. Please try again.');
      setSaving(false);
    }
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
        alert(`You can only select ${maxByRole[role]} ${role}`);
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
      alert('Captain cannot be vice-captain');
      return;
    }
    setViceCaptain(player.id === viceCaptain?.id ? null : player);
  };

  const saveTeam = async () => {
    try {
      // Validate team selection
      const totalPlayers = 
        selectedPlayers.batsmen.length + 
        selectedPlayers.bowlers.length + 
        selectedPlayers.allrounders.length + 
        selectedPlayers.wicketkeepers.length;
      
      if (totalPlayers !== 11) {
        alert(`You must select exactly 11 players. Current: ${totalPlayers}`);
        return;
      }
      
      if (!captain) {
        alert('You must select a captain');
        return;
      }
      
      if (!viceCaptain) {
        alert('You must select a vice-captain');
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
        alert('Team saved successfully!');
        // Refresh team data
        fetchUserData();
      } else {
        alert(`Error saving team: ${result.error}`);
      }
      
      setSaving(false);
    } catch (error) {
      console.error('Error saving team:', error);
      alert('Error saving team. Please try again.');
      setSaving(false);
    }
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode)
      .then(() => alert('Referral code copied to clipboard!'))
      .catch(err => alert('Failed to copy code. Please try again.'));
  };

  if (loading) {
    return <div className={styles.loading}>Loading profile data...</div>;
  }

  return (
    <div className={styles.container}>
      <Card className={styles.profileCard}>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.profileForm}>
            <div className={styles.photoSection}>
              <div className={styles.photoContainer}>
                {photoURL ? (
                  <Image 
                    src={photoURL} 
                    alt="Profile" 
                    width={120} 
                    height={120}
                    className={styles.profilePhoto}
                  />
                ) : (
                  <div className={styles.photoPlaceholder}>
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0) || '?'}
                  </div>
                )}
              </div>
              <label className={styles.uploadButton}>
                Change Photo
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoChange} 
                  className={styles.fileInput}
                />
              </label>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Team Name *</label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className={styles.input}
                placeholder="Your Fantasy Team Name"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>About Me</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={styles.textarea}
                placeholder="Tell us about yourself..."
                rows={3}
              />
            </div>

            <div className={styles.referralSection}>
              <h3>Your Referral Code</h3>
              <div className={styles.referralCode}>
                <span>{referralCode}</span>
                <button 
                  className={styles.copyButton}
                  onClick={copyReferralCode}
                >
                  Copy
                </button>
              </div>
              <p className={styles.referralInfo}>
                Share your code with friends. You'll earn 25 points for each friend who joins (up to 3 friends).
              </p>
            </div>

            <button 
              className={styles.saveButton}
              onClick={saveProfile}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className={styles.teamCard}>
        <CardHeader>
          <CardTitle>My Team</CardTitle>
          {transferWindow && (
            <div className={isTransferActive ? styles.activeWindow : styles.inactiveWindow}>
              {isTransferActive ? (
                <>Transfer Window Open! Closes on {new Date(transferWindow.endDate).toLocaleDateString()}</>
              ) : (
                <>Next Transfer: {new Date(transferWindow.startDate).toLocaleDateString()}</>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isTransferActive ? (
            <div className={styles.transferSection}>
              <Tabs defaultValue="batsmen">
                <TabsList>
                  <TabsTrigger value="batsmen">Batsmen (4)</TabsTrigger>
                  <TabsTrigger value="bowlers">Bowlers (4)</TabsTrigger>
                  <TabsTrigger value="allrounders">All-rounders (2)</TabsTrigger>
                  <TabsTrigger value="wicketkeepers">Wicket-keepers (1)</TabsTrigger>
                </TabsList>

                <TabsContent value="batsmen" className={styles.playersGrid}>
                  {availablePlayers.batsmen.map(player => {
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
                        <div className={styles.playerTeam}>{player.team}</div>
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
                </TabsContent>

                <TabsContent value="bowlers" className={styles.playersGrid}>
                  {availablePlayers.bowlers.map(player => {
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
                        <div className={styles.playerTeam}>{player.team}</div>
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
                </TabsContent>

                <TabsContent value="allrounders" className={styles.playersGrid}>
                  {availablePlayers.allrounders.map(player => {
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
                        <div className={styles.playerTeam}>{player.team}</div>
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
                </TabsContent>

                <TabsContent value="wicketkeepers" className={styles.playersGrid}>
                  {availablePlayers.wicketkeepers.map(player => {
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
                        <div className={styles.playerTeam}>{player.team}</div>
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
                </TabsContent>
              </Tabs>

              <div className={styles.teamSummary}>
                <div className={styles.teamCount}>
                  <span>Selected Players: {
                    selectedPlayers.batsmen.length + 
                    selectedPlayers.bowlers.length + 
                    selectedPlayers.allrounders.length + 
                    selectedPlayers.wicketkeepers.length
                  }/11</span>
                  <div className={styles.captainSummary}>
                    <span>Captain: {captain?.name || 'Not selected'}</span>
                    <span>Vice-Captain: {viceCaptain?.name || 'Not selected'}</span>
                  </div>
                </div>
              </div>

              <button 
                className={styles.saveTeamButton}
                onClick={saveTeam}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Team'}
              </button>
            </div>
          ) : (
            <div className={styles.lockedTransferSection}>
              <div className={styles.lockedMessage}>
                {transferWindow ? (
                  <>
                    <h3>Transfer Window Closed</h3>
                    <p>Next transfer window opens on {new Date(transferWindow.startDate).toLocaleDateString()}</p>
                  </>
                ) : (
                  <>
                    <h3>No Active Transfer Window</h3>
                    <p>Please check back later for the next transfer window</p>
                  </>
                )}
              </div>

              {userTeam && (
                <div className={styles.currentTeam}>
                  <h3>Your Current Team</h3>
                  <div className={styles.currentTeamGrid}>
                    {userTeam.players.map(player => (
                      <div key={player.id} className={styles.currentPlayerCard}>
                        <div className={styles.playerName}>{player.name}</div>
                        <div className={styles.playerRole}>{player.role}</div>
                        {(player.isCaptain || player.isViceCaptain) && (
                          <div className={styles.playerRole}>
                            {player.isCaptain ? 'Captain' : 'Vice-Captain'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={styles.statsCard}>
        <CardHeader>
          <CardTitle>My Weekly Performance</CardTitle>
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
                    <th>Transfer Window</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyStats.map((stat) => (
                    <tr key={stat.weekNumber}>
                      <td>Week {stat.weekNumber}</td>
                      <td>{stat.points}</td>
                      <td>{stat.rank}</td>
                      <td>{stat.transferWindowId ? 'Yes' : 'No'}</td>
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
  );
};

export default withAuth(UserProfilePage);
