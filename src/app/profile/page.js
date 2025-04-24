"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '@/firebase';
import { useAuth } from '@/app/context/authContext';
import withAuth from '@/app/components/withAuth';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/app/components/ui/tabs';
import styles from './profile.module.css';
import { transferService } from '../services/transferService';
import { generateReferralCode, isValidReferralFormat } from '../utils/referralUtils';
import { getUserAvatar } from '@/app/utils/userUtils';
import Link from 'next/link';
import LeagueManager from '@/app/components/Leagues/LeagueManager';
import WhatsAppShareButton from '../components/WhatsAppShareButton';

// Helper component for the Sparkline chart
const Sparkline = ({ data, width = 180, height = 50, color = '#f9a825' }) => {
  if (!data || data.length <= 1) {
    return <div className={styles.noSparkline}>Not enough data</div>;
  }
  
  // Find min and max for scaling
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1; // Avoid division by zero
  
  // Calculate dimensions
  const pointWidth = width / (data.length - 1);
  
  // Generate path
  const points = data.map((value, index) => {
    const x = index * pointWidth;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });
  
  const path = `M${points.join(' L')}`;
  
  return (
    <svg width={width} height={height} className={styles.sparkline}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
      />
      {/* Add dots for each data point */}
      {data.map((value, index) => (
        <circle
          key={index}
          cx={index * pointWidth}
          cy={height - ((value - min) / range) * height}
          r="3"
          fill={color}
        />
      ))}
      {/* Add a slightly larger dot for the last point */}
      <circle
        cx={(data.length - 1) * pointWidth}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="4"
        fill={color}
      />
    </svg>
  );
};

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
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [sparklineData, setSparklineData] = useState([]);

  // Load user profile and team
  useEffect(() => {
    if (user) {
      fetchUserData();
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
      const statsData = await transferService.getUserWeeklyStats(user.uid);
      
      // Sort by week number (ascending)
      statsData.sort((a, b) => a.weekNumber - b.weekNumber);
      setWeeklyStats(statsData);
      
      // Extract points for sparkline
      if (statsData.length > 0) {
        const pointsData = statsData.map(stat => stat.points || 0);
        setSparklineData(pointsData);
      }
      
      // Fetch user team
      const activeTournament = await transferService.getActiveTournament();
      if (activeTournament) {
        const userTeam = await transferService.getUserTeam(user.uid, activeTournament.id);
        setUserTeam(userTeam);
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

  const checkTransferWindow = async () => {
    try {
      const { isActive, window } = await transferService.isTransferWindowActive();
      setIsTransferActive(isActive);
      setTransferWindow(window);
    } catch (error) {
      console.error('Error checking transfer window:', error);
    }
  };

  // No photo upload functionality needed
  
  // We'll use the getUserAvatar utility function to generate avatars based on team name

  const saveProfile = async () => {
    if (!teamName.trim()) {
      setSaveMessage({ text: 'Team name is required', type: 'error' });
      return;
    }
    
    try {
      setSaving(true);
      setSaveMessage({ text: '', type: '' });
      
      // Generate referral code if not exists
      const code = referralCode || generateReferralCode(user.uid);
      
      // Only allow updating teamName if it hasn't been set before
      const updateData = {
        bio: bio.trim(),
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
      {/* My Profile Card */}
      <Card className={styles.profileCard}>
        <CardHeader>
          <CardTitle>My Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.profileGrid}>
            {/* Profile Photo Section */}
            <div className={styles.photoSection}>
              <div className={styles.photoContainer}>
                <Image 
                  src={getUserAvatar(teamName || user.email || 'User', user.uid)}
                  alt="Profile" 
                  width={120} 
                  height={120}
                  className={styles.profilePhoto}
                />
              </div>
              <div className={styles.avatarInfo}>
                <span className={styles.avatarLabel}>Team Avatar</span>
                <span className={styles.avatarHint}>Automatically generated based on your team name</span>
              </div>
            </div>

            {/* Profile Info Section */}
            <div className={styles.infoSection}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Team Name</label>
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
            </div>
          </div>

          {/* Referral Section */}
          <div className={styles.referralSection}>
            <h3>Your Referral Code</h3>
            <div className={styles.referralInfo}>
              <p>Share your code with friends and earn 25 points for each friend who joins (up to 3 friends).</p>
            </div>
            <div className={styles.referralCode}>
              <span>{referralCode}</span>
              <div className={styles.referralActions}>
                <button 
                  className={styles.copyButton}
                  onClick={copyReferralCode}
                >
                  Copy
                </button>
                <WhatsAppShareButton 
                  referralCode={referralCode} 
                  userName={userProfile?.name || 'Friend'} 
                  teamName={teamName}
                />
              </div>
            </div>
            
            {/* Only show referrer code input if user hasn't used one yet */}
            {!userProfile?.referredBy && (
              <div className={styles.referrerSection}>
                <h4>Enter Referrer's Code</h4>
                <p className={styles.referralInfo}>
                  If someone referred you, enter their code to earn them bonus points!
                </p>
                <div className={styles.referrerForm}>
                  <input
                    type="text"
                    value={referrerCode}
                    onChange={(e) => setReferrerCode(e.target.value)}
                    className={styles.input}
                    placeholder="Enter referrer's code (e.g., APL-ABC123)"
                  />
                  
                  {referralMessage.text && (
                    <div className={`${styles.statusMessage} ${styles[referralMessage.type]}`}>
                      {referralMessage.text}
                    </div>
                  )}
                  
                  <button 
                    className={styles.applyButton}
                    onClick={handleReferralSubmit}
                    disabled={processingReferral}
                  >
                    {processingReferral ? 'Processing...' : 'Apply Referral Code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Team Management Card */}
      <Card className={styles.teamCard}>
        <CardHeader>
          <CardTitle>Team Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.teamStatusInfo}>
            {transferWindow && (
              <div className={isTransferActive ? styles.activeWindow : styles.inactiveWindow}>
                {isTransferActive ? (
                  <span>Transfer Window Open! Closes on {new Date(transferWindow.endDate).toLocaleDateString()}</span>
                ) : (
                  <span>Next Transfer: {transferWindow.startDate ? new Date(transferWindow.startDate).toLocaleDateString() : 'TBD'}</span>
                )}
              </div>
            )}
          </div>
          
          <div className={styles.teamInfoContent}>
            <div className={styles.teamStatus}>
              <h3>Team Status</h3>
              {userTeam ? (
                <div className={styles.teamSummary}>
                  <div className={styles.teamStat}>
                    <span className={styles.statLabel}>Players</span>
                    <span className={styles.statValue}>{userTeam.players?.length || 0}/11</span>
                  </div>
                  {userTeam.lastTransferDate && (
                    <div className={styles.teamStat}>
                      <span className={styles.statLabel}>Last Updated</span>
                      <span className={styles.statValue}>
                        {new Date(userTeam.lastTransferDate.seconds * 1000).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className={styles.noTeamMessage}>You haven't created a team yet</p>
              )}
            </div>
            
            <Link href="/my-team" className={styles.teamManagementLink}>
              <button className={styles.teamManagementButton}>
                Manage My Team
              </button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* My Leagues Card */}
      <Card className={styles.leaguesCard}>
        <CardHeader>
          <CardTitle>My Leagues</CardTitle>
        </CardHeader>
        <CardContent>
          <LeagueManager userId={user.uid} userName={userProfile?.name || user.email} />
        </CardContent>
      </Card>
      
      {/* Weekly Performance Card */}
      <Card className={styles.statsCard}>
        <CardHeader>
          <CardTitle>My Weekly Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {weeklyStats.length > 0 ? (
            <div className={styles.weeklyPerformance}>
              <div className={styles.sparklineContainer}>
                <h3>Performance Trend</h3>
                <div className={styles.performanceChart}>
                  <Sparkline data={sparklineData} />
                  {sparklineData.length > 0 && (
                    <div className={styles.performanceSummary}>
                      <div className={styles.performanceStat}>
                        <span className={styles.statLabel}>Total Points</span>
                        <span className={styles.statValue}>
                          {sparklineData.reduce((sum, points) => sum + points, 0)}
                        </span>
                      </div>
                      <div className={styles.performanceStat}>
                        <span className={styles.statLabel}>Highest</span>
                        <span className={styles.statValue}>
                          {Math.max(...sparklineData)}
                        </span>
                      </div>
                      <div className={styles.performanceStat}>
                        <span className={styles.statLabel}>Average</span>
                        <span className={styles.statValue}>
                          {Math.round(sparklineData.reduce((sum, points) => sum + points, 0) / sparklineData.length)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
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
                        <td>{stat.rank || 'N/A'}</td>
                        <td>{stat.transferWindowId ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className={styles.noStats}>
              <p>No weekly stats available yet. Your performance will appear here after matches are played.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default withAuth(UserProfilePage);
