import { useEffect, useRef } from "react";
import "../styles/context-menu.css";

export function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
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
  }, [x, y]);

  return (
    <>
      <div className="context-menu-overlay" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className="context-menu" style={{ left: x, top: y }}>
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
              {item.icon && <span className="context-menu-item-icon">{item.icon}</span>}
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
