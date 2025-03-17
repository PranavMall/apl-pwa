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
  const [userTeam, setUserTeam] = useState(null);
  const [transferWindow, setTransferWindow] = useState(null);
  const [isTransferActive, setIsTransferActive] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState([]);
  
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
      
      // Get weekly stats
      const weeklyStats = await transferService.getUserWeeklyStats(user.uid);
      setWeeklyStats(weeklyStats);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching team data:', error);
      setLoading(false);
    }
  };
  
  const checkTransferWindow = async () => {
    try {
      const { isActive, window } = await transferService.isTransferWindowActive();
      setIsTransferActive(isActive);
      setTransferWindow(window);
      
      // If transfer window is active, redirect to profile page
      if (isActive) {
        router.push('/profile');
      }
    } catch (error) {
      console.error('Error checking transfer window:', error);
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
  
  if (loading) {
    return <div className={styles.loading}>Loading team data...</div>;
  }
  
  if (!userTeam) {
    return (
      <div className={styles.container}>
        <Card className={styles.noTeamCard}>
          <CardContent>
            <div className={styles.noTeamMessage}>
              <h2>No team selected yet!</h2>
              <p>You haven't created a team for the current tournament.</p>
              {isTransferActive ? (
                <button 
                  className={styles.createTeamButton}
                  onClick={() => router.push('/profile')}
                >
                  Create Team Now
                </button>
              ) : (
                <div className={styles.waitMessage}>
                  <p>The next transfer window opens on {transferWindow ? new Date(transferWindow.startDate).toLocaleDateString() : 'soon'}.</p>
                  <p>You'll be able to create your team then.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const groupedPlayers = groupPlayersByRole(userTeam.players || []);
  
  // Find captain and vice-captain
  const captain = userTeam.players.find(p => p.isCaptain);
  const viceCaptain = userTeam.players.find(p => p.isViceCaptain);
  
  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>My Team</h1>
      {transferWindow && (
        <div className={styles.transferInfo}>
        <h3>Transfer Window Status</h3>
        <div className={styles.transferStatus}>
      {isTransferActive ? (
        <div className={styles.activeWindow}>
          <span>Transfer Window Open!</span>
          <button
            className={styles.editTeamButton}
            // Remove the redirect to profile page
            // Just display a message or let them edit directly on this page
            onClick={() => setMessage({ type: 'info', text: 'You can edit your team directly on this page' })}
          >
            Edit Team
          </button>
        </div>
      ) : (
        <div className={styles.inactiveWindow}>
          <span>Transfer Window Closed</span>
          <p>Next window opens on {new Date(transferWindow.startDate).toLocaleDateString()}</p>
        </div>
      )}
      <div className={styles.transfersRemaining}>
        <span>Transfers Remaining: {userTeam.transfersRemaining || 0}</span>
      </div>
    </div>
  </div>
)}

      <div className={styles.teamDisplay}>
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
              {userTeam.players.find(p => p.isCaptain) ? (
                <div className={styles.captainCard}>
                  <span className={styles.captainName}>{userTeam.players.find(p => p.isCaptain).name}</span>
                  <div className={styles.playerDetails}>
                    <span className={styles.roleBadge}>{userTeam.players.find(p => p.isCaptain).role}</span>
                    <span className={styles.teamBadge}>{userTeam.players.find(p => p.isCaptain).team}</span>
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
              {userTeam.players.find(p => p.isViceCaptain) ? (
                <div className={styles.viceCaptainCard}>
                  <span className={styles.captainName}>{userTeam.players.find(p => p.isViceCaptain).name}</span>
                  <div className={styles.playerDetails}>
                    <span className={styles.roleBadge}>{userTeam.players.find(p => p.isViceCaptain).role}</span>
                    <span className={styles.teamBadge}>{userTeam.players.find(p => p.isViceCaptain).team}</span>
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
            {Object.entries(groupPlayersByRole(userTeam.players || [])).map(([role, players]) => (
              <div key={role} className={styles.roleSection}>
                <h3 className={styles.roleTitle}>{role.charAt(0).toUpperCase() + role.slice(1)}s ({players.length})</h3>
                <div className={styles.playersGrid}>
                  {players.map(player => (
                    <div key={player.id} className={styles.playerCard}>
                      <div className={styles.playerName}>{player.name}</div>
                      <div className={styles.playerTeam}>{player.team}</div>
                      {(player.isCaptain || player.isViceCaptain) && (
                        <div className={styles.captainBadge}>
                          {player.isCaptain ? 'C' : 'VC'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {isTransferActive && (
            <div className={styles.editOptions}>
              <button 
                className={styles.editTeamButton}
                onClick={() => router.push('/profile')}
              >
                Edit Team
              </button>
            </div>
          )}
        </>
      ) : (
        <div className={styles.noTeamMessage}>
          <p>You don't have a team yet for the current tournament.</p>
          {isTransferActive && (
            <button 
              className={styles.createTeamButton}
              onClick={() => router.push('/profile')}
            >
              Create Team
            </button>
          )}
        </div>
      )}
    </CardContent>
  </Card>
</div>
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
