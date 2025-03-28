// src/app/admin/scripts/migrateTransferHistory.js
// This script migrates existing user teams to the new transfer history collection

import { db } from '../../../firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';

/**
 * Migration script to create transfer history records from existing data
 * Run this BEFORE updating the main application code
 */
export async function migrateTransferHistory() {
  try {
    console.log('Starting transfer history migration...');
    
    // Get active tournament
    const tournament = await getActiveTournament();
    if (!tournament) {
      console.error('No active tournament found');
      return { success: false, error: 'No active tournament found' };
    }
    
    console.log(`Found active tournament: ${tournament.id}`);
    
    // Get all user teams for this tournament
    const userTeamsRef = collection(db, 'userTeams');
    const teamsQuery = query(userTeamsRef, where('tournamentId', '==', tournament.id));
    const teamsSnapshot = await getDocs(teamsQuery);
    
    console.log(`Found ${teamsSnapshot.size} user teams to migrate`);
    
    // Track migration statistics
    const stats = {
      teamsProcessed: 0,
      historyRecordsCreated: 0,
      errors: 0
    };
    
    // Process each user team
    for (const teamDoc of teamsSnapshot.docs) {
      try {
        const teamData = teamDoc.data();
        const userId = teamData.userId;
        
        console.log(`Processing team for user ${userId}...`);
        
        // Get user's weekly stats to determine which weeks they've been active
        const weeklyStatsRef = collection(db, 'userWeeklyStats');
        const weeklyStatsQuery = query(
          weeklyStatsRef,
          where('userId', '==', userId),
          where('tournamentId', '==', tournament.id),
          orderBy('weekNumber', 'asc')
        );
        
        const weeklyStatsSnapshot = await getDocs(weeklyStatsQuery);
        const activeWeeks = new Set();
        
        weeklyStatsSnapshot.forEach(doc => {
          activeWeeks.add(doc.data().weekNumber);
        });
        
        console.log(`User ${userId} has been active in ${activeWeeks.size} weeks`);
        
        // Check if user has a lastTransferWindow record
        const lastTransferWindow = teamData.lastTransferWindow;
        const lastTransferDate = teamData.lastTransferDate;
        
        // Current team players
        const currentPlayers = teamData.players || [];
        
        if (currentPlayers.length === 0) {
          console.log(`User ${userId} has no players in their team, skipping`);
          continue;
        }
        
        // If we have lastTransferWindow info, create a transfer history record for that week
        if (lastTransferWindow && lastTransferWindow.weekNumber) {
          const weekNumber = lastTransferWindow.weekNumber;
          
          console.log(`Creating transfer history record for week ${weekNumber}`);
          
          await createTransferHistoryRecord(
            userId,
            tournament.id,
            weekNumber,
            currentPlayers,
            lastTransferWindow,
            lastTransferDate
          );
          
          stats.historyRecordsCreated++;
        } else {
          // If no lastTransferWindow, create a record for the earliest week
          // with stats or week 1 if no stats exist
          const earliestWeek = activeWeeks.size > 0 ? 
            Math.min(...activeWeeks) : 1;
          
          console.log(`No lastTransferWindow found, creating record for earliest week ${earliestWeek}`);
          
          // Find the transfer window data for this week
          const transferWindow = tournament.transferWindows.find(w => w.weekNumber === earliestWeek);
          
          await createTransferHistoryRecord(
            userId,
            tournament.id,
            earliestWeek,
            currentPlayers,
            transferWindow,
            lastTransferDate || new Date()
          );
          
          stats.historyRecordsCreated++;
        }
        
        // Now, for each active week that doesn't have a transfer history record,
        // copy the most recent transfer history record before that week
        const sortedWeeks = Array.from(activeWeeks).sort((a, b) => a - b);
        
        for (let i = 0; i < sortedWeeks.length; i++) {
          const weekNumber = sortedWeeks[i];
          
          // Skip if we already created a record for this week
          if (weekNumber === lastTransferWindow?.weekNumber) {
            continue;
          }
          
          // Check if this week already has a transfer history record
          const transferHistoryRef = doc(db, 'userTransferHistory', `${userId}_${tournament.id}_${weekNumber}`);
          const transferHistoryDoc = await getDoc(transferHistoryRef);
          
          if (!transferHistoryDoc.exists()) {
            console.log(`Creating transfer history record for week ${weekNumber} based on previous week`);
            
            // Find the most recent transfer history record before this week
            let previousTransferHistoryDoc = null;
            
            for (let j = weekNumber - 1; j > 0; j--) {
              const prevHistoryRef = doc(db, 'userTransferHistory', `${userId}_${tournament.id}_${j}`);
              const prevHistoryDoc = await getDoc(prevHistoryRef);
              
              if (prevHistoryDoc.exists()) {
                previousTransferHistoryDoc = prevHistoryDoc;
                break;
              }
            }
            
            if (previousTransferHistoryDoc) {
              // Copy previous transfer history record
              const prevData = previousTransferHistoryDoc.data();
              
              // Find the transfer window data for this week
              const transferWindow = tournament.transferWindows.find(w => w.weekNumber === weekNumber);
              
              await createTransferHistoryRecord(
                userId,
                tournament.id,
                weekNumber,
                prevData.players,
                transferWindow,
                prevData.transferDate
              );
              
              stats.historyRecordsCreated++;
            } else {
              // If no previous record, use current team
              const transferWindow = tournament.transferWindows.find(w => w.weekNumber === weekNumber);
              
              await createTransferHistoryRecord(
                userId,
                tournament.id,
                weekNumber,
                currentPlayers,
                transferWindow,
                lastTransferDate || new Date()
              );
              
              stats.historyRecordsCreated++;
            }
          }
        }
        
        stats.teamsProcessed++;
      } catch (error) {
        console.error(`Error processing team: ${error.message}`);
        stats.errors++;
      }
    }
    
    console.log('Migration complete!');
    console.log(`Processed ${stats.teamsProcessed} teams`);
    console.log(`Created ${stats.historyRecordsCreated} transfer history records`);
    console.log(`Encountered ${stats.errors} errors`);
    
    return {
      success: true,
      stats
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper function to create a transfer history record
async function createTransferHistoryRecord(userId, tournamentId, weekNumber, players, transferWindow, transferDate) {
  const transferHistoryRef = doc(db, 'userTransferHistory', `${userId}_${tournamentId}_${weekNumber}`);
  
  // Prepare the transfer window data
  let transferWindowData = null;
  
  if (transferWindow) {
    transferWindowData = {
      weekNumber: transferWindow.weekNumber,
      startDate: transferWindow.startDate,
      endDate: transferWindow.endDate
    };
  } else {
    transferWindowData = {
      weekNumber: weekNumber,
      startDate: null,
      endDate: null
    };
  }
  
  // Create the transfer history record
  await setDoc(transferHistoryRef, {
    userId,
    tournamentId,
    weekNumber,
    players,
    transferDate: transferDate || new Date(),
    transferWindow: transferWindowData,
    createdAt: new Date(),
    migrated: true // Flag to indicate this was created by migration
  });
  
  return true;
}

// Helper function to get the active tournament
async function getActiveTournament() {
  try {
    const tournamentsRef = collection(db, 'tournaments');
    
    // Query for tournaments with status 'active'
    const q = query(tournamentsRef, where('status', '==', 'active'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log("No tournament with 'active' status found");
      return null;
    }
    
    const tournamentData = snapshot.docs[0].data();
    const tournamentId = snapshot.docs[0].id;
    
    return {
      id: tournamentId,
      ...tournamentData
    };
  } catch (error) {
    console.error('Error getting active tournament:', error);
    throw error;
  }
}

// UI Component to run the migration
export default function MigrateTransferHistoryPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleMigration = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      
      const migrationResult = await migrateTransferHistory();
      setResult(migrationResult);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>Transfer History Migration</h1>
      <p>
        This tool will migrate your existing user teams to the new transfer history collection.
        This should be run BEFORE updating the main application code.
      </p>
      
      <div className="warning">
        <h3>Warning!</h3>
        <p>
          This migration will create historical records for all user teams.
          Make sure to back up your database before proceeding.
        </p>
      </div>
      
      <button 
        onClick={handleMigration} 
        disabled={loading}
        className="primary-button"
      >
        {loading ? 'Running Migration...' : 'Start Migration'}
      </button>
      
      {result && (
        <div className="result">
          <h3>Migration Complete</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      
      {error && (
        <div className="error">
          <h3>Migration Failed</h3>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
