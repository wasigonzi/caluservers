import { useState } from "react";

/**
 * Hero 3D real de Spline, publicado por el usuario.
 * Escena: remix de "Robot follow cursor for landing page" de victorgg
 * (CC BY 4.0) — la cabeza del robot sigue el cursor, es la interactividad
 * propia de la escena. Fondo transparente: se funde con el aurora del hero.
 * El badge "Made with Spline" del visor se conserva (licencia CC BY 4.0).
 * Fallback histórico: src/components/RobotHero.tsx (recreación en Three.js).
 */
const SCENE_URL =
  "https://my.spline.design/robotfollowcursorforlandingpage-WHzvmcVico3zcuaFwvQchoUt/";

export default function SplineHero() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="robot-hero spline-hero">
      {!loaded && (
        <div className="spline-loading" aria-hidden="true">
          <span className="spline-loading-dot" />
        </div>
      )}
      <iframe
        src={SCENE_URL}
        title="Robot 3D de CaluServers que sigue el cursor con la mirada"
        frameBorder="0"
        width="100%"
        height="100%"
        loading="lazy"
        allow="autoplay; fullscreen"
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
