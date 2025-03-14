// playerMasterService.js
import { db } from '../../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';

export class PlayerMasterService {
  // Create or update player in master DB
  static async upsertPlayer(playerData) {
    try {
      const { id, name, alternateIds, role, team } = playerData;
      const playerRef = doc(db, 'playersMaster', id);
      
      // Check if player exists
      const playerDoc = await getDoc(playerRef);
      const existingData = playerDoc.exists() ? playerDoc.data() : null;
      
      // Prepare player data
      const updatedData = {
        id,
        name,
        alternateIds: alternateIds || [],
        role: role || 'unknown',
        team: team || 'unknown',
        active: true,
        stats: existingData?.stats || {
          matches: 0,
          runs: 0,
          wickets: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
          fifties: 0,
          hundreds: 0,
          points: 0,
          // Add other stats as needed
        },
        lastUpdated: new Date().toISOString()
      };
      
      // Merge with existing data
      await setDoc(playerRef, updatedData, { merge: true });
      return { success: true, id };
    } catch (error) {
      console.error('Error upserting player:', error);
      throw error;
    }
  }
  
  // Find player by any ID (primary or alternate)
  static async findPlayerByAnyId(playerId) {
    try {
      // First check if this is a primary ID
      const primaryRef = doc(db, 'playersMaster', playerId);
      const primaryDoc = await getDoc(primaryRef);
      
      if (primaryDoc.exists()) {
        return primaryDoc.data();
      }
      
      // If not, check alternate IDs
      const playersRef = collection(db, 'playersMaster');
      const q = query(playersRef, where('alternateIds', 'array-contains', playerId));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        return snapshot.docs[0].data();
      }
      
      return null; // Player not found
    } catch (error) {
      console.error('Error finding player:', error);
      throw error;
    }
  }
  
  // Update player stats from a match
