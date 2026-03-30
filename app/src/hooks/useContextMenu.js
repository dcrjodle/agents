import { useState, useCallback, useRef } from "react";

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

/**
 * useLongPress — fires `callback({ clientX, clientY })` after the user holds
 * a touch for `delay` ms without moving more than 10 px.
 *
 * Usage:
 *   const { onTouchStart, onTouchMove, onTouchEnd } = useLongPress(cb);
 *   <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />
 */
export function useLongPress(callback, delay = 500) {
  const timerRef = useRef(null);
  const startPosRef = useRef(null);
  const callbackRef = useRef(callback);

  // Keep callbackRef in sync without re-creating handlers
  callbackRef.current = callback;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    startPosRef.current = { x: touch.clientX, y: touch.clientY };

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (startPosRef.current) {
        callbackRef.current({
          clientX: startPosRef.current.x,
          clientY: startPosRef.current.y,
        });
      }
    }, delay);
  }, [delay]);

  const onTouchMove = useCallback((e) => {
    if (!startPosRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startPosRef.current.x;
    const dy = touch.clientY - startPosRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      cancel();
    }
  }, [cancel]);

  const onTouchEnd = useCallback(() => {
    cancel();
  }, [cancel]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
