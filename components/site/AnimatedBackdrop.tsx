"use client";
import { useEffect, useRef } from "react";

/**
 * Fondo animado del sitio: una red de puntos que deriva despacio y reacciona
 * al cursor, sobre manchas de luz que se mueven con CSS.
 *
 * Decorativo: `aria-hidden`, sin eventos de puntero, y nunca tapa contenido.
 * Con `prefers-reduced-motion` dibuja un único cuadro fijo. Se pausa cuando la
 * pestaña no está visible.
 */
type Dot = { x: number; y: number; vx: number; vy: number; r: number };

const LINK = 140;

export default function AnimatedBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dots: Dot[] = [];
    let frame = 0;
    const pointer = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Densidad según el área, con tope: en móvil hay menos puntos.
      const count = Math.max(24, Math.min(90, Math.round((width * height) / 19000)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: 0.8 + Math.random() * 1.6,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        if (!reduced) {
          dot.x += dot.vx;
          dot.y += dot.vy;
          // El cursor empuja suavemente los puntos cercanos.
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 150 && dist > 0.01) {
            const push = ((150 - dist) / 150) * 0.6;
            dot.x += (dx / dist) * push;
            dot.y += (dy / dist) * push;
          }
          if (dot.x < -20) dot.x = width + 20;
          if (dot.x > width + 20) dot.x = -20;
          if (dot.y < -20) dot.y = height + 20;
          if (dot.y > height + 20) dot.y = -20;
        }
      }
      for (let i = 0; i < dots.length; i++) {
        const a = dots[i];
        for (let j = i + 1; j < dots.length; j++) {
          const b = dots[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > LINK) continue;
          ctx.strokeStyle = `rgba(0,229,255,${(1 - dist / LINK) * 0.16})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        // Líneas hacia el cursor: la red «se conecta» con quien la mira.
        const toPointer = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (toPointer < 190) {
          ctx.strokeStyle = `rgba(120,240,255,${(1 - toPointer / 190) * 0.35})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(140,238,255,.55)";
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      if (reduced) draw();
      else if (document.visibilityState === "visible") frame = requestAnimationFrame(loop);
    };
    const onResize = () => {
      resize();
      start();
    };
    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    resize();
    start();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", start);
    if (!reduced) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div className="backdrop" aria-hidden="true">
      <span className="backdrop-blob backdrop-blob-a" />
      <span className="backdrop-blob backdrop-blob-b" />
      <span className="backdrop-blob backdrop-blob-c" />
      <span className="backdrop-grid" />
      <canvas ref={canvasRef} className="backdrop-canvas" />
    </div>
  );
}
