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

/**
 * Observa las secciones dentro de `containerRef` y les aplica reveal on
 * scroll: añade la clase `reveal` y, cuando entran en el viewport, la clase
 * `is-visible`. Un MutationObserver cubre las secciones que aparecen al
 * cambiar de ruta o de pestaña. Sin IntersectionObserver, todo queda visible.
 */
export function useRevealOnScroll(
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      prefersReducedMotion()
    ) {
      container
        .querySelectorAll("section, .hero, .page-hero")
        .forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" },
    );
    const watch = (root: Element) => {
      root
        .querySelectorAll("section, .hero, .page-hero")
        .forEach((el) => {
          if (el.classList.contains("reveal")) return;
          el.classList.add("reveal");
          io.observe(el);
        });
    };
    watch(container);
    const mo = new MutationObserver(() => watch(container));
    mo.observe(container, { childList: true, subtree: true });
    return () => {
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
