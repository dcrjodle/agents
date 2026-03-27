import { useState, useCallback } from "react";

export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState(null);

  const openContextMenu = useCallback((e, target) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, target });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return { contextMenu, openContextMenu, closeContextMenu };
}
