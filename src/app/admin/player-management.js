// src/app/admin/player-management.js

export async function mapPlayerIds(primaryId, alternateIds) {
  try {
    const result = await PlayerMasterService.mapRelatedPlayers(primaryId, alternateIds);
    return result;
  } catch (error) {
    console.error('Error mapping player IDs:', error);
    return { success: false, error: error.message };
  }
}

export async function getPlayerList() {
  try {
    const playersRef = collection(db, 'playersMaster');
    const snapshot = await getDocs(playersRef);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error getting player list:', error);
    return [];
  }
}
