// src/lib/analytics.js
export const GA_MEASUREMENT_ID = 'G-K1Y8TK928E'; // Replace with your actual measurement ID

// Log page views
export const pageview = (url) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: url,
    });
  }
};

// Log specific events
export const event = ({ action, category, label, value }) => {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', action, {
      event_category: category,
      event_label: label,
      value: value,
    });
  }
};

// Custom events for your application
export const logTeamRegistration = (teamName) => {
  event({
    action: 'team_registration',
    category: 'engagement',
    label: teamName,
  });
};

export const logAppInstall = () => {
  event({
    action: 'pwa_install',
    category: 'app',
  });
};

export const logTransferWindowActivity = () => {
  event({
    action: 'transfer_window_activity',
    category: 'engagement',
  });
};
