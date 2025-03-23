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
          <div className={styles.reportIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
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
