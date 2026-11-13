/** Ilustraciones de las tarjetas de servicio. SVG propio, animado con CSS, decorativo. */

const frame = {
  viewBox: "0 0 320 150",
  className: "svc-art",
  "aria-hidden": true,
  focusable: false,
} as const;

/** Web Hosting: una ventana de navegador con candado y contenido que carga. */
export function HostingArt() {
  return (
    <svg {...frame}>
      <rect x="40" y="16" width="240" height="124" rx="12" fill="#0b2230" stroke="#00e5ff" strokeOpacity=".4" />
      <rect x="40" y="16" width="240" height="26" rx="12" fill="#103547" />
      <circle cx="56" cy="29" r="3.5" fill="#ff6b6b" fillOpacity=".8" />
      <circle cx="68" cy="29" r="3.5" fill="#ffd166" fillOpacity=".8" />
      <circle cx="80" cy="29" r="3.5" fill="#45e3a1" fillOpacity=".8" />
      <rect x="98" y="22" width="150" height="14" rx="7" fill="#071a27" />
      <path d="M106 31v-3a3 3 0 0 1 6 0v3" fill="none" stroke="#45e3a1" strokeWidth="1.6" />
      <rect x="104.5" y="30" width="9" height="5" rx="1.5" fill="#45e3a1" />
      <rect x="120" y="27" width="70" height="4" rx="2" fill="#7df3ff" fillOpacity=".55" />
      <rect className="svc-load svc-load-a" x="58" y="56" width="120" height="10" rx="5" fill="#00e5ff" fillOpacity=".75" />
      <rect className="svc-load svc-load-b" x="58" y="74" width="170" height="7" rx="3.5" fill="#7df3ff" fillOpacity=".35" />
      <rect className="svc-load svc-load-c" x="58" y="88" width="140" height="7" rx="3.5" fill="#7df3ff" fillOpacity=".35" />
      <rect x="58" y="106" width="58" height="20" rx="6" fill="#00e5ff" />
      <rect x="204" y="56" width="60" height="70" rx="8" fill="#103547" stroke="#00e5ff" strokeOpacity=".3" />
      <path className="svc-spark" d="M212 110l10-14 9 8 10-20 12 16" fill="none" stroke="#45e3a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cube({ x, y, delay }: { x: number; y: number; delay: number }) {
  const w = 34;
  const h = 17;
  const t = 30;
  return (
    <g className="svc-cube" style={{ animationDelay: `${delay}s` }}>
      <polygon points={`${x - w},${y} ${x},${y + h} ${x},${y + h + t} ${x - w},${y + t}`} fill="#0c2a38" stroke="#00e5ff" strokeOpacity=".4" />
      <polygon points={`${x},${y + h} ${x + w},${y} ${x + w},${y + t} ${x},${y + h + t}`} fill="#0f3445" stroke="#00e5ff" strokeOpacity=".4" />
      <polygon points={`${x},${y - h} ${x + w},${y} ${x},${y + h} ${x - w},${y}`} fill="#14506a" stroke="#7df3ff" strokeOpacity=".8" />
      <circle className="svc-blink" cx={x - w + 9} cy={y + 14} r="2.2" fill="#45e3a1" style={{ animationDelay: `${delay + 0.3}s` }} />
    </g>
  );
}

/** VPS: máquinas virtuales como cubos aislados sobre un mismo plano. */
export function VpsArt() {
  return (
    <svg {...frame}>
      <ellipse cx="160" cy="124" rx="130" ry="18" fill="#00e5ff" fillOpacity=".12" />
      <Cube x={92} y={70} delay={0} />
      <Cube x={160} y={46} delay={0.4} />
      <Cube x={228} y={70} delay={0.8} />
      <Cube x={160} y={92} delay={1.2} />
      <path className="svc-dash" d="M92 70 160 46 228 70 160 92Z" fill="none" stroke="#7df3ff" strokeOpacity=".5" strokeDasharray="3 6" />
    </svg>
  );
}

/** Dedicados: el frontal de un rack con sus unidades y luces. */
export function DedicatedArt() {
  return (
    <svg {...frame}>
      <rect x="86" y="8" width="148" height="134" rx="10" fill="#081b27" stroke="#00e5ff" strokeOpacity=".45" />
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          <rect x="96" y={18 + row * 30} width="128" height="24" rx="5" fill="#0f3445" stroke="#7df3ff" strokeOpacity=".3" />
          {[0, 1, 2].map((led) => (
            <circle
              key={led}
              className="svc-blink"
              cx={106 + led * 9}
              cy={30 + row * 30}
              r="2.5"
              fill={led === 0 ? "#45e3a1" : "#00e5ff"}
              style={{ animationDelay: `${(row * 3 + led) * 0.29}s` }}
            />
          ))}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((slot) => (
            <rect key={slot} x={140 + slot * 10} y={23 + row * 30} width="6" height="14" rx="1.5" fill="#7df3ff" fillOpacity=".3" />
          ))}
        </g>
      ))}
      <path className="svc-dash" d="M40 120h46M234 40h46" stroke="#00e5ff" strokeOpacity=".6" strokeWidth="2" strokeDasharray="4 6" fill="none" />
      <circle cx="40" cy="120" r="4" fill="#00e5ff" />
      <circle cx="280" cy="40" r="4" fill="#00e5ff" />
    </svg>
  );
}
