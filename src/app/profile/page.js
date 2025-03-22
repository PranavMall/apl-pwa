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
import { generateReferralCode, isValidReferralFormat } from '../utils/referralUtils';
import { getUserAvatar } from '@/app/utils/userUtils';
import Link from 'next/link';
import LeagueManager from '@/app/components/Leagues/LeagueManager';

const UserProfilePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState({ text: '', type: '' });
  const [teamMessage, setTeamMessage] = useState({ text: '', type: '' });
  const [userProfile, setUserProfile] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [bio, setBio] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [referralCode, setReferralCode] = useState('');
  const [transferWindow, setTransferWindow] = useState(null);
  const [isTransferActive, setIsTransferActive] = useState(false);
  const [userTeam, setUserTeam] = useState(null);
  // Added the previously external state variables inside the component
  const [referrerCode, setReferrerCode] = useState('');
  const [referralMessage, setReferralMessage] = useState({ text: '', type: '' });
  const [processingReferral, setProcessingReferral] = useState(false);
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
        console.log("User profile loaded:", userData);
        console.log("referredBy value:", userData.referredBy);
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

  const handleReferralSubmit = async () => {
    if (!referrerCode.trim()) {
      setReferralMessage({ text: 'Please enter a referral code', type: 'error' });
      return;
    }
    
    try {
      setProcessingReferral(true);
      setReferralMessage({ text: '', type: '' });
      
      // Validate referral code format
      if (!isValidReferralFormat(referrerCode)) {
        setReferralMessage({ text: 'Invalid referral code format (must start with APL-)', type: 'error' });
        setProcessingReferral(false);
        return;
      }
      
      // Process the referral
      const result = await transferService.processReferral(user.uid, referrerCode);
      
      if (result.success) {
        setReferralMessage({ text: 'Referral code applied successfully!', type: 'success' });
        // Refresh user data to reflect changes
        fetchUserData();
      } else {
        setReferralMessage({ text: result.error || 'Failed to apply referral code', type: 'error' });
      }
    } catch (error) {
      console.error('Error applying referral code:', error);
      setReferralMessage({ text: 'Error applying referral code. Please try again.', type: 'error' });
    } finally {
      setProcessingReferral(false);
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
      console.log('Transfer window active:', isActive);
      console.log('Transfer window:', window);
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
  
  const shareOnWhatsApp = () => {
    const message = encodeURIComponent(
       `Join me on Apna Premier League Fantasy Cricket! Use my referral code: ${referralCode} when you sign up at https://apl-pwa-2025.vercel.app/. I'll earn bonus points for referring you. Let's compete together!`
    );
    const whatsappUrl = `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank');
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
      setSaveMessage({ text: 'Team name is required', type: 'error' });
      return;
    }
    
    try {
      setSaving(true);
      setSaveMessage({ text: '', type: '' });
      
      // Upload photo if changed
      let profilePhotoURL = photoURL;
      if (photoFile) {
        profilePhotoURL = await uploadPhoto();
      }
      
      // Generate referral code if not exists
      const code = referralCode || generateReferralCode(user.uid);
      
      // Only allow updating teamName if it hasn't been set before
      const updateData = {
        bio: bio.trim(),
        photoURL: profilePhotoURL,
        referralCode: code,
        updatedAt: new Date()
      };
      
      // Only update team name if it's not already set
      if (!userProfile?.teamName && teamName.trim()) {
        updateData.teamName = teamName.trim();
      }
      
      // Update user profile
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, updateData);
      
      setReferralCode(code);
      setSaveMessage({ text: 'Profile saved successfully', type: 'success' });
      
      // Update local user profile data
      setUserProfile(prev => ({
        ...prev,
        ...updateData
      }));
      
      setSaving(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      setSaveMessage({ text: 'Error saving profile. Please try again.', type: 'error' });
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
        setTeamMessage({ 
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
      setTeamMessage({ text: 'Captain cannot be vice-captain', type: 'error' });
      return;
    }
    setViceCaptain(player.id === viceCaptain?.id ? null : player);
  };

  const saveTeam = async () => {
    try {
      setTeamMessage({ text: '', type: '' });
      
      // Validate team selection
      const totalPlayers = 
        selectedPlayers.batsmen.length + 
        selectedPlayers.bowlers.length + 
        selectedPlayers.allrounders.length + 
        selectedPlayers.wicketkeepers.length;
      
      if (totalPlayers !== 11) {
        setTeamMessage({ 
          text: `You must select exactly 11 players. Current: ${totalPlayers}`, 
          type: 'error' 
        });
        return;
      }
      
      if (!captain) {
        setTeamMessage({ text: 'You must select a captain', type: 'error' });
        return;
      }
      
      if (!viceCaptain) {
        setTeamMessage({ text: 'You must select a vice-captain', type: 'error' });
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
        setTeamMessage({ text: 'Team saved successfully!', type: 'success' });
        // Refresh team data
        fetchUserData();
      } else {
        setTeamMessage({ 
          text: `Error saving team: ${result.error || 'Unknown error'}`, 
          type: 'error' 
        });
      }
      
      setSaving(false);
    } catch (error) {
      console.error('Error saving team:', error);
      setTeamMessage({ 
        text: 'Error saving team. Please try again.', 
        type: 'error' 
      });
      setSaving(false);
    }
  };

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode)
      .then(() => setSaveMessage({ text: 'Referral code copied to clipboard!', type: 'success' }))
      .catch(err => setSaveMessage({ text: 'Failed to copy code. Please try again.', type: 'error' }));
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


          <div className={styles.formGroup}>
            <label className={styles.label}>Team Name *</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className={styles.input}
              placeholder="Your Fantasy Team Name"
              disabled={userProfile?.teamName}
              title={userProfile?.teamName ? "Team name cannot be changed after saving" : ""}
              required
            />
            {userProfile?.teamName && (
              <p className={styles.fieldHint}>Team name cannot be changed after first save</p>
            )}
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
              <button 
                className={styles.whatsappButton}
                onClick={shareOnWhatsApp}
              >
                Share on WhatsApp
              </button>
            </div>
            <p className={styles.referralInfo}>
              Share your code with friends. You'll earn 25 points for each friend who joins (up to 3 friends).
              Friends can <a href="/login" className={styles.referralLink}>sign up here</a> using your code.
            </p>
          </div>
          
          {/* Only show referrer code input if user hasn't used one yet */}
          {!userProfile?.referredBy && (
            <div className={styles.referralSection}>
              <h3>Enter Referrer's Code</h3>
              <p className={styles.referralInfo}>
                If someone referred you, enter their code to earn them bonus points!
              </p>
              <div className={styles.formGroup}>
                <input
                  type="text"
                  value={referrerCode}
                  onChange={(e) => setReferrerCode(e.target.value)}
                  className={styles.input}
                  placeholder="Enter referrer's code (e.g., APL-ABC123)"
                />
              </div>
              
              {referralMessage && referralMessage.text && (
                <div className={`${styles.statusMessage} ${styles[referralMessage.type]}`}>
                  {referralMessage.text}
                </div>
              )}
              
              <button 
                className={styles.saveButton}
                onClick={handleReferralSubmit}
                disabled={processingReferral}
                style={{ marginTop: '10px' }}
              >
                {processingReferral ? 'Processing...' : 'Apply Referral Code'}
              </button>
            </div>
          )}

          {saveMessage.text && (
            <div className={`${styles.statusMessage} ${styles[saveMessage.type]}`}>
              {saveMessage.text}
            </div>
          )}
          
          <button 
            className={styles.saveButton}
            onClick={saveProfile}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </CardContent>
      </Card>

          <Card className={styles.teamCard}>
            <CardHeader>
            <CardTitle>Team Management</CardTitle>
            </CardHeader>
            <CardContent>
            {transferWindow && (
            <div className={isTransferActive ? styles.activeWindow : styles.inactiveWindow}>
              {isTransferActive ? (
                <>Transfer Window Open! Closes on {new Date(transferWindow.endDate).toLocaleDateString()}</>
              ) : (
                <>Next Transfer: {new Date(transferWindow.startDate).toLocaleDateString()}</>
              )}
            </div>
          )}
<p className={styles.teamInfoText}>
      Create and manage your fantasy cricket team in the dedicated Team section.
    </p>
    <Link href="/my-team">
      <button className={styles.teamManagementButton}>
        Manage My Team
      </button>
    </Link>  </CardContent>
  </Card>

      <Card className={styles.statsCard}>
<Card className={styles.leaguesCard}>
  <CardHeader>
    <CardTitle>My Leagues</CardTitle>
  </CardHeader>
  <CardContent>
    <LeagueManager userId={user.uid} userName={userProfile?.name || user.email} />
  </CardContent>
</Card>
  
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
