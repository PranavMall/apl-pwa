"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import styles from './page.module.css';
import EmbeddedLookerReport from '../components/EmbeddedLookerReport';

const PlayerPerformancePage = () => {
  // Looker Studio report URL
  const lookerReportUrl = "https://lookerstudio.google.com/reporting/584b5014-3212-4480-b6af-0d653a17b5f2/page/K21wD";
  const [isLoading, setIsLoading] = useState(true);

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader>
          <CardTitle>Player Performance Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.reportContainer}>
            <EmbeddedLookerReport 
              reportUrl={lookerReportUrl}
              title="Player Match Statistics" 
            />
          </div>
          
          <div className={styles.infoSection}>
            <h3>About This Report</h3>
            <p>
              This comprehensive dashboard shows detailed statistics for all players across matches, including:
            </p>
            <ul className={styles.infoList}>
              <li>Batting performance (runs, boundaries, milestones)</li>
              <li>Bowling statistics (wickets, maiden overs)</li>
              <li>Fielding contributions (catches, stumpings, run outs)</li>
              <li>Fantasy points earned per match and cumulatively</li>
            </ul>
            <p>
              Use the filters in the report to view statistics by player, team, match, or week to track 
              performance trends and identify top performers.
            </p>
            <p className={styles.reportTip}>
              <strong>Tip:</strong> Click on a player's name to see their detailed performance history across all matches.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlayerPerformancePage;
