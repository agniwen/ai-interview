import { useEffect, useState } from 'react';

/**
 * Returns `true` only after the initial View Transition animation has finished
 * (or after a short fallback delay if the browser doesn't support View Transitions).
 *
 * Use this to defer UI that should not appear until the page transition is complete,
 * e.g. notice dialogs.
 */
export function useViewTransitionReady(delayMs = 350) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Fallback: if no transition is running or API is unsupported, use a timer.
    const timer = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  return ready;
}
