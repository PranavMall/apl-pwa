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
          lateRegistration: PointService.POINTS.USER.LATE_REGISTRATION,
          referralBonus: PointService.POINTS.USER.REFERRAL,
          maxReferrals: PointService.POINTS.USER.MAX_REFERRALS
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
      // Initialize current tournament
      const tournamentData = {
        name: "BBL 2024",
        startDate: new Date("2024-02-11"),
        endDate: new Date("2024-03-11"),
        registrationDeadline: new Date("2024-02-10"),
        status: "active",
        transferWindows: [
          {
            startDate: new Date("2024-02-18"),
            endDate: new Date("2024-02-20"),
            weekNumber: 1,
            status: "upcoming"
          }
          // Add more transfer windows as needed
        ]
      };

      await setDoc(doc(db, 'tournaments', 'bbl-2024'), tournamentData);
      console.log('Tournament initialized');
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
