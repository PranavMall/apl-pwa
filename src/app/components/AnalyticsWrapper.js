'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { pageview } from '@/lib/analytics';

// Component that uses searchParams
function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Track page views
    const url = pathname + searchParams.toString();
    pageview(url);
  }, [pathname, searchParams]);

  return null;
}

export default function AnalyticsWrapper({ children }) {
  return (
    <>
      <Suspense fallback={null}>
    
        <PageViewTracker />
      </Suspense>
      {children}
    </>
  );
}
