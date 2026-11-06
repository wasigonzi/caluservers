// Robot 3D del hero de CaluServers.
//
// Diseño inspirado en "Robot follow cursor for landing page" de victorgg
// (CC BY 4.0), recreado desde cero con geometría original y los colores de
// la marca CaluServers (cian #00E5FF, turquesa #00B8D9, azul #007BFF).
// Composición del original: cabeza ancha con ojos esféricos blancos, cuello
// cromado, cubo brillante como cuerpo, botón píldora flotante y un charco
// de luz en el suelo. Solo la cabeza sigue al cursor; el resto permanece
// fijo (la píldora solo flota).
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const CYAN = 0x00e5ff;
const TURQUOISE = 0x00b8d9;
const BLUE = 0x007bff;
const NAVY = 0x16204a;
const FACE_NAVY = 0x0d1230;
const CHARCOAL = 0x20242e;
const SILVER = 0xc9d4dd;
const SILVER_LIGHT = 0xdbe4ec;

/** Degradado horizontal cian → turquesa → azul (textura de la píldora). */
function makePillTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "#00E5FF");
  grad.addColorStop(0.5, "#00B8D9");
  grad.addColorStop(1, "#007BFF");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Charco de luz radial cian sobre el suelo (centro intenso → transparente). */
function makeGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D no disponible");
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(0,229,255,0.65)");
  grad.addColorStop(0.4, "rgba(0,184,217,0.28)");
  grad.addColorStop(0.75, "rgba(0,123,255,0.08)");
  grad.addColorStop(1, "rgba(0,123,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function physical(
  params: THREE.MeshPhysicalMaterialParameters,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial(params);
}