static async updatePlayerStats(playerId, matchStats) {
  try {
    // Find player regardless of which ID was used
    const player = await this.findPlayerByAnyId(playerId);
    
    if (!player) {
      console.error(`Player not found with ID: ${playerId}`);
      return { success: false, error: 'Player not found' };
    }
    
    // Update the player with primary ID
    const primaryId = player.id;
    const playerRef = doc(db, 'playersMaster', primaryId);
    
    // Get current stats and processed matches
    const currentStats = player.stats || {};
    const processedMatches = player.processedMatches || [];
    
    // Check if this match has already been processed
    if (matchStats.matchId && processedMatches.includes(matchStats.matchId)) {
      console.log(`Match ${matchStats.matchId} already processed for player ${primaryId}, skipping update`);
      return { success: true, id: primaryId, skipped: true };
    }
    
    // Calculate updated stats by adding new values to existing ones
    const updatedStats = {
      matches: (currentStats.matches || 0) + (matchStats.isNewMatch ? 1 : 0),
      battingRuns: (currentStats.battingRuns || 0) + (matchStats.battingRuns || 0),
      bowlingRuns: (currentStats.bowlingRuns || 0) + (matchStats.bowlingRuns || 0),
      wickets: (currentStats.wickets || 0) + (matchStats.wickets || 0),
      catches: (currentStats.catches || 0) + (matchStats.catches || 0),
      stumpings: (currentStats.stumpings || 0) + (matchStats.stumpings || 0),
      runOuts: (currentStats.runOuts || 0) + (matchStats.runOuts || 0),
      points: (currentStats.points || 0) + (matchStats.points || 0),
      fifties: (currentStats.fifties || 0) + (matchStats.fifties || 0),
      hundreds: (currentStats.hundreds || 0) + (matchStats.hundreds || 0),
      fours: (currentStats.fours || 0) + (matchStats.fours || 0),
      sixes: (currentStats.sixes || 0) + (matchStats.sixes || 0)
    };
    
    // Update processed matches array to prevent duplicate processing
    const updatedProcessedMatches = matchStats.matchId 
      ? [...(processedMatches || []), matchStats.matchId]
      : processedMatches;
    
    // Update player document
    await setDoc(playerRef, {
      stats: updatedStats,
      processedMatches: updatedProcessedMatches,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    return { success: true, id: primaryId };
  } catch (error) {
    console.error('Error updating player stats:', error);
    throw error;
  }
}

  static async mapAndMergePlayerIds(primaryId, alternateIds) {
  try {
    console.log(`Starting mapping and merging: Primary ID ${primaryId}, Alternate IDs: ${alternateIds.join(', ')}`);
    
    // Step 1: Find the primary player
    const playerRef = doc(db, 'playersMaster', primaryId);
    const playerDoc = await getDoc(playerRef);
    
    if (!playerDoc.exists()) {
      console.error(`Primary player ${primaryId} not found`);
      return { success: false, error: 'Primary player not found' };
    }
    
    // Step 2: Get the player data and existing alternate IDs
    const player = playerDoc.data();
    const existingAlternates = player.alternateIds || [];
    
    // Step 3: Add new alternate IDs (avoid duplicates)
    const newAlternateIds = alternateIds.filter(id => !existingAlternates.includes(id));
    console.log(`Adding ${newAlternateIds.length} new alternate IDs`);
    
    if (newAlternateIds.length === 0) {
      console.log('No new alternate IDs to add');
      return { 
        success: true, 
        id: primaryId, 
        message: 'No new alternate IDs to add'
      };
    }
    
    const updatedAlternates = [...existingAlternates, ...newAlternateIds];
    
    // Step 4: Update the player document with new alternate IDs
    await setDoc(playerRef, {
      alternateIds: updatedAlternates,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log(`Updated alternate IDs for ${primaryId}`);
    
    // Step 5: Reset player stats for clean recalculation
    await setDoc(playerRef, {
      stats: {
        matches: 0,
        battingRuns: 0,
        bowlingRuns: 0,
        wickets: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        fifties: 0,
        hundreds: 0,
        fours: 0,
        sixes: 0,
        points: 0
      },
      processedMatches: [],
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    
    console.log(`Reset stats for ${primaryId}`);
    
    // Step 6: Gather all player point entries for primary and all alternate IDs
    const allIds = [primaryId, ...updatedAlternates];
    let totalEntries = 0;
    const processedMatches = new Set();
    
    // Process each ID and get its points entries
    for (const id of allIds) {
      console.log(`Processing entries for ID: ${id}`);
      
      const pointsRef = collection(db, 'playerPoints');
      const q = query(pointsRef, where('playerId', '==', id));
      const snapshot = await getDocs(q);
      
      // Sort entries by timestamp to process in chronological order
      const entries = [];
      snapshot.forEach(doc => {
        entries.push(doc.data());
      });
      
      entries.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return aTime - bTime;
      });
      
      console.log(`Found ${entries.length} entries for ID ${id}`);
      totalEntries += entries.length;
      
      // Process each entry to update player stats
      for (const entry of entries) {
        const { matchId, performance, points } = entry;
        
        // Skip if we've already processed this match for this player
        // This prevents double-counting if the same match is recorded under multiple IDs
        if (processedMatches.has(matchId)) {
          console.log(`Skipping duplicate match ${matchId} for player ${id}`);
          continue;
        }
        
        // Extract stats from performance
        const matchStats = {
          matchId,
          isNewMatch: true,
          battingRuns: performance?.batting ? parseInt(performance.runs || 0) : 0,
          bowlingRuns: performance?.bowling ? parseInt(performance.bowler_runs || 0) : 0,
          wickets: performance?.bowling ? parseInt(performance.wickets || 0) : 0,
          catches: parseInt(performance?.catches || 0),
          stumpings: parseInt(performance?.stumpings || 0),
          runOuts: parseInt(performance?.runouts || 0),
          points: points || 0,
          fifties: performance?.batting && parseInt(performance.runs || 0) >= 50 && parseInt(performance.runs || 0) < 100 ? 1 : 0,
          hundreds: performance?.batting && parseInt(performance.runs || 0) >= 100 ? 1 : 0,
          fours: performance?.batting ? parseInt(performance.fours || 0) : 0,
          sixes: performance?.batting ? parseInt(performance.sixes || 0) : 0
        };
        
        // Update player stats using existing method
        await this.updatePlayerStats(primaryId, matchStats);
        
        // Mark as processed
        processedMatches.add(matchId);
      }
    }
    
    console.log(`Completed processing ${totalEntries} entries for ${allIds.length} IDs`);
    console.log(`Updated stats for ${processedMatches.size} unique matches`);
    
    return {
      success: true,
      id: primaryId,
      alternateIdsAdded: newAlternateIds,
      entriesProcessed: totalEntries,
      uniqueMatches: processedMatches.size
    };
  } catch (error) {
    console.error(`Error mapping and merging player IDs (${primaryId}):`, error);
    throw error;
  }
}
  
  // Sync player data from playerPoints collection
  static async syncPlayerFromPoints(matchId, pointsData) {
    try {
      const { playerId, performance } = pointsData;
      
      if (!playerId || !performance) {
        console.error('Invalid points data', pointsData);
        return { success: false, error: 'Invalid points data' };
      }
      
      // Check if this player exists in master DB
      let player = await this.findPlayerByAnyId(playerId);
      
      // If player doesn't exist, create a new entry
      if (!player) {
        const playerName = performance.name || playerId;
        await this.upsertPlayer({
          id: playerId,
          name: playerName,
          alternateIds: []
        });
        player = { id: playerId, name: playerName };
      }
      
      // Extract match stats from performance
      const matchStats = {
        isNewMatch: true, // Assuming this is a new match for the player
        runs: performance.runs || 0,
        wickets: performance.wickets || 0,
        catches: performance.catches || 0,
        stumpings: performance.stumpings || 0,
        runOuts: performance.runOuts || 0,
        points: performance.points || 0
      };
      
      // Update player stats
      await this.updatePlayerStats(player.id, matchStats);
      
      return { success: true, id: player.id };
    } catch (error) {
      console.error('Error syncing player from points:', error);
      throw error;
    }
  }
  
  // Map players with similar names
  static async mapRelatedPlayers(primaryId, alternateIds) {
    try {
      const playerRef = doc(db, 'playersMaster', primaryId);
      const playerDoc = await getDoc(playerRef);
      
      if (!playerDoc.exists()) {
        console.error(`Primary player ${primaryId} not found`);
        return { success: false, error: 'Primary player not found' };
      }
      
      const player = playerDoc.data();
      const existingAlternates = player.alternateIds || [];
      
      // Add new alternate IDs
      const updatedAlternates = [
        ...new Set([...existingAlternates, ...alternateIds])
      ];
      
      // Update player document
      await setDoc(playerRef, {
        alternateIds: updatedAlternates,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      return { success: true, id: primaryId };
    } catch (error) {
      console.error('Error mapping related players:', error);
      throw error;
    }
  }

  static async batchImportPlayers(players) {
  try {
    const batch = writeBatch(db);
    let count = 0;
    
    for (const player of players) {
      const playerRef = doc(db, 'playersMaster', player.id);
      batch.set(playerRef, player);
      count++;
    }
    
    await batch.commit();
    return { success: true, count };
  } catch (error) {
    console.error('Error batch importing players:', error);
    throw error;
  }
}
  
  // Add functionality to rebuild player stats from scratch
  static async rebuildPlayerStats(playerId) {
    try {
      // Find player
      const player = await this.findPlayerByAnyId(playerId);
      
      if (!player) {
        console.error(`Player not found with ID: ${playerId}`);
        return { success: false, error: 'Player not found' };
      }
      
      const primaryId = player.id;
      
      // Get all IDs to search for
      const allPlayerIds = [primaryId, ...(player.alternateIds || [])];
      
      // Reset stats
      const resetStats = {
        matches: 0,
        runs: 0,
        wickets: 0,
        catches: 0,
        stumpings: 0,
        runOuts: 0,
        fifties: 0,
        points: 0,
        hundreds: 0
      };
      
      await setDoc(doc(db, 'playersMaster', primaryId), {
        stats: resetStats,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      
      // Find all player points entries for this player
      const pointsEntries = [];
      
      for (const id of allPlayerIds) {
        const pointsRef = collection(db, 'playerPoints');
        const q = query(pointsRef, where('playerId', '==', id));
        const snapshot = await getDocs(q);
        
        snapshot.forEach(doc => {
          pointsEntries.push({
            id: doc.id,
            ...doc.data()
          });
        });
      }
      
      // Sort by match/timestamp to process in chronological order
      pointsEntries.sort((a, b) => {
        return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
      });
      
      // Process each entry to rebuild stats
      const processedMatches = new Set();
      
      for (const entry of pointsEntries) {
        const { matchId, performance } = entry;
        
        // Only count each match once for match count
        const isNewMatch = !processedMatches.has(matchId);
        if (isNewMatch) {
          processedMatches.add(matchId);
        }
        
        // Extract stats from performance
        const matchStats = {
          isNewMatch,
          runs: performance?.runs || 0,
          wickets: performance?.wickets || 0,
          catches: performance?.catches || 0,
          stumpings: performance?.stumpings || 0,
          runOuts: performance?.runOuts || 0,
          points: performance?.points || 0
        };
        
        // Update player stats
        await this.updatePlayerStats(primaryId, matchStats);
      }
      
      return {
        success: true,
        id: primaryId,
        entriesProcessed: pointsEntries.length,
        uniqueMatches: processedMatches.size
      };
    } catch (error) {
      console.error('Error rebuilding player stats:', error);
      throw error;
    }
  }
}
