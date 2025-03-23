"use client";

import React from 'react';
import styles from './EmbeddedLookerReport.module.css';

const EmbeddedLookerReport = ({ reportUrl = "https://lookerstudio.google.com/reporting/584b5014-3212-4480-b6af-0d653a17b5f2/page/K21wD", title = "Player Statistics" }) => {
  // Function to open the report in a new tab
  const openReportInNewTab = () => {
    window.open(reportUrl, '_blank');
  };

  return (
    <div className={styles.reportLinkContainer}>
      <h2 className={styles.reportTitle}>{title}</h2>
      
      <div className={styles.reportCard}>
        <div className={styles.reportDescription}>
          <div>
            <h3>Looker Studio Player Statistics Report</h3>
            <p>View detailed player performance metrics across all matches with easy filtering and visualization options.</p>
          </div>
        </div>
        
        <div className={styles.reportActions}>
          <button 
            className={styles.viewReportButton}
            onClick={openReportInNewTab}
          >
            View Full Report
          </button>
          <p className={styles.reportNote}>Opens in a new tab</p>
        </div>
      </div>
    </div>
  );
};

export default EmbeddedLookerReport;
