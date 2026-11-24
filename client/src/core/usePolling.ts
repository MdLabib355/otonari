import { useEffect, useRef } from 'react';

// Runs `load` now and then again and again, so a page shows what the neighbors do without a reload:
//
//    usePolling(loadItems, 3000);
//
// Not while the app is in the background (that would only use up battery and data); coming back to it
// loads at once. The next wait starts after the answer, so slow answers never pile up.
// `load` must handle its own errors.
export function usePolling(load: () => Promise<void>, everyMs: number) {
  const latestLoad = useRef(load);
  latestLoad.current = load;

  useEffect(() => {
    let stopped = false;
    let loading = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      if (loading) return;
      clearTimeout(timer);
      loading = true;
      if (document.visibilityState === 'visible') await latestLoad.current();
      loading = false;
      if (!stopped) timer = setTimeout(run, everyMs);
    }

    run();
    document.addEventListener('visibilitychange', run);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [everyMs]);
}
