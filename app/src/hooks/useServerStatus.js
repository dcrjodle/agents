import { useState, useCallback, useEffect, useRef } from "react";
import { API_BASE } from "../config.js";

/**
 * Hook to fetch and manage server status data.
 * @param {boolean} isOpen - Whether the popover is currently open
 * @returns {{ data, loading, error, refresh }}
 */
export function useServerStatus(isOpen) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/server-status`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open
  useEffect(() => {
    if (isOpen && !data && !loading) {
      refresh();
    }
  }, [isOpen, data, loading, refresh]);

  // Auto-refresh every 30 seconds while open
  useEffect(() => {
    if (isOpen) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, 30000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isOpen, refresh]);

  return { data, loading, error, refresh };
}
