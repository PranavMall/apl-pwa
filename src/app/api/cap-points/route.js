// src/app/api/cap-points/route.js
import { NextResponse } from 'next/server';
import { SheetsSyncService } from '@/app/services/sheetsSyncSimple';
import { db } from '../../../firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc,
  arrayUnion,
  deleteDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { transferService } from '@/app/services/transferService';

// Constants
const CAP_POINTS_BONUS = 50; // 50 points for each cap holder

export async function GET(request) {
  try {
    // Extract parameters from request
    const url = new URL(request.url);
    const sheetId = url.searchParams.get('sheetId') || '1G8NTmAzg1NqRpgp4FOBWWzfxf59UyfzbLVCL992hDpM';
    const weekNumber = url.searchParams.get('week');
    
    if (!weekNumber) {
      return NextResponse.json({ 
        success: false, 
        error: 'Week number is required' 
      }, { status: 400 });
    }
    
    // Get active tournament
    const tournament = await transferService.getActiveTournament();
    if (!tournament) {
      return NextResponse.json({ 
        success: false, 
        error: 'No active tournament found' 
      }, { status: 404 });
    }
    
    // Log the start of process
    console.log(`Processing cap points for week ${weekNumber}, tournament ${tournament.id}`);
    const startTime = Date.now();
    
    // Fetch cap holders data from the sheet
    const capData = await SheetsSyncService.fetchCapPointsData(sheetId);
    
    if (!capData || capData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No cap data found in the sheet' 
      }, { status: 404 });
    }
    
    // Filter for the specific week
    const weekCapData = capData.filter(row => 
      row.Week === weekNumber || row.Week === parseInt(weekNumber)
    );
    
    if (weekCapData.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: `No cap data found for week ${weekNumber}` 
      }, { status: 404 });
    }
    
    // Process cap holders
    const orangeCaps = [];
    const purpleCaps = [];
    
    weekCapData.forEach(row => {
      if (row['Orange Cap'] && row['Orange Cap'].trim()) {
        orangeCaps.push(row['Orange Cap'].trim());
      }
      if (row['Purple Cap'] && row['Purple Cap'].trim()) {
        purpleCaps.push(row['Purple Cap'].trim());
      }
    });
    
    console.log(`Found ${orangeCaps.length} Orange Cap and ${purpleCaps.length} Purple Cap holders for week ${weekNumber}`);
    
    // Store cap holders in database
    const capHoldersRef = doc(db, 'capHolders', `${tournament.id}_${weekNumber}`);
    await setDoc(capHoldersRef, {
      tournamentId: tournament.id,
      weekNumber: parseInt(weekNumber),
      orangeCaps,
      purpleCaps,
      processedAt: serverTimestamp()
    });
    
    // Process points for users with cap holders in their teams
    const results = await processCapPointsForUsers(tournament.id, parseInt(weekNumber), orangeCaps, purpleCaps);
    
    // Log performance metrics
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    return NextResponse.json({
      success: true,
      weekNumber: parseInt(weekNumber),
      orangeCaps,
      purpleCaps,
      results,
      processingTime: `${duration.toFixed(2)} seconds`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing cap points:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process cap points', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Process cap points for all users who have the cap holders in their teams
 */
async function processCapPointsForUsers(tournamentId, weekNumber, orangeCaps, purpleCaps) {
  try {
    // Get all user teams for this tournament
    const userTeamsRef = collection(db, 'userTeams');
    const teamsSnapshot = await getDocs(query(userTeamsRef, where('tournamentId', '==', tournamentId)));
    
    if (teamsSnapshot.empty) {
      console.log('No user teams found');
      return { usersProcessed: 0, pointsAwarded: 0 };
    }
    
    let usersProcessed = 0;
    let pointsAwarded = 0;
    
    // Process each user
    for (const teamDoc of teamsSnapshot.docs) {
      const userId = teamDoc.data().userId;
      
      try {
        // Get the user's team for this week from transfer history
        const teamPlayers = await transferService.getTeamForWeek(userId, tournamentId, weekNumber);
        
        if (!teamPlayers || teamPlayers.length === 0) {
          console.log(`No team found for user ${userId} in week ${weekNumber}`);
          continue;
        }
        
        // Check if user has any cap holders in their team
        let userCapPoints = 0;
        const userCapHolders = [];
        
        // Check for Orange Cap holders
        for (const orangeCap of orangeCaps) {
          const hasOrangeCap = teamPlayers.some(player => 
            player.name.toLowerCase() === orangeCap.toLowerCase()
          );
          
          if (hasOrangeCap) {
            userCapPoints += CAP_POINTS_BONUS;
            userCapHolders.push({ player: orangeCap, capType: 'Orange' });
          }
        }
        
        // Check for Purple Cap holders
        for (const purpleCap of purpleCaps) {
          const hasPurpleCap = teamPlayers.some(player => 
            player.name.toLowerCase() === purpleCap.toLowerCase()
          );
          
          if (hasPurpleCap) {
            userCapPoints += CAP_POINTS_BONUS;
            userCapHolders.push({ player: purpleCap, capType: 'Purple' });
          }
        }
        
        // If user has cap holders, update their weekly stats
        if (userCapPoints > 0) {
          await updateUserWeeklyStats(userId, tournamentId, weekNumber, userCapPoints, userCapHolders);
          pointsAwarded += userCapPoints;
          usersProcessed++;
        }
      } catch (error) {
        console.error(`Error processing cap points for user ${userId}:`, error);
      }
    }
    
    // Update rankings after all points are awarded
    await transferService.updateWeeklyRankings(tournamentId, weekNumber);
    await transferService.updateOverallRankings(tournamentId);
    
    return { 
      usersProcessed, 
      pointsAwarded 
    };
  } catch (error) {
    console.error('Error processing cap points for users:', error);
    throw error;
  }
}

/**
 * Update user's weekly stats with cap points
 */
async function updateUserWeeklyStats(userId, tournamentId, weekNumber, capPoints, capHolders) {
  try {
    // Get weekly stats document
    const weeklyStatsRef = doc(db, 'userWeeklyStats', `${userId}_${tournamentId}_${weekNumber}`);
    const weeklyStatsDoc = await getDoc(weeklyStatsRef);
    
    if (weeklyStatsDoc.exists()) {
      // Check if cap points have already been awarded
      const currentData = weeklyStatsDoc.data();
      
      // Only add points if cap points haven't been awarded yet
      if (!currentData.capPointsAwarded) {
        const currentPoints = currentData.points || 0;
        
        // Create point breakdown entry for cap points
        const capPointsBreakdown = capHolders.map(cap => ({
          playerId: `cap_${cap.player.replace(/\s+/g, '_').toLowerCase()}`,
          playerName: cap.player,
          basePoints: CAP_POINTS_BONUS,
          finalPoints: CAP_POINTS_BONUS,
          capType: cap.capType,
          isCap: true
        }));
        
        // Combine with existing breakdown
        const existingBreakdown = currentData.pointsBreakdown || [];
        
        await updateDoc(weeklyStatsRef, {
          points: currentPoints + capPoints,
          pointsBreakdown: [...existingBreakdown, ...capPointsBreakdown],
          capPointsAwarded: true,
          capHolders: capHolders,
          updatedAt: serverTimestamp()
        });
        
        console.log(`Added ${capPoints} cap points to user ${userId} for week ${weekNumber}`);
        return true;
      } else {
        console.log(`Cap points already awarded to user ${userId} for week ${weekNumber}`);
        return false;
      }
    } else {
      // Create new weekly stats document with cap points
      await setDoc(weeklyStatsRef, {
        userId,
        tournamentId,
        weekNumber,
        points: capPoints,
        pointsBreakdown: capHolders.map(cap => ({
          playerId: `cap_${cap.player.replace(/\s+/g, '_').toLowerCase()}`,
          playerName: cap.player,
          basePoints: CAP_POINTS_BONUS,
          finalPoints: CAP_POINTS_BONUS,
          capType: cap.capType,
          isCap: true
        })),
        capPointsAwarded: true,
        capHolders: capHolders,
        rank: 0,
        transferWindowId: `${weekNumber}`,
        createdAt: serverTimestamp()
      });
      
      console.log(`Created new weekly stats with ${capPoints} cap points for user ${userId}, week ${weekNumber}`);
      return true;
    }
  } catch (error) {
    console.error(`Error updating weekly stats for user ${userId}:`, error);
    throw error;
  }
}
