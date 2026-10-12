export type CoreState = "idle" | "listening" | "thinking" | "searching" | "speaking" | "error";

const TICKS = Array.from({ length: 72 }, (_, i) => i * 5);

/** Arc path on a circle centred at 200,200. Angles in degrees, 0 = top. */
function arc(r: number, start: number, end: number) {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${200 + r * Math.cos(rad)} ${200 + r * Math.sin(rad)}`;
  };
  return `M ${p(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${p(end)}`;
}

export default function Core({ state, label }: { state: CoreState; label?: string }) {
  return (
    <div className={`core core-${state}`} role="img" aria-label={`Oscar is ${label ?? state}`}>
      <svg viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <radialGradient id="core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" style={{ stopColor: "var(--core-hot)", stopOpacity: 1 }} />
            <stop offset="35%" style={{ stopColor: "var(--accent)", stopOpacity: 0.85 }} />
            <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
          </radialGradient>
        </defs>

        <g className="ring ring-ticks">
          {TICKS.map((a) => (
            <line
              key={a}
              x1="200"
              y1={a % 30 === 0 ? 8 : 12}
              x2="200"
              y2="20"
              transform={`rotate(${a} 200 200)`}
              strokeWidth={a % 30 === 0 ? 2 : 1}
            />
          ))}
        </g>
        <circle className="ring ring-dash" cx="200" cy="200" r="168" />
        <g className="ring ring-arcs">
          <path d={arc(146, 10, 100)} />
          <path d={arc(146, 130, 220)} />
          <path d={arc(146, 250, 340)} />
        </g>
        <circle className="ring ring-inner" cx="200" cy="200" r="118" />
        <circle className="core-halo" cx="200" cy="200" r="100" fill="url(#core-glow)" />
        <circle className="core-heart" cx="200" cy="200" r="34" />
      </svg>
      {label && <span className="core-label">{label}</span>}
    </div>
  );
}