export default function RobotHero() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0.7, 2.6, 11);
    camera.lookAt(0, 2.2, 0);

    // --- Luces ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 7, 6);
    scene.add(key);
    const glowLight = new THREE.PointLight(CYAN, 26, 14, 2);
    glowLight.position.set(0, 0.8, 4.5);
    scene.add(glowLight);
    const rim = new THREE.DirectionalLight(BLUE, 1.2);
    rim.position.set(-6, 4, -5);
    scene.add(rim);

    const robot = new THREE.Group();
    scene.add(robot);

    // --- Charco de luz en el suelo ---
    const glowTex = makeGlowTexture();
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.02;
    robot.add(glow);

    // --- Cuerpo: cubo grande y brillante (caras por material) ---
    const cubeMats = [
      physical({ color: SILVER, metalness: 0.35, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }), // +x derecha, gris plata
      physical({ color: NAVY, metalness: 0.25, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.25 }), // -x izquierda, azul marino
      physical({ color: SILVER_LIGHT, metalness: 0.3, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.2 }), // +y arriba, clara
      physical({ color: 0x0d0d0f, metalness: 0.2, roughness: 0.5 }), // -y abajo
      physical({ color: 0x1a2450, metalness: 0.25, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.25 }), // +z frente, azul marino
      physical({ color: 0x0d0d0f, metalness: 0.2, roughness: 0.5 }), // -z atrás
    ];
    const cube = new THREE.Mesh(
      new RoundedBoxGeometry(3.4, 2.6, 3.0, 4, 0.28),
      cubeMats,
    );
    cube.position.y = 1.3;
    robot.add(cube);

    // --- Cuello: cono cromado + anillo cian ---
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.42, 0.55, 32),
      physical({
        color: 0xe8eef4,
        metalness: 1,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      }),
    );
    neck.position.y = 2.87;
    robot.add(neck);
    const neckRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.045, 16, 48),
      physical({
        color: CYAN,
        emissive: TURQUOISE,
        emissiveIntensity: 0.6,
        metalness: 0.9,
        roughness: 0.2,
      }),
    );
    neckRing.rotation.x = Math.PI / 2;
    neckRing.position.y = 2.62;
    robot.add(neckRing);

    // --- Cabeza (grupo con pivote en el cuello; solo ella sigue al cursor) ---
    const head = new THREE.Group();
    head.position.y = 3.12;
    robot.add(head);

    const headShell = new THREE.Mesh(
      new RoundedBoxGeometry(2.6, 1.7, 1.5, 4, 0.32),
      physical({
        color: CHARCOAL,
        metalness: 0.3,
        roughness: 0.35,
        clearcoat: 0.8,
        clearcoatRoughness: 0.25,
      }),
    );
    headShell.position.y = 0.85;
    head.add(headShell);

    // Borde luminoso cian alrededor de la cara (recoloreo del borde violeta).
    const faceRim = new THREE.Mesh(
      new RoundedBoxGeometry(2.42, 1.52, 0.1, 4, 0.3),
      physical({
        color: CYAN,
        emissive: TURQUOISE,
        emissiveIntensity: 0.9,
        metalness: 0.4,
        roughness: 0.3,
      }),
    );
    faceRim.position.set(0, 0.85, 0.72);
    head.add(faceRim);

    // Panel facial azul marino oscuro y brillante.
    const face = new THREE.Mesh(
      new RoundedBoxGeometry(2.28, 1.38, 0.14, 4, 0.28),
      physical({
        color: FACE_NAVY,
        metalness: 0.2,
        roughness: 0.15,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
      }),
    );
    face.position.set(0, 0.85, 0.78);
    head.add(face);

    // Brillo cálido/frío en el borde superior de la cara.
    const topHighlight = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.06, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xbff6ff }),
    );
    topHighlight.position.set(0, 1.56, 0.8);
    head.add(topHighlight);

    // Ojos: esferas blancas perladas y brillantes.
    const eyeMat = physical({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.9, 0.88);
    for (const x of [-0.55, 0.55]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.23, 32, 32), eyeMat);
      eye.position.x = x;
      eyes.add(eye);
    }
    head.add(eyes);

    // Orejas circulares a los lados, con centro cian.
    const earMat = physical({
      color: CHARCOAL,
      metalness: 0.6,
      roughness: 0.3,
      clearcoat: 0.6,
    });
    const earDotMat = new THREE.MeshBasicMaterial({ color: CYAN });
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 24), earMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(side * 1.31, 0.85, 0);
      head.add(ear);
      const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 16), earDotMat);
      dot.rotation.z = Math.PI / 2;
      dot.position.set(side * 1.32, 0.85, 0);
      head.add(dot);
    }

    // --- Botón píldora flotante (degradado de marca, sin texto) ---
    const pillTex = makePillTexture();
    const pill = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 1.2, 8, 24),
      new THREE.MeshStandardMaterial({
        map: pillTex,
        emissive: BLUE,
        emissiveMap: pillTex,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.1,
      }),
    );
    pill.rotation.z = Math.PI / 2;
    pill.position.set(0, 1.0, 2.7);
    robot.add(pill);

    // --- Tamaño del canvas ---
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();

    // --- Interacción: solo la cabeza sigue al cursor ---
    const hero: HTMLElement =
      (container.closest(".hero") as HTMLElement | null) ?? container;
    let targetYaw = 0;
    let targetPitch = 0;
    let targetRoll = 0;
    let targetEyeX = 0;
    let targetEyeY = 0;
    let lastPointerMs = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = hero.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
      targetYaw = nx * 0.5;
      targetPitch = -ny * 0.15;
      targetRoll = nx * 0.05;
      targetEyeX = nx * 0.09;
      targetEyeY = -ny * 0.06;
      lastPointerMs = performance.now();
    };
    const onPointerLeave = () => {
      targetYaw = 0;
      targetPitch = 0;
      targetRoll = 0;
      targetEyeX = 0;
      targetEyeY = 0;
    };

    const clock = new THREE.Clock();
    let raf = 0;
    let visible = true;
    let sway = 0;

    const renderFrame = () => {
      const t = clock.getElapsedTime();
      // Balanceo idle del robot y flotación de la píldora (la píldora
      // nunca gira con el cursor).
      robot.position.y = Math.sin(t * 1.1) * 0.05;
      pill.position.y = 1.0 + Math.sin(t * 1.6) * 0.07;
      // Vaivén suave de la cabeza cuando no hay cursor reciente.
      const swayTarget =
        performance.now() - lastPointerMs > 2500 ? Math.sin(t * 0.6) * 0.05 : 0;
      sway += (swayTarget - sway) * 0.03;
      head.rotation.y += (targetYaw + sway - head.rotation.y) * 0.08;
      head.rotation.x += (targetPitch - head.rotation.x) * 0.08;
      head.rotation.z += (targetRoll - head.rotation.z) * 0.08;
      eyes.position.x += (targetEyeX - eyes.position.x) * 0.1;
      eyes.position.y += (0.9 + targetEyeY - eyes.position.y) * 0.1;
      renderer.render(scene, camera);
    };

    const loop = () => {
      if (!visible) return;
      renderFrame();
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const nowVisible = entry ? entry.isIntersecting : true;
        if (nowVisible && !visible) {
          visible = true;
          clock.getDelta();
          raf = requestAnimationFrame(loop);
        } else if (!nowVisible && visible) {
          visible = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.05 },
    );
    io.observe(container);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    if (reduced) {
      // Sin movimiento: un único fotograma estático, cabeza centrada.
      renderFrame();
    } else {
      hero.addEventListener("pointermove", onPointerMove);
      hero.addEventListener("pointerleave", onPointerLeave);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      hero.removeEventListener("pointermove", onPointerMove);
      hero.removeEventListener("pointerleave", onPointerLeave);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          for (const mat of mats) {
            const m = mat as THREE.MeshStandardMaterial;
            if (m.map) m.map.dispose();
            if (m.emissiveMap) m.emissiveMap.dispose();
            mat.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="robot-hero"
      role="img"
      aria-label="Robot 3D de CaluServers que sigue el cursor con la mirada"
    />
  );
}
