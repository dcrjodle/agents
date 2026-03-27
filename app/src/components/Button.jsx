import "../styles/button.css";

/**
 * Button — a unified button component with shared CSS variants.
 *
 * @param {Object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'|'toggle'|'seg'|'action'|'sim'|'tab'} [props.variant='secondary']
 *   Visual style variant.
 * @param {boolean} [props.active=false]
 *   Adds `.active` modifier class (used by toggle, seg, tab variants).
 * @param {string} [props.color]
 *   For the `action` variant — a CSS color value applied as `--btn-color`
 *   custom property (e.g. `"var(--dot-planning)"` or `"#f59e0b"`).
 * @param {'sm'|'md'} [props.size]
 *   Optional padding override. `sm` = compact, `md` = standard dialog size.
 * @param {boolean} [props.disabled]
 *   Disables the button (dims it, removes pointer events).
 * @param {string} [props.type='button']
 *   Native button type attribute.
 * @param {string} [props.className]
 *   Additional CSS classes appended after the variant classes.
 * @param {React.ReactNode} props.children
 * @param {Object} rest
 *   Any additional props (onClick, onDragStart, draggable, style, etc.) are
 *   forwarded to the underlying <button> element.
 */
export function Button({
  variant = "secondary",
  active = false,
  color,
  size,
  disabled,
  type = "button",
  className = "",
  children,
  style,
  ...rest
}) {
  const classes = [
    "btn",
    variant && `btn--${variant}`,
    size && `btn--${size}`,
    active && "active",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inlineStyle = color
    ? { "--btn-color": color, ...style }
    : style || undefined;

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      style={inlineStyle}
      {...rest}
    >
      {children}
    </button>
  );
}
