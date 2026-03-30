import { useEffect, useRef } from "react";
import "../styles/context-menu.css";

export function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    // Skip floating-menu boundary detection on mobile — it uses a bottom sheet instead
    if (isMobile) return;
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y, isMobile]);

  return (
    <>
      <div
        className="context-menu-overlay"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        className={`context-menu${isMobile ? " context-menu--sheet" : ""}`}
        style={isMobile ? undefined : { left: x, top: y }}
      >
        {items.map((item, i) => {
          if (item.separator) {
            return <div key={i} className="context-menu-separator" />;
          }
          return (
            <button
              key={i}
              className={`context-menu-item${item.danger ? " danger" : ""}`}
              onClick={() => { item.action(); onClose(); }}
            >
              {item.icon && <span className="context-menu-item-icon"><item.icon size={14} strokeWidth={1.75} /></span>}
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
