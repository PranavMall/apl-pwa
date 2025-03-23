"use client";

import React, { useEffect, useState } from 'react';
import styles from './EmbeddedLookerReport.module.css';

const EmbeddedLookerReport = ({ reportUrl = "https://lookerstudio.google.com/reporting/584b5014-3212-4480-b6af-0d653a17b5f2/page/K21wD", title = "Player Statistics" }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Function to handle iframe loading state
  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  // Function to handle iframe errors
  const handleIframeError = () => {
    setIsLoading(false);
    setError("Failed to load the report. Please try refreshing the page.");
  };

  return (
    <div className={styles.reportContainer}>
      <h2 className={styles.reportTitle}>{title}</h2>
      
      {isLoading && (
        <div className={styles.loadingIndicator}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading report...</p>
        </div>
      )}
      
      {error && (
        <div className={styles.errorMessage}>
          {error}
          <button 
            className={styles.retryButton}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}
      
      <iframe
        className={styles.reportFrame}
        src={reportUrl}
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ opacity: isLoading ? 0 : 1 }}
        allowFullScreen
        frameBorder="0"
      />
    </div>
  );
};

export default EmbeddedLookerReport;
