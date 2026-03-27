import "../styles/icon-button.css";

/**
 * IconButton — a shared icon button component using Lucide React icons.
 *
 * @param {Object} props
 * @param {React.ComponentType} props.icon - A Lucide icon component
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.title] - Tooltip / aria-label
 * @param {number} [props.size=14] - Icon size in px
 * @param {string} [props.label] - Optional text rendered alongside the icon
 * @param {'ghost'|'danger'} [props.variant='ghost'] - Button style variant
 * @param {string} [props.className] - Additional CSS class names
 */
export function IconButton({
  icon: Icon,
  onClick,
  title,
  size = 14,
  label,
  variant = "ghost",
  className = "",
  ...rest
}) {
  const variantClass = variant === "danger" ? " icon-btn--danger" : "";
  const extraClass = className ? ` ${className}` : "";

  return (
    <button
      type="button"
      className={`icon-btn${variantClass}${extraClass}`}
      onClick={onClick}
      title={title}
      aria-label={title}
      {...rest}
    >
      <Icon size={size} strokeWidth={1.75} />
      {label && <span className="icon-btn__label">{label}</span>}
    </button>
  );
}
