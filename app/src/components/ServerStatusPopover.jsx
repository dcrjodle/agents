import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { useServerStatus } from "../hooks/useServerStatus.js";
import "../styles/server-status.css";

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes == null) return "N/A";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Format uptime from timestamp
 */
function formatUptime(uptimeMs) {
  if (uptimeMs == null) return "N/A";
  const now = Date.now();
  const upSince = new Date(uptimeMs);
  const diffMs = now - upSince.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleString();
}

export function ServerStatusPopover({ anchorRect, onClose }) {
  const { data, loading, error, refresh } = useServerStatus(true);
  const popoverRef = useRef(null);

  // Position the popover below the anchor
  const GAP = 8;
  const POPOVER_WIDTH = 380;
  let left = anchorRect.right - POPOVER_WIDTH;
  if (left < 8) left = 8;
  const top = anchorRect.bottom + GAP;

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const status = data?.status || "unknown";
  const details = data?.details;
  const logs = data?.logs || "";
  const timestamp = data?.timestamp;

  const popover = (
    <div
      ref={popoverRef}
      className="server-status-popover"
      style={{ top, left }}
    >
      <div className="server-status-header">
        <div className="server-status-title">Production Server</div>
        <button
          className="server-status-refresh-btn"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "loading..." : "refresh"}
        </button>
      </div>

      {error && !data && (
        <div className="server-status-error">
          Failed to fetch status: {error}
        </div>
      )}

      {loading && !data && (
        <div className="server-status-loading">
          <div className="server-status-spinner" />
          Fetching server status...
        </div>
      )}

      {(data || (!loading && !error)) && (
        <>
          <div className="server-status-indicator">
            <div className={`server-status-dot ${status}`} />
            <div className="server-status-info">
              <div className="server-status-state">
                {status === "not_found" ? "Not Found" : status}
              </div>
              {details && (
                <div className="server-status-meta">
                  Process: {details.name}
                </div>
              )}
            </div>
          </div>

          {details && (
            <div className="server-status-details">
              <div className="server-status-detail">
                CPU: <span className="server-status-detail-value">{details.cpu != null ? `${details.cpu}%` : "N/A"}</span>
              </div>
              <div className="server-status-detail">
                Memory: <span className="server-status-detail-value">{formatBytes(details.memory)}</span>
              </div>
              <div className="server-status-detail">
                Uptime: <span className="server-status-detail-value">{formatUptime(details.uptime)}</span>
              </div>
              <div className="server-status-detail">
                Restarts: <span className="server-status-detail-value">{details.restarts ?? "N/A"}</span>
              </div>
            </div>
          )}

          <div className="server-status-logs-title">Recent Logs</div>
          <div className="server-status-logs">
            {logs || "No logs available"}
          </div>

          {timestamp && (
            <div className="server-status-footer">
              Last updated: {formatTimestamp(timestamp)}
            </div>
          )}
        </>
      )}
    </div>
  );

  return createPortal(popover, document.body);
}
