import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./Button.jsx";
import "../styles/mobile-tab-dropdown.css";

export function MobileTabDropdown({ projects, selected, onSelect }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (project) => {
    onSelect(project);
    setOpen(false);
  };

  return (
    <div className="mobile-tab-dropdown">
      <Button
        variant="tab"
        active={true}
        className="mobile-tab-dropdown__trigger"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="mobile-tab-dropdown__label">
          {selected ? selected.name : "Select project"}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={`mobile-tab-dropdown__chevron${open ? " mobile-tab-dropdown__chevron--open" : ""}`}
        />
      </Button>

      {open && (
        <>
          <div
            className="mobile-tab-dropdown__overlay"
            onClick={() => setOpen(false)}
          />
          <div className="mobile-tab-dropdown__sheet">
            {projects.map((project) => (
              <button
                key={project.path}
                className={`mobile-tab-dropdown__item${project.path === selected?.path ? " mobile-tab-dropdown__item--active" : ""}`}
                onClick={() => handleSelect(project)}
              >
                {project.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
