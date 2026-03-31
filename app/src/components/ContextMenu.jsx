import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import "../styles/context-menu.css";

export function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const isMobile = window.innerWidth <= 768;
  const [openSubmenu, setOpenSubmenu] = useState(null);
  const hoverTimerRef = useRef(null);

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

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleMouseEnter = (index) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setOpenSubmenu(index);
    }, 150);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 150);
  };

  const handleSubmenuMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  const handleSubmenuMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 150);
  };

  const renderSubmenuItems = (submenuItems, indented = false) =>
    submenuItems.map((subItem, si) => {
      if (subItem.separator) {
        return <div key={si} className="context-menu-separator" />;
      }
      return (
        <button
          key={si}
          className={`context-menu-item${subItem.danger ? " danger" : ""}`}
          disabled={subItem.disabled}
          style={{
            ...(subItem.disabled ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" } : {}),
            ...(indented ? { paddingLeft: 36 } : {}),
          }}
          onClick={() => { if (subItem.action) subItem.action(); onClose(); }}
        >
          {subItem.icon && <span className="context-menu-item-icon"><subItem.icon size={14} strokeWidth={1.75} /></span>}
          {subItem.label}
          {subItem.checked && (
            <span style={{ marginLeft: "auto", paddingLeft: 8, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>✓</span>
          )}
        </button>
      );
    });

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
          const hasSubmenu = item.submenu && item.submenu.length > 0;
          return (
            <div
              key={i}
              style={{ position: "relative" }}
              onMouseEnter={!isMobile && hasSubmenu ? () => handleMouseEnter(i) : undefined}
              onMouseLeave={!isMobile && hasSubmenu ? handleMouseLeave : undefined}
            >
              <button
                className={`context-menu-item${item.danger ? " danger" : ""}`}
                disabled={item.disabled}
                style={item.disabled ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" } : undefined}
                onClick={() => {
                  if (hasSubmenu && isMobile) {
                    setOpenSubmenu(openSubmenu === i ? null : i);
                  } else if (item.action) {
                    item.action();
                    onClose();
                  }
                }}
              >
                {item.icon && <span className="context-menu-item-icon"><item.icon size={14} strokeWidth={1.75} /></span>}
                {item.label}
                {item.checked && (
                  <span style={{ marginLeft: "auto", paddingLeft: 8, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>✓</span>
                )}
                {hasSubmenu && (
                  <span style={{ marginLeft: "auto", paddingLeft: 4, display: "flex", alignItems: "center", color: "var(--text-muted)", flexShrink: 0 }}>
                    <ChevronRight size={14} strokeWidth={1.75} />
                  </span>
                )}
              </button>

              {/* Desktop: flyout submenu */}
              {!isMobile && hasSubmenu && openSubmenu === i && (
                <div
                  className="context-menu"
                  style={{ position: "absolute", left: "100%", top: 0, zIndex: 1002 }}
                  onMouseEnter={handleSubmenuMouseEnter}
                  onMouseLeave={handleSubmenuMouseLeave}
                >
                  {renderSubmenuItems(item.submenu)}
                </div>
              )}

              {/* Mobile: accordion-style inline expansion */}
              {isMobile && hasSubmenu && openSubmenu === i && (
                <div style={{ borderTop: "1px solid var(--border-light)", borderBottom: "1px solid var(--border-light)" }}>
                  {renderSubmenuItems(item.submenu, true)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
