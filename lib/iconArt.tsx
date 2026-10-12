/** The Oscar mark: an arc-reactor ring, drawn for next/og so it renders to PNG. */
export function IconArt({ size }: { size: number }) {
  const ring = (d: number, w: number, color: string) => ({
    position: "absolute" as const,
    width: d,
    height: d,
    borderRadius: "50%",
    border: `${w}px solid ${color}`,
  });
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 50% 45%, #0c2233 0%, #04070c 70%)",
        position: "relative",
      }}
    >
      <div style={ring(size * 0.74, size * 0.018, "rgba(110, 220, 255, 0.35)")} />
      <div style={ring(size * 0.6, size * 0.05, "rgba(110, 220, 255, 0.9)")} />
      <div
        style={{
          position: "absolute",
          width: size * 0.3,
          height: size * 0.3,
          borderRadius: "50%",
          background: "radial-gradient(circle, #e9fbff 0%, #6edcff 45%, rgba(110,220,255,0) 75%)",
        }}
      />
    </div>
  );
}
