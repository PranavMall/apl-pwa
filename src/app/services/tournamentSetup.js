// src/app/services/tournamentSetup.js

import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * This function can be run directly to create the tournament in your database
 * without requiring a full database initialization
 */
export const createTournament = async () => {
  try {
    console.log("Creating IPL 2025 tournament...");
    
    // IPL 2025 dates
    const tournamentStart = new Date("2025-03-22"); // IPL starts March 22, 2025
    const tournamentEnd = new Date("2025-05-25");   // IPL ends May 25, 2025
    
    // Registration starts today (March 15, 2025)
    const registrationStart = new Date("2025-03-15");
    
    // For testing, use the current date as the basis
    const now = new Date();
    
    // Create transfer windows
    const transferWindows = [];
    
    // IMPORTANT: First window is NOW for testing
    // Make it active for the current date and the next 3 days
    const currentDate = new Date(now);
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + 1); // 3 days from now
    
    transferWindows.push({
      startDate: currentDate,
      endDate: endDate,
      weekNumber: 1,
      status: "active"  // Explicitly mark as active
    });
    
    // Add more future windows
    for (let i = 1; i <= 8; i++) {
      const futureStartDate = new Date(now);
      futureStartDate.setDate(now.getDate() + (i * 7)); // Weekly windows
      
      const futureEndDate = new Date(futureStartDate);
      futureEndDate.setDate(futureStartDate.getDate() + 2); // Each window lasts 3 days
      
      transferWindows.push({
        startDate: futureStartDate,
        endDate: futureEndDate,
        weekNumber: i + 1,
        status: "upcoming"
      });
    }
    
    // Initialize tournament document
    const tournamentData = {
      name: "IPL 2025",
      startDate: tournamentStart,
      endDate: tournamentEnd,
      registrationDeadline: tournamentStart, // Can register until tournament starts
      status: "active", // IMPORTANT: Set status to active
      transferWindows: transferWindows,
      createdAt: now
    };

    // Create the tournament document
    await setDoc(doc(db, 'tournaments', 'ipl-2025'), tournamentData);
    console.log('Tournament created successfully with active transfer window');
    return { success: true };
  } catch (error) {
    console.error('Error creating tournament:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to apply the tournament fix and check if it works
export const fixTransferWindow = async () => {
  try {
    // First, create the tournament
    const result = await createTournament();
    
    if (result.success) {
      console.log("Tournament was successfully created/updated");
      console.log("The transfer window should now be ACTIVE");
      console.log("Please refresh the page to see the changes");
      return { success: true, message: "Transfer window activated successfully" };
    } else {
      console.error("Failed to fix transfer window:", result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error("Error fixing transfer window:", error);
    return { success: false, error: error.message };
  }
};

// Export a function to run this from the browser console for debugging
if (typeof window !== 'undefined') {
  window.fixTransferWindow = fixTransferWindow;
  console.log("Tournament fix function is available. Run window.fixTransferWindow() in the console to activate transfer window.");
}
