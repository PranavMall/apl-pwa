"use client";

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/app/components/ui/card';
import styles from './page.module.css';
import EmbeddedLookerReport from '../components/EmbeddedLookerReport';
import { userStatService } from '../services/userStatService';

const PlayerPerformancePage = () => {
  // Looker Studio report URL
  const lookerReportUrl = "https://lookerstudio.google.com/reporting/584b5014-3212-4480-b6af-0d653a17b5f2/page/K21wD";

  return (
    <div className={styles.container}>
      <Card>
        <CardHeader>
          <CardTitle>Player Performance Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <EmbeddedLookerReport 
            reportUrl={lookerReportUrl}
            title="Player Match Statistics" 
          />
              </CardContent>
      </Card>
  );
};

export default PlayerPerformancePage;
