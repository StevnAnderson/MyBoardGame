import { useCallback, useEffect, useState } from "react";

/** State that survives a refresh — playtest setups are too annoying to rebuild. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked; the app still works without persistence.
    }
  }, [key, value]);

  const reset = useCallback(() => {
    setValue(initial);
  }, [initial]);

  return [value, setValue, reset] as const;
}
