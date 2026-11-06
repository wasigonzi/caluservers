"use client";
import { useState } from "react";
import Link from "next/link";

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
      <div className="spline-floor" aria-hidden="true" />
      <iframe
        src={SCENE_URL}
        title="Robot 3D de CaluServers que sigue el cursor con la mirada"
        width="100%"
        height="100%"
        loading="lazy"
        allow="autoplay; fullscreen"
        onLoad={() => setLoaded(true)}
      />
      <Link className="spline-pill" href="/contact">
        Get in touch
      </Link>
    </div>
  );
}
