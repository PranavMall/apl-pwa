'use client';

import { useEffect } from 'react';
import { logAppInstall } from '@/lib/analytics';

export function trackAppInstall() {
  useEffect(() => {
    // Track PWA installation
    window.addEventListener('appinstalled', (event) => {
      logAppInstall();
    });
    
    return () => {
      window.removeEventListener('appinstalled', logAppInstall);
    };
  }, []);
}
