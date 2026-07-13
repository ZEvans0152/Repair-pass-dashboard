import { useEffect, useRef } from 'react';

// Polls the deployed index.html; when its content changes (new publish),
// forces a full page reload so everyone gets the latest version.
const CHECK_INTERVAL_MS = 60000;

export default function AutoRefreshOnUpdate() {
  const baselineRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const getVersion = async () => {
      const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return res.text();
    };

    const check = async () => {
      try {
        const html = await getVersion();
        if (cancelled || html == null) return;
        if (baselineRef.current == null) {
          baselineRef.current = html;
        } else if (html !== baselineRef.current) {
          window.location.reload();
        }
      } catch { /* offline or transient error — try again next tick */ }
    };

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    // A failed lazy-chunk load also means a new build was deployed
    const onPreloadError = () => window.location.reload();
    window.addEventListener('vite:preloadError', onPreloadError);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('vite:preloadError', onPreloadError);
    };
  }, []);

  return null;
}