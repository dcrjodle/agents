const SERVER_URL = import.meta.env.VITE_SERVER_URL || "";

export const API_BASE = SERVER_URL ? `${SERVER_URL}/api` : "/api";

export const WS_URL = SERVER_URL
  ? `${SERVER_URL.replace(/^http/, "ws")}/ws`
  : `ws://${window.location.host}/ws`;
