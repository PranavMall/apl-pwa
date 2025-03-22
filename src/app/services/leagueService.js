import { db } from '../../firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';

export class LeagueService {
  // Create a new private league
  static async createLeague(leagueName, creatorUserId, invitedUserIds = []) {
    try {
      // Generate a unique ID for the league
      const leagueId = `league_${Date.now()}_${creatorUserId.substring(0, 5)}`;
      
      // Create league document
      await setDoc(doc(db, 'leagues', leagueId), {
        name: leagueName,
        creatorId: creatorUserId,
        members: [creatorUserId], // Creator is automatically a member
        pendingInvites: invitedUserIds,
        createdAt: serverTimestamp(),
      });

      // Create league invitations for each invited user
      for (const userId of invitedUserIds) {
        await setDoc(doc(db, 'leagueInvites', `${leagueId}_${userId}`), {
          leagueId,
          leagueName,
          invitedBy: creatorUserId,
          userId,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }

      return { success: true, leagueId };
    } catch (error) {
      console.error('Error creating league:', error);
      return { success: false, error: error.message };
    }
  }

  static async addMembersToLeague(leagueId, leagueName, creatorUserId, invitedUserIds = []) {
    try {
      // Verify the user is the creator
      const leagueRef = doc(db, 'leagues', leagueId);
      const leagueDoc = await getDoc(leagueRef);
      
      if (!leagueDoc.exists()) {
        return { success: false, error: 'League not found' };
      }
      
      const leagueData = leagueDoc.data();
      
      if (leagueData.creatorId !== creatorUserId) {
        return { success: false, error: 'Only the league creator can add members' };
      }
      
      // Filter out users who are already members or have pending invites
      const existingMembers = leagueData.members || [];
      const existingPendingInvites = leagueData.pendingInvites || [];
      
      const newInvitees = invitedUserIds.filter(
        userId => !existingMembers.includes(userId) && !existingPendingInvites.includes(userId)
      );
      
      if (newInvitees.length === 0) {
        return { success: false, error: 'All selected users are already members or have pending invites' };
      }
      
      // Update the league document with new pending invites
      await updateDoc(leagueRef, {
        pendingInvites: arrayUnion(...newInvitees)
      });
      
      // Create league invitations for each new invited user
      for (const userId of newInvitees) {
        await setDoc(doc(db, 'leagueInvites', `${leagueId}_${userId}`), {
          leagueId,
          leagueName,
          invitedBy: creatorUserId,
          userId,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
      
      return { 
        success: true, 
        invitedCount: newInvitees.length,
        message: `Successfully invited ${newInvitees.length} new member(s)`
      };
    } catch (error) {
      console.error('Error adding members to league:', error);
      return { success: false, error: error.message };
    }
  }

  // Get leagues created by a user
  static async getCreatedLeagues(userId) {
    try {
      const leaguesRef = collection(db, 'leagues');
      const q = query(leaguesRef, where('creatorId', '==', userId));
      const snapshot = await getDocs(q);
      
      const leagues = [];
      snapshot.forEach(doc => {
        leagues.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return leagues;
    } catch (error) {
      console.error('Error getting created leagues:', error);
      throw error;
    }
  }

  // Get leagues a user is a member of
  static async getUserLeagues(userId) {
    try {
      const leaguesRef = collection(db, 'leagues');
      const q = query(leaguesRef, where('members', 'array-contains', userId));
      const snapshot = await getDocs(q);
      
      const leagues = [];
      snapshot.forEach(doc => {
        leagues.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return leagues;
    } catch (error) {
      console.error('Error getting user leagues:', error);
      throw error;
    }
  }

  // Get pending league invitations for a user
  static async getPendingInvites(userId) {
    try {
      const invitesRef = collection(db, 'leagueInvites');
      const q = query(
        invitesRef, 
        where('userId', '==', userId),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      
      const invites = [];
      snapshot.forEach(doc => {
        invites.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return invites;
    } catch (error) {
      console.error('Error getting pending invites:', error);
      throw error;
    }
  }

  // Accept a league invitation
  static async acceptInvite(inviteId, leagueId, userId) {
    try {
      // Update the invite status
      const inviteRef = doc(db, 'leagueInvites', inviteId);
      await updateDoc(inviteRef, {
        status: 'accepted',
        respondedAt: serverTimestamp()
      });
      
      // Add user to league members
      const leagueRef = doc(db, 'leagues', leagueId);
      await updateDoc(leagueRef, {
        members: arrayUnion(userId),
        pendingInvites: arrayRemove(userId)
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error accepting invite:', error);
      return { success: false, error: error.message };
    }
  }

  // Decline a league invitation
  static async declineInvite(inviteId, leagueId, userId) {
    try {
      // Update the invite status
      const inviteRef = doc(db, 'leagueInvites', inviteId);
      await updateDoc(inviteRef, {
        status: 'declined',
        respondedAt: serverTimestamp()
      });
      
      // Remove user from pending invites
      const leagueRef = doc(db, 'leagues', leagueId);
      await updateDoc(leagueRef, {
        pendingInvites: arrayRemove(userId)
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error declining invite:', error);
      return { success: false, error: error.message };
    }
  }

  // Get league leaderboard
  static async getLeagueLeaderboard(leagueId) {
    try {
      // Get the league document to get member IDs
      const leagueRef = doc(db, 'leagues', leagueId);
      const leagueDoc = await getDoc(leagueRef);
      
      if (!leagueDoc.exists()) {
        throw new Error('League not found');
      }
      
      const leagueData = leagueDoc.data();
      const memberIds = leagueData.members || [];
      
      if (memberIds.length === 0) {
        return [];
      }
      
      // Get user data for each member
      const usersData = [];
      for (const userId of memberIds) {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          usersData.push({
            id: userId,
            name: userData.name || 'Unknown',
            teamName: userData.teamName || 'Unknown Team',
            photoURL: userData.photoURL,
            totalPoints: userData.totalPoints || 0,
            rank: userData.rank || 0
          });
        }
      }
      
      // Sort by total points (descending)
      usersData.sort((a, b) => b.totalPoints - a.totalPoints);
      
      // Assign league ranks
      usersData.forEach((user, index) => {
        user.leagueRank = index + 1;
      });
      
      return usersData;
    } catch (error) {
      console.error('Error getting league leaderboard:', error);
      throw error;
    }
  }

  // Delete a league (only if you're the creator)
  static async deleteLeague(leagueId, userId) {
    try {
      // Verify the user is the creator
      const leagueRef = doc(db, 'leagues', leagueId);
      const leagueDoc = await getDoc(leagueRef);
      
      if (!leagueDoc.exists()) {
        return { success: false, error: 'League not found' };
      }
      
      const leagueData = leagueDoc.data();
      
      if (leagueData.creatorId !== userId) {
        return { success: false, error: 'Only the league creator can delete a league' };
      }
      
      // Delete the league
      await deleteDoc(leagueRef);
      
      // Delete any pending invites for this league
      const invitesRef = collection(db, 'leagueInvites');
      const q = query(invitesRef, where('leagueId', '==', leagueId));
      const snapshot = await getDocs(q);
      
      const deletePromises = [];
      snapshot.forEach(doc => {
        deletePromises.push(deleteDoc(doc.ref));
      });
      
      await Promise.all(deletePromises);
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting league:', error);
      return { success: false, error: error.message };
    }
  }

  // Search for users to invite (by team name or username)
  static async searchUsers(searchTerm) {
    try {
      if (!searchTerm || searchTerm.length < 3) {
        return [];
      }
      
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      
      const users = [];
      snapshot.forEach(doc => {
        const userData = doc.data();
        
        // Skip users without team names
        if (!userData.teamName) return;
        
        // Match by team name or user name (case insensitive)
        const searchTermLower = searchTerm.toLowerCase();
        const teamNameMatch = userData.teamName.toLowerCase().includes(searchTermLower);
        const nameMatch = (userData.name || '').toLowerCase().includes(searchTermLower);
        
        if (teamNameMatch || nameMatch) {
          users.push({
            id: doc.id,
            name: userData.name || 'Unknown',
            teamName: userData.teamName,
            photoURL: userData.photoURL
          });
        }
      });
      
      return users;
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }
}
