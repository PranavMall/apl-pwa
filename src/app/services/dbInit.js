// src/services/dbInit.js

import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { PointService } from './pointService';

export class DatabaseInitializer {
  static async initializeDatabase() {
    try {
      await this.initializePointConfigurations();
      await this.initializeTournament();
      console.log('Database initialized successfully');
      return { success: true };
    } catch (error) {
      console.error('Error initializing database:', error);
      return { success: false, error: error.message };
    }
  }

  static async initializePointConfigurations() {
    try {
      // Initialize points configuration
      await setDoc(doc(db, 'configurations', 'points'), {
        batting: {
          run: PointService.POINTS.BATTING.RUN,
          boundary4: PointService.POINTS.BATTING.BOUNDARY_4,
          boundary6: PointService.POINTS.BATTING.BOUNDARY_6,
          milestone25: PointService.POINTS.BATTING.MILESTONE_25,
          milestone50: PointService.POINTS.BATTING.MILESTONE_50,
          milestone100: PointService.POINTS.BATTING.MILESTONE_100,
          duck: PointService.POINTS.BATTING.DUCK
        },
        bowling: {
          wicket: PointService.POINTS.BOWLING.WICKET,
          threeWickets: PointService.POINTS.BOWLING.THREE_WICKETS,
          fourWickets: PointService.POINTS.BOWLING.FOUR_WICKETS,
          fiveWickets: PointService.POINTS.BOWLING.FIVE_WICKETS,
          maiden: PointService.POINTS.BOWLING.MAIDEN
        },
        fielding: {
          catch: PointService.POINTS.FIELDING.CATCH,
          stumping: PointService.POINTS.FIELDING.STUMPING,
          directThrow: PointService.POINTS.FIELDING.DIRECT_THROW
        },
        match: {
          played: PointService.POINTS.MATCH.PLAYED
        },
        multipliers: {
          captain: PointService.POINTS.MULTIPLIERS.CAPTAIN,
          viceCaptain: PointService.POINTS.MULTIPLIERS.VICE_CAPTAIN
        },
        user: {
          lateRegistration: PointService.POINTS.USER?.LATE_REGISTRATION || -25,
          referralBonus: PointService.POINTS.USER?.REFERRAL || 25,
          maxReferrals: PointService.POINTS.USER?.MAX_REFERRALS || 3
        }
      });

      console.log('Points configuration initialized');
      return true;
    } catch (error) {
      console.error('Error initializing points configuration:', error);
      throw error;
    }
  }

  static async initializeTournament() {
    try {
      // Get current date (for testing)
      const now = new Date();
      
      // IPL 2025 dates
      const tournamentStart = new Date("2025-03-22"); // IPL starts March 22, 2025
      const tournamentEnd = new Date("2025-05-25");   // IPL ends May 25, 2025
      
      // Registration starts today (March 15, 2025)
      const registrationStart = new Date("2025-03-15");
      
      // Create transfer windows (weekly)
      // First window: March 15-21 (before tournament starts)
      // Following windows: Weekly throughout the tournament
      const transferWindows = [];
      
      // First transfer window (pre-tournament)
      transferWindows.push({
        startDate: new Date("2025-03-15"), // Today
        endDate: new Date("2025-03-21"),   // Day before tournament starts
        weekNumber: 1,
        status: "active"  // First window is active now
      });
      
      // Weekly windows during the tournament
      let windowStartDate = new Date("2025-03-29"); // First Saturday after tournament starts
      let weekNumber = 2;
      
      while (windowStartDate <= tournamentEnd) {
        // Each window is Friday and Saturday
        const windowEndDate = new Date(windowStartDate);
        windowEndDate.setDate(windowStartDate.getDate() + 1); // End next day
        
        transferWindows.push({
          startDate: windowStartDate,
          endDate: windowEndDate,
          weekNumber: weekNumber,
          status: "upcoming"
        });
        
        // Move to next week
        const nextWindowStart = new Date(windowStartDate);
        nextWindowStart.setDate(windowStartDate.getDate() + 7); // Next Friday
        windowStartDate = nextWindowStart;
        weekNumber++;
      }
      
      // Initialize tournament document
      const tournamentData = {
        name: "IPL 2025",
        startDate: tournamentStart,
        endDate: tournamentEnd,
        registrationDeadline: tournamentStart, // Can register until tournament starts
        status: "active",
        transferWindows: transferWindows
      };

      await setDoc(doc(db, 'tournaments', 'ipl-2025'), tournamentData);
      console.log('Tournament initialized with correct dates and transfer windows');
      return true;
    } catch (error) {
      console.error('Error initializing tournament:', error);
      throw error;
    }
  }

  // Helper method to get current timestamp
  static getCurrentTimestamp() {
    return new Date();
  }
}

// Function to run initialization
export const initializeDatabase = async () => {
  try {
    const result = await DatabaseInitializer.initializeDatabase();
    if (result.success) {
      console.log('Database initialization completed successfully');
    } else {
      console.error('Database initialization failed:', result.error);
    }
    return result;
  } catch (error) {
    console.error('Error in database initialization:', error);
    return { success: false, error: error.message };
  }
};

// You can run this directly if needed
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
