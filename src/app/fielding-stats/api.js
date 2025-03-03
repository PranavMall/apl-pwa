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
// In page.js, update the useEffect:
useEffect(() => {
  const fetchMatches = async () => {
    try {
      setLoading(true);
      const matchData = await getMatches();
      setMatches(matchData);
    } catch (error) {
      console.error("Error fetching matches:", error);
      setError("Failed to load matches");
    } finally {
      setLoading(false);
    }
  };

  fetchMatches();
}, []);

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

// Update fielding stats for players
export async function updateFieldingStats(matchId, fieldingEntries) {
  try {
    // Process each player's fielding stats
    const updatePromises = fieldingEntries.map(async entry => {
      if (!entry.playerId) return;
      
      const playerId = entry.playerId;
      const pointsDocId = `${playerId}_${matchId}`;
      const pointsDocRef = doc(db, "playerPoints", pointsDocId);
      
      // Calculate fielding points
      const fieldingPoints = 
        (entry.catches * PointService.POINTS.FIELDING.CATCH) +
        (entry.stumpings * PointService.POINTS.FIELDING.STUMPING) +
        (entry.runouts * PointService.POINTS.FIELDING.DIRECT_THROW);
      
      return runTransaction(db, async (transaction) => {
        const pointsDoc = await transaction.get(pointsDocRef);
        
        if (pointsDoc.exists()) {
          // Update existing document
          const data = pointsDoc.data();
          const existingPerformance = data.performance || {};
          const existingFielding = existingPerformance.fielding || false;
          
          // Calculate points difference
          const existingFieldingPoints = 
            ((existingPerformance.catches || 0) * PointService.POINTS.FIELDING.CATCH) +
            ((existingPerformance.stumpings || 0) * PointService.POINTS.FIELDING.STUMPING) +
            ((existingPerformance.runouts || 0) * PointService.POINTS.FIELDING.DIRECT_THROW);
          
          const pointsDifference = fieldingPoints - existingFieldingPoints;
          
          // Update performance data
          const updatedPerformance = {
            ...existingPerformance,
            fielding: true,
            catches: entry.catches,
            stumpings: entry.stumpings,
            runouts: entry.runouts
          };
          
          transaction.update(pointsDocRef, {
            points: data.points + pointsDifference,
            performance: updatedPerformance,
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Create new document
          transaction.set(pointsDocRef, {
            playerId,
            matchId,
            points: fieldingPoints,
            performance: {
              fielding: true,
              catches: entry.catches,
              stumpings: entry.stumpings,
              runouts: entry.runouts
            },
            timestamp: new Date().toISOString()
          });
        }
      });
    });
    
    await Promise.all(updatePromises);
    return true;
  } catch (error) {
    console.error("Error updating fielding stats:", error);
    throw error;
  }
}
