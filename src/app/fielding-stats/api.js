import { db } from "../../firebase";
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  setDoc, 
  runTransaction 
} from "firebase/firestore";
import { PointService } from "@/app/services/pointService";

// Fetch matches for dropdown
export async function getMatches() {
  try {
    const matchesRef = collection(db, "matches");
    const matchesQuery = query(matchesRef);
    const snapshot = await getDocs(matchesQuery);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        team1: data.matchInfo?.team1?.teamName || "Team 1",
        team2: data.matchInfo?.team2?.teamName || "Team 2",
        date: new Date(data.matchInfo?.startDate).toLocaleDateString() || "Unknown Date"
      };
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    throw error;
  }
}

// Get all players who have existing playerPoints entries
export async function getPlayersWithPoints() {
  try {
    const pointsRef = collection(db, "playerPoints");
    const snapshot = await getDocs(pointsRef);
    
    // Create a map to track unique players
    const playerMap = new Map();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.playerId && !playerMap.has(data.playerId)) {
        const playerName = data.performance?.name || data.playerId;
        playerMap.set(data.playerId, {
          id: data.playerId,
          name: playerName
        });
      }
    });
    
    return Array.from(playerMap.values());
  } catch (error) {
    console.error("Error fetching players:", error);
    throw error;
  }
}

// Get all matches for a specific player
export async function getPlayerMatches(playerId) {
  try {
    const pointsRef = collection(db, "playerPoints");
    const pointsQuery = query(pointsRef, where("playerId", "==", playerId));
    const snapshot = await getDocs(pointsQuery);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const docId = doc.id;
      // The standard format for playerPoints documents is "${playerId}_${matchId}"
      const matchId = docId.split('_')[1];
      
      return {
        id: matchId,
        docId: docId,
        matchInfo: `Match ID: ${matchId}`,
        date: new Date(data.timestamp || Date.now()).toLocaleDateString(),
        existingFielding: data.performance?.fielding || false
      };
    });
  } catch (error) {
    console.error("Error fetching player matches:", error);
    throw error;
  }
}
// Fetch players for a specific match
export async function getPlayersForMatch(matchId) {
  try {
    const matchRef = doc(db, "matches", matchId);
    const matchDoc = await getDoc(matchRef);
    
    if (!matchDoc.exists()) {
      throw new Error("Match not found");
    }
    
    const matchData = matchDoc.data();
    const team1Players = matchData.scorecard?.team1?.batsmen || [];
    const team2Players = matchData.scorecard?.team2?.batsmen || [];
    
    // Combine players from both teams
    const allPlayers = [...team1Players, ...team2Players];
    
    // Remove duplicates and format
    const uniquePlayers = [];
    const playerIds = new Set();
    
    allPlayers.forEach(player => {
      if (player.name) {
        const playerId = PointService.createPlayerDocId(player.name);
        if (!playerIds.has(playerId)) {
          playerIds.add(playerId);
          uniquePlayers.push({
            id: playerId,
            name: player.name
          });
        }
      }
    });
    
    return uniquePlayers;
  } catch (error) {
    console.error("Error fetching players:", error);
    throw error;
  }
}

// Update fielding stats directly on a playerPoints document
export async function updateFieldingStats(docId, fieldingStats) {
  try {
    const pointsDocRef = doc(db, "playerPoints", docId);
    const docSnapshot = await getDoc(pointsDocRef);
    
    if (!docSnapshot.exists()) {
      throw new Error("PlayerPoints record not found");
    }
    
    const data = docSnapshot.data();
    const existingPerformance = data.performance || {};
    
    // Calculate fielding points
    const fieldingPoints = 
      (fieldingStats.catches * PointService.POINTS.FIELDING.CATCH) +
      (fieldingStats.stumpings * PointService.POINTS.FIELDING.STUMPING) +
      (fieldingStats.runouts * PointService.POINTS.FIELDING.DIRECT_THROW);
    
    // Calculate points difference if fielding already exists
    const existingFieldingPoints = 
      ((existingPerformance.catches || 0) * PointService.POINTS.FIELDING.CATCH) +
      ((existingPerformance.stumpings || 0) * PointService.POINTS.FIELDING.STUMPING) +
      ((existingPerformance.runouts || 0) * PointService.POINTS.FIELDING.DIRECT_THROW);
    
    const pointsDifference = fieldingPoints - existingFieldingPoints;
    
    // Update the document
    await setDoc(pointsDocRef, {
      ...data,
      points: (data.points || 0) + pointsDifference,
      performance: {
        ...existingPerformance,
        fielding: true,
        catches: fieldingStats.catches,
        stumpings: fieldingStats.stumpings,
        runouts: fieldingStats.runouts
      }
    });
    
    return true;
  } catch (error) {
    console.error("Error updating fielding stats:", error);
    throw error;
  }
}
