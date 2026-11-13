"use client";
import { useEffect, useRef } from "react";
import { Cpu, Globe2, HardDrive, Headset, ShieldCheck } from "lucide-react";

/**
 * Escena del hero: una pila de servidores en isométrico que se inclina con el
 * cursor, con luces, anillos y etiquetas flotantes. Es una ilustración, no un
 * monitor: las etiquetas son características del servicio, no métricas en vivo.
 */

const CX = 260;
const HALF_W = 150;
const HALF_H = 75;
const THICK = 40;

function Slab({ y, index }: { y: number; index: number }) {
  const top = `${CX},${y - HALF_H} ${CX + HALF_W},${y} ${CX},${y + HALF_H} ${CX - HALF_W},${y}`;
  const left = `${CX - HALF_W},${y} ${CX},${y + HALF_H} ${CX},${y + HALF_H + THICK} ${CX - HALF_W},${y + THICK}`;
  const right = `${CX},${y + HALF_H} ${CX + HALF_W},${y} ${CX + HALF_W},${y + THICK} ${CX},${y + HALF_H + THICK}`;
  return (
    <g className="hv-slab" style={{ animationDelay: `${index * 0.5}s` }}>
      <polygon points={left} fill="url(#hv-left)" stroke="#00e5ff" strokeOpacity=".35" />
      <polygon points={right} fill="url(#hv-right)" stroke="#00e5ff" strokeOpacity=".35" />
      <polygon points={top} fill="url(#hv-top)" stroke="#7df3ff" strokeOpacity=".7" />
      {/* Rejilla de la tapa */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={CX - HALF_W * (1 - t)}
          y1={y - HALF_H * t}
          x2={CX + HALF_W * t}
          y2={y + HALF_H * (1 - t)}
          stroke="#7df3ff"
          strokeOpacity=".16"
        />
      ))}
      {/* Luces de estado en la cara izquierda */}
      {[0, 1, 2, 3].map((i) => (
        <circle
          key={i}
          className="hv-led"
          cx={CX - HALF_W + 22 + i * 16}
          cy={y + 11 + i * 8 + THICK / 2 - 6}
          r="3"
          style={{ animationDelay: `${(index * 4 + i) * 0.37}s` }}
        />
      ))}
      {/* Bahías de disco en la cara derecha */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={i}
          x1={CX + 18 + i * 25}
          y1={y + HALF_H - 9 - i * 12.5 + 8}
          x2={CX + 18 + i * 25}
          y2={y + HALF_H - 9 - i * 12.5 + THICK - 8}
          stroke="#7df3ff"
          strokeOpacity=".45"
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

export default function HeroVisual({ locations }: { locations: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        // Limitado: el cursor lejos de la escena no la vuelca.
        el.style.setProperty("--hv-x", String(Math.max(-1, Math.min(1, x * 1.4))));
        el.style.setProperty("--hv-y", String(Math.max(-1, Math.min(1, y * 1.4))));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div className="hero-visual" ref={ref} aria-hidden="true">
      <div className="hv-glow" />
      <div className="hv-scene">
        <svg viewBox="0 0 520 470" className="hv-svg" focusable="false">
          <defs>
            <linearGradient id="hv-top" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#12485a" />
              <stop offset="1" stopColor="#0a2230" />
            </linearGradient>
            <linearGradient id="hv-left" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0c2a38" />
              <stop offset="1" stopColor="#061521" />
            </linearGradient>
            <linearGradient id="hv-right" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0f3445" />
              <stop offset="1" stopColor="#071a27" />
            </linearGradient>
            <radialGradient id="hv-floor" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#00e5ff" stopOpacity=".55" />
              <stop offset="1" stopColor="#00e5ff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hv-beam" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#00e5ff" stopOpacity="0" />
              <stop offset=".5" stopColor="#7df3ff" />
              <stop offset="1" stopColor="#00e5ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <ellipse cx={CX} cy="405" rx="215" ry="52" fill="url(#hv-floor)" />
          <ellipse className="hv-ring" cx={CX} cy="405" rx="205" ry="48" fill="none" stroke="#00e5ff" strokeOpacity=".35" strokeDasharray="4 10" />
          <ellipse className="hv-ring hv-ring-b" cx={CX} cy="405" rx="165" ry="38" fill="none" stroke="#7df3ff" strokeOpacity=".3" strokeDasharray="2 14" />
          {/* Haces de datos que suben */}
          {[150, 220, 300, 372].map((x, i) => (
            <line
              key={x}
              className="hv-beam"
              x1={x}
              y1="400"
              x2={x}
              y2="30"
              stroke="url(#hv-beam)"
              strokeWidth="2"
              strokeDasharray="26 240"
              style={{ animationDelay: `${i * 0.9}s` }}
            />
          ))}
          <Slab y={300} index={0} />
          <Slab y={220} index={1} />
          <Slab y={140} index={2} />
          {/* Núcleo luminoso sobre la pila */}
          <g className="hv-core">
            <circle cx={CX} cy="62" r="26" fill="#00e5ff" fillOpacity=".12" />
            <circle cx={CX} cy="62" r="13" fill="#7df3ff" fillOpacity=".9" />
            <circle className="hv-pulse" cx={CX} cy="62" r="13" fill="none" stroke="#7df3ff" />
          </g>
        </svg>
      </div>
      <span className="hv-chip hv-chip-a">
        <HardDrive size={15} /> NVMe SSD
      </span>
      <span className="hv-chip hv-chip-b">
        <ShieldCheck size={15} /> SSL gratis
      </span>
      <span className="hv-chip hv-chip-c">
        <Cpu size={15} /> Root total
      </span>
      {locations > 0 ? (
        <span className="hv-chip hv-chip-d">
          <Globe2 size={15} /> {locations} {locations === 1 ? "ubicación" : "ubicaciones"}
        </span>
      ) : null}
      <span className="hv-chip hv-chip-e">
        <Headset size={15} /> Soporte 24/7
      </span>
    </div>
  );
}
