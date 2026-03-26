export function ConnectingLine() {
  return (
    <div style={{
      width: 40,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}>
      <div style={{
        height: 1,
        background: "var(--line-color)",
        animation: "draw-line 0.3s ease-out forwards",
        width: 40,
      }} />
    </div>
  );
}
