"use client";
// Utilidades interactivas globales: reveal on scroll y contadores animados.
// Todo respeta prefers-reduced-motion (sin animación: valor final directo).
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const SECTION_SEL = "section, .hero, .page-hero";

/**
 * Reveal progresivo y tolerante: el contenido permanece legible por defecto.
 * La animación solo se aplica cuando hay motion y el observer funciona; un
 * fallback fuerza visibilidad para evitar secciones atrapadas en opacity 0.
 */
export function useRevealOnScroll(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const markVisible = (el: Element) => {
      el.classList.add("is-visible");
      el.classList.remove("reveal-pending");
    };

    const showAll = () => {
      container.querySelectorAll(SECTION_SEL).forEach(markVisible);
    };

    if (
      typeof IntersectionObserver === "undefined" ||
      prefersReducedMotion()
    ) {
      showAll();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            markVisible(entry.target);
            io.unobserve(entry.target);
          }
        }
      },
      // Margen generoso: revela un poco antes de entrar y no exige casi todo el alto.
      { threshold: [0, 0.01, 0.08], rootMargin: "120px 0px 120px 0px" },
    );

    const watch = (root: Element) => {
      root.querySelectorAll(SECTION_SEL).forEach((el) => {
        if (el.classList.contains("is-visible")) return;
        if (!el.classList.contains("reveal")) {
          el.classList.add("reveal", "reveal-pending");
        }
        io.observe(el);
        // Si ya está en viewport (hero / primeras secciones), mostrar ya.
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 0;
        if (rect.top < vh + 120 && rect.bottom > -40) {
          markVisible(el);
          io.unobserve(el);
        }
      });
    };

    watch(container);
    // Seguridad: nada debe quedar invisible si el observer no dispara.
    const safety = window.setTimeout(showAll, 900);

    const mo = new MutationObserver(() => watch(container));
    mo.observe(container, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(safety);
      io.disconnect();
      mo.disconnect();
    };
  }, [containerRef]);
}

/**
 * Contador animado: cuenta de 0 a `value` una sola vez, cuando entra en el
 * viewport. `decimals` para valores como 99.9. Con reduced-motion muestra
 * el valor final sin animar.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1400,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return;
        started.current = true;
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          // Ease-out: rápido al inicio, suave al final.
          const eased = 1 - Math.pow(1 - p, 3);
          setDisplay(value * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, decimals, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
