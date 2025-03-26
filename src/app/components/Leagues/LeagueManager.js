"use client";

import React, { useState, useEffect } from 'react';
import { LeagueService } from '@/app/services/leagueService';
import styles from './LeagueManager.module.css';
import { collection, query, getDocs, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

const LeagueManager = ({ userId, userName }) => {
  const [activeTab, setActiveTab] = useState('myLeagues');
  const [leagues, setLeagues] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [addMembersToLeagueId, setAddMembersToLeagueId] = useState(null);
  
  // Create League form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searching, setSearching] = useState(false);
  
  // Leaderboard view state
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Load leagues and invites
  useEffect(() => {
    fetchUserLeagues();
    fetchPendingInvites();
  }, [userId]);

  // User search effect
  useEffect(() => {
    const delaySearch = setTimeout(() => {
      if (searchTerm.length >= 3) {
        searchUsers();
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delaySearch);
  }, [searchTerm]);

  const fetchUserLeagues = async () => {
    try {
      setLoading(true);
      const userLeagues = await LeagueService.getUserLeagues(userId);
      setLeagues(userLeagues);
    } catch (error) {
      console.error('Error fetching leagues:', error);
      setError('Failed to load leagues. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvites = async () => {
    try {
      const pendingInvites = await LeagueService.getPendingInvites(userId);
      setInvites(pendingInvites);
    } catch (error) {
      console.error('Error fetching invites:', error);
    }
  };

  const searchUsers = async () => {
    try {
      setSearching(true);
      const results = await LeagueService.searchUsers(searchTerm);
      // Filter out current user
      const filteredResults = results.filter(user => user.id !== userId);
      setSearchResults(filteredResults);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    
    if (!leagueName.trim()) {
      setMessage({ text: 'Please enter a league name', type: 'error' });
      return;
    }
    
    try {
      setMessage({ text: 'Creating league...', type: 'info' });
      
      const invitedUserIds = selectedUsers.map(user => user.id);
      const result = await LeagueService.createLeague(leagueName, userId, invitedUserIds);
      
      if (result.success) {
        setMessage({ text: 'League created successfully!', type: 'success' });
        
        // Reset form
        setLeagueName('');
        setSelectedUsers([]);
        setSearchTerm('');
        setSearchResults([]);
        setShowCreateForm(false);
        
        // Refresh leagues
        fetchUserLeagues();
      } else {
        setMessage({ text: result.error || 'Failed to create league', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Error creating league. Please try again.', type: 'error' });
      console.error('Error creating league:', error);
    }
  };

  const handleAddMembers = async (e, leagueId, leagueName) => {
    e.preventDefault();
    
    if (selectedUsers.length === 0) {
      setMessage({ text: 'Please select at least one user to invite', type: 'error' });
      return;
    }
    
    try {
      setMessage({ text: 'Sending invitations...', type: 'info' });
      
      const invitedUserIds = selectedUsers.map(user => user.id);
      const result = await LeagueService.addMembersToLeague(leagueId, leagueName, userId, invitedUserIds);
      
      if (result.success) {
        setMessage({ 
          text: `Successfully invited ${result.invitedCount} new member(s) to the league!`, 
          type: 'success' 
        });
        
        // Reset form
        setSelectedUsers([]);
        setSearchTerm('');
        setSearchResults([]);
        setAddMembersToLeagueId(null);
        
        // Refresh leagues
        fetchUserLeagues();
      } else {
        setMessage({ text: result.error || 'Failed to invite members', type: 'error' });
      }
    } catch (error) {
      setMessage({ text: 'Error inviting members. Please try again.', type: 'error' });
      console.error('Error inviting members:', error);
    }
  };

  const handleAcceptInvite = async (invite) => {
    try {
      const result = await LeagueService.acceptInvite(invite.id, invite.leagueId, userId);
      
      if (result.success) {
        setInvites(prevInvites => prevInvites.filter(i => i.id !== invite.id));
        fetchUserLeagues(); // Refresh leagues list
        setMessage({ text: `You've joined ${invite.leagueName}!`, type: 'success' });
      } else {
        setMessage({ text: result.error || 'Failed to accept invite', type: 'error' });
      }
    } catch (error) {
      console.error('Error accepting invite:', error);
      setMessage({ text: 'Error accepting invite. Please try again.', type: 'error' });
    }
  };

  const handleDeclineInvite = async (invite) => {
    try {
      const result = await LeagueService.declineInvite(invite.id, invite.leagueId, userId);
      
      if (result.success) {
        setInvites(prevInvites => prevInvites.filter(i => i.id !== invite.id));
        setMessage({ text: 'Invitation declined', type: 'info' });
      } else {
        setMessage({ text: result.error || 'Failed to decline invite', type: 'error' });
      }
    } catch (error) {
      console.error('Error declining invite:', error);
      setMessage({ text: 'Error declining invite. Please try again.', type: 'error' });
    }
  };

  const handleDeleteLeague = async (leagueId) => {
    if (!confirm('Are you sure you want to delete this league? This action cannot be undone.')) {
      return;
    }
    
    try {
      const result = await LeagueService.deleteLeague(leagueId, userId);
      
      if (result.success) {
        setLeagues(prevLeagues => prevLeagues.filter(league => league.id !== leagueId));
        setMessage({ text: 'League deleted successfully', type: 'success' });
        
        // If viewing this league's leaderboard, reset view
        if (selectedLeague?.id === leagueId) {
          setSelectedLeague(null);
          setLeaderboardData([]);
        }
      } else {
        setMessage({ text: result.error || 'Failed to delete league', type: 'error' });
      }
    } catch (error) {
      console.error('Error deleting league:', error);
      setMessage({ text: 'Error deleting league. Please try again.', type: 'error' });
    }
  };

  const handleViewLeaderboard = async (league) => {
    setSelectedLeague(league);
    setActiveTab('leaderboard');
    
    try {
      setLoadingLeaderboard(true);
      const leaderboard = await LeagueService.getLeagueLeaderboard(league.id);
      setLeaderboardData(leaderboard);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      setMessage({ text: 'Failed to load leaderboard. Please try again.', type: 'error' });
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const addUser = (user) => {
    // Check if user is already selected
    if (!selectedUsers.some(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
      setSearchTerm('');
      setSearchResults([]);
    }
  };

  const removeUser = (userId) => {
    setSelectedUsers(selectedUsers.filter(user => user.id !== userId));
  };

  return (
    <div className={styles.leagueContainer}>
      {message.text && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}
      
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'myLeagues' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('myLeagues')}
        >
          My Leagues
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'invites' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('invites')}
        >
          Invites {invites.length > 0 && <span className={styles.badge}>{invites.length}</span>}
        </button>
        {selectedLeague && (
          <button 
            className={`${styles.tab} ${activeTab === 'leaderboard' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            {selectedLeague.name} Leaderboard
          </button>
        )}
      </div>
      
      {activeTab === 'myLeagues' && (
        <div className={styles.leaguesTab}>
          <div className={styles.leagueActions}>
            <button 
              className={styles.createButton}
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? 'Cancel' : 'Create League'}
            </button>
          </div>
          
          {showCreateForm && (
            <div className={styles.createForm}>
              <h3>Create New League</h3>
              <form onSubmit={handleCreateLeague}>
                <div className={styles.formGroup}>
                  <label htmlFor="leagueName">League Name</label>
                  <input
                    id="leagueName"
                    type="text"
                    value={leagueName}
                    onChange={(e) => setLeagueName(e.target.value)}
                    placeholder="Enter league name"
                    className={styles.input}
                    required
                  />
                </div>
                
                <div className={styles.formGroup}>
                  <label>Invite Users</label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name or team name (min 3 characters)"
                    className={styles.input}
                  />
                  
                  {searching && <div className={styles.searchingMessage}>Searching users...</div>}
                  
                  {searchResults.length > 0 && (
                    <div className={styles.searchResults}>
                      {searchResults.map(user => (
                        <div 
                          key={user.id} 
                          className={styles.searchResultItem}
                          onClick={() => addUser(user)}
                        >
                          <div className={styles.userInfo}>
                            <div className={styles.userName}>{user.name}</div>
                            <div className={styles.teamName}>{user.teamName}</div>
                          </div>
                          <button type="button" className={styles.addButton}>+</button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {selectedUsers.length > 0 && (
                    <div className={styles.selectedUsers}>
                      <label>Selected Users:</label>
                      <div className={styles.userChips}>
                        {selectedUsers.map(user => (
                          <div key={user.id} className={styles.userChip}>
                            <span>{user.name} ({user.teamName})</span>
                            <button 
                              type="button" 
                              className={styles.removeButton}
                              onClick={() => removeUser(user.id)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                <button type="submit" className={styles.submitButton}>Create League</button>
              </form>
            </div>
          )}
          
          {loading ? (
            <div className={styles.loading}>Loading leagues...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : leagues.length === 0 ? (
            <div className={styles.emptyState}>
              <p>You haven't joined any leagues yet.</p>
              <p>Create a league to compete with friends!</p>
            </div>
          ) : (
            <div className={styles.leaguesList}>
              {leagues.map(league => (
                <div key={league.id} className={styles.leagueCard}>
                  <div className={styles.leagueInfo}>
                    <h3 className={styles.leagueName}>{league.name}</h3>
                    <div className={styles.leagueStats}>
                      <span>{league.members.length} Members</span>
                      {league.creatorId === userId && (
                        <span className={styles.ownerBadge}>Owner</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.leagueActions}>
                    <button 
                      className={styles.viewButton}
                      onClick={() => handleViewLeaderboard(league)}
                    >
                      View Leaderboard
                    </button>
                    {league.creatorId === userId && (
                      <>
                        <button 
                          className={styles.addMembersButton}
                          onClick={() => setAddMembersToLeagueId(league.id)}
                        >
                          Add Members
                        </button>
                        <button 
                          className={styles.deleteButton}
                          onClick={() => handleDeleteLeague(league.id)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              
              {addMembersToLeagueId && (
                <div className={styles.createForm}>
                  <h3>Add Members to League</h3>
                  <form onSubmit={(e) => {
                    const league = leagues.find(l => l.id === addMembersToLeagueId);
                    handleAddMembers(e, addMembersToLeagueId, league.name);
                  }}>
                    <div className={styles.formGroup}>
                      <label>Invite Users</label>
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by name or team name (min 3 characters)"
                        className={styles.input}
                      />
                      
                      {searching && <div className={styles.searchingMessage}>Searching users...</div>}
                      
                      {searchResults.length > 0 && (
                        <div className={styles.searchResults}>
                          {searchResults.map(user => (
                            <div 
                              key={user.id} 
                              className={styles.searchResultItem}
                              onClick={() => addUser(user)}
                            >
                              <div className={styles.userInfo}>
                                <div className={styles.userName}>{user.name}</div>
                                <div className={styles.teamName}>{user.teamName}</div>
                              </div>
                              <button type="button" className={styles.addButton}>+</button>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {selectedUsers.length > 0 && (
                        <div className={styles.selectedUsers}>
                          <label>Selected Users:</label>
                          <div className={styles.userChips}>
                            {selectedUsers.map(user => (
                              <div key={user.id} className={styles.userChip}>
                                <span>{user.name} ({user.teamName})</span>
                                <button 
                                  type="button" 
                                  className={styles.removeButton}
                                  onClick={() => removeUser(user.id)}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className={styles.formButtons}>
                      <button 
                        type="button" 
                        className={styles.cancelButton}
                        onClick={() => {
                          setAddMembersToLeagueId(null);
                          setSelectedUsers([]);
                          setSearchTerm('');
                          setSearchResults([]);
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className={styles.submitButton}>
                        Add Members
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {activeTab === 'invites' && (
        <div className={styles.invitesTab}>
          {invites.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No pending league invitations.</p>
            </div>
          ) : (
            <div className={styles.invitesList}>
              {invites.map(invite => (
                <div key={invite.id} className={styles.inviteCard}>
                  <div className={styles.inviteInfo}>
                    <h3 className={styles.leagueName}>{invite.leagueName}</h3>
                    <p className={styles.inviteMessage}>
                      You've been invited to join this league!
                    </p>
                  </div>
                  <div className={styles.inviteActions}>
                    <button 
                      className={styles.acceptButton}
                      onClick={() => handleAcceptInvite(invite)}
                    >
                      Accept
                    </button>
                    <button 
                      className={styles.declineButton}
                      onClick={() => handleDeclineInvite(invite)}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {activeTab === 'leaderboard' && selectedLeague && (
        <div className={styles.leaderboardTab}>
          <h3 className={styles.leaderboardTitle}>
            {selectedLeague.name} - Leaderboard
          </h3>
          
          {loadingLeaderboard ? (
            <div className={styles.loading}>Loading leaderboard...</div>
          ) : leaderboardData.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No data available for this league yet.</p>
            </div>
          ) : (
            <div className={styles.leaderboardTable}>
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Team</th>
                    <th>Points</th>
                    <th>Overall Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboardData.map((user) => (
                    <tr 
                      key={user.id} 
                      className={user.id === userId ? styles.currentUser : ''}
                    >
                      <td className={styles.rankColumn}>
                        {user.leagueRank <= 3 ? (
                          <span className={`${styles.topRank} ${styles[`rank${user.leagueRank}`]}`}>
                            {user.leagueRank}
                          </span>
                        ) : (
                          user.leagueRank
                        )}
                      </td>
                      <td className={styles.teamColumn}>
                        <div className={styles.teamInfo}>
                          {user.photoURL ? (
                            <img 
                              src={user.photoURL} 
                              alt="User" 
                              className={styles.userPhoto} 
                            />
                          ) : (
                            <div className={styles.userPhotoPlaceholder}>
                              {user.teamName.charAt(0)}
                            </div>
                          )}
                          <span>{user.teamName}</span>
                          {user.id === userId && <span className={styles.youBadge}>You</span>}
                        </div>
                      </td>
                      <td className={styles.pointsColumn}>
                         {team.totalPoints || 0}
                      </td>
                      <td className={styles.rankColumn}>
                        {user.rank || 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <button 
            className={styles.backButton}
            onClick={() => setActiveTab('myLeagues')}
          >
            Back to My Leagues
          </button>
        </div>
      )}
    </div>
  );
};

export default LeagueManager;
