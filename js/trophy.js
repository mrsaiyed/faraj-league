/**
 * The champions trophy: the top of the awards page and the end of the home page.
 *
 * Scrolling drives a camera move from a bird's-eye view of the ball down to
 * the trophy standing upright. Once upright it turns by dragging or with the
 * arrow buttons; a filled card magnifies on mouse hover and opens full screen
 * on a tap or click.
 *
 * Built with three.js, imported from esm.sh (where the site already gets
 * Supabase) only when a trophy is about to be seen, so a visit that never
 * reaches one never pays for it. Without WebGL2, or when three.js cannot load, the cards are shown
 * as a plain list instead; with reduced motion the trophy starts upright.
 *
 * What goes on the trophy and where is lib/trophy.js; the HTML card and the
 * loupe and full-screen view it opens in are js/champion-card.js, which the
 * home hero's plaque shares without loading any of this; this file is the 3D.
 */
import { slotForIndex, layoutCard, CARD_ASPECT, CARD_TRACKING, SLOT_COLUMNS, SLOT_ROWS } from '../lib/trophy.js';
import { getBasePath } from './config.js';
import { CARD_FONT, loadCardFont, measureCard, cardElement, overlays } from './champion-card.js';

// One import, deliberately: three.js's add-ons import 'three' themselves, and
// if a CDN ever resolved that differently the page would run two copies.
const THREE_URL = 'https://esm.sh/three@0.186.1';
const INK = '#1a1309';
const INK_ORM = 'rgb(0,150,255)';   // occluded, fairly rough, metal

// Proportions measured off the photo of the real trophy (1 unit = 1/6.6 of the ball's width).
const DIM = { lowerW: 6.85, lowerH: 4.2, upperW: 5.65, upperH: 3.7, stemH: 2.2, ballR: 3.3 };
const BASE_TOP = DIM.lowerH + DIM.upperH;
const BALL_Y = BASE_TOP + DIM.stemH + DIM.ballR;
const TOP_Y = BALL_Y + DIM.ballR;
// The ball's seams, fitted to the photo of the real trophy as it is seen from
// the front: two great circles crossing at nearly right angles, and a ring
// either side of the middle one. A seam is where asin(n.p) = lat + bend.k (bend.m.p)^2
// for p on the ball: a circle round the axis n at latitude `lat` (0 for a great
// circle), squeezed a little along `bend.m` — which is all it takes for the
// lower ring to run off the bottom right as the real one does. In the trophy's
// own frame (+x right, +y up, +z out of the front), so the sides and back follow
// from the same curves.
const BALL_SEAMS = {
  cross: { n: [0.6895, 0.1715, 0.7037] },                                     // down the left of the front
  middle: { n: [-0.0144, -0.9822, 0.1872] },                                  // across the middle
  upper: { n: [-0.2390, 0.9659, 0.1001], lat: 0.7439, bend: { m: [0.8959, 0.2590, -0.3609], k: -0.141 } },  // rising to the top right
  lower: { n: [-0.3156, -0.8607, 0.3994], lat: 0.6487, bend: { m: [-0.9489, 0.2871, -0.1312], k: 0.130 } },  // falling to the bottom right
};
const SLOT = { w: 3.15, h: 1.07, gapX: 0.2, gapY: 0.2, plateW: 3.02, plateH: 3.02 / CARD_ASPECT, gridOffsetY: -0.1 };
const PLAQUE = { frameW: 5.2, frameH: 3.08, w: 4.95, h: 2.8 };

// Share of the section's scroll that raises the trophy; the rest holds it
// upright and pinned, so there is a moment to turn it before it scrolls away.
const RAISE_SHARE = 0.78;
const QUARTER = Math.PI / 2;
const FACE_NAMES = ['Front', 'Right side', 'Back', 'Left side'];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Seeded PRNG, so the brushed-metal texture is the same on every load. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- textures ----------------------------------------------------------------

function brushedGold(g, w, h, seed) {
  const grad = g.createLinearGradient(0, 0, w * 0.3, h);
  // Sampled off the real plates: a warm brass rather than a yellow gold.
  grad.addColorStop(0, '#d4a458');
  grad.addColorStop(0.42, '#e8c68c');
  grad.addColorStop(0.72, '#cf9c52');
  grad.addColorStop(1, '#b8873f');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const rnd = mulberry32(seed);
  for (let i = 0; i < h * 1.8; i++) {
    const y = rnd() * h;
    g.fillStyle = rnd() < 0.5 ? `rgba(255,246,214,${0.05 + rnd() * 0.09})` : `rgba(96,64,12,${0.04 + rnd() * 0.08})`;
    g.fillRect(rnd() * w * 0.7 - w * 0.2, y, w * (0.35 + rnd() * 0.9), 1);
  }
  g.strokeStyle = 'rgba(90,60,14,0.6)';
  g.lineWidth = Math.max(2, h * 0.012);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
}

/**
 * A gold plate: a colour canvas plus a packed occlusion (R) / roughness (G) /
 * metalness (B) canvas, so the engraving reads as black ink set into polished
 * metal. The ink is fully occluded: even a near-black metal picks up a
 * colour-independent Fresnel sheen from the studio's reflections, which lit
 * the letters from inside; a cut into the plate does not catch the room light.
 */
function plateCanvases(w, h, seed, draw) {
  const color = document.createElement('canvas');
  const orm = document.createElement('canvas');
  color.width = orm.width = w;
  color.height = orm.height = h;
  const c = color.getContext('2d');
  const o = orm.getContext('2d');
  brushedGold(c, w, h, seed);
  o.fillStyle = 'rgb(255,70,255)';
  o.fillRect(0, 0, w, h);
  draw(c, o);
  return { color, orm };
}

/**
 * Draw `text`, optionally letter-spaced by `tracking` px. Canvas
 * letterSpacing is not supported everywhere, so spaced text is placed glyph
 * by glyph, each at the width of the text before it (which keeps kerning).
 */
function drawText(ctx, text, x, y, tracking) {
  if (!tracking) { ctx.fillText(text, x, y); return; }
  const total = ctx.measureText(text).width + tracking * (text.length - 1);
  const start = ctx.textAlign === 'center' ? x - total / 2 : x;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], start + ctx.measureText(text.slice(0, i)).width + tracking * i, y);
  }
  ctx.textAlign = align;
}

function engrave(c, o, text, x, y, font, { align = 'center', baseline = 'middle', tracking = 0 } = {}) {
  for (const [ctx, fill] of [[c, INK], [o, INK_ORM]]) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = fill;
    drawText(ctx, text, x, y, tracking);
  }
  // A hairline of light below the cut, as on the real engraving.
  c.globalCompositeOperation = 'destination-over';
  c.fillStyle = 'rgba(255,240,200,0.35)';
  drawText(c, text, x, y + 1.2, tracking);
  c.globalCompositeOperation = 'source-over';
}

/** A card plate's textures. Exported so they can be inspected on their own. */
export function cardCanvases(card, seed = 101) {
  const W = 1024, H = Math.round(W / CARD_ASPECT);
  const l = layoutCard(card.lines, measureCard);
  const px = l.fontSize * H;
  return plateCanvases(W, H, seed, (c, o) => {
    card.lines.forEach((line, i) => {
      engrave(c, o, line, W / 2, (l.top + (i + 0.5) * l.lineHeight) * H, `500 ${px}px ${CARD_FONT}`, { tracking: CARD_TRACKING * px });
    });
  });
}

/** The main plaque's textures. Exported so they can be inspected on their own. */
export function plaqueCanvases(logo) {
  const W = 1024, H = Math.round(W * PLAQUE.h / PLAQUE.w);
  return plateCanvases(W, H, 11, (c, o) => {
    if (logo) {
      const lh = H * 0.49, lw = lh * logo.width / logo.height;
      const lx = W * 0.063, ly = (H - lh) / 2;
      c.drawImage(logo, lx, ly, lw, lh);
      const tint = document.createElement('canvas');
      tint.width = logo.width; tint.height = logo.height;
      const t = tint.getContext('2d');
      t.drawImage(logo, 0, 0);
      t.globalCompositeOperation = 'source-in';
      t.fillStyle = INK_ORM;
      t.fillRect(0, 0, tint.width, tint.height);
      o.drawImage(tint, lx, ly, lw, lh);
    }
    // Both lines set to the same width, as on the real plaque.
    const x = W * 0.44, span = W * 0.47;
    [['Faraj League', 0.47], ['Champions', 0.665]].forEach(([text, base]) => {
      const size = span / measureCard(text);
      engrave(c, o, text, x, H * base, `500 ${size}px ${CARD_FONT}`, { align: 'left', baseline: 'alphabetic' });
    });
  });
}

function pebbleCanvas() {
  const N = 256, cells = 20, step = N / cells;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, N, N);
  g.globalCompositeOperation = 'lighten';
  const rnd = mulberry32(7);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x = (i + 0.5 + (j % 2) * 0.5 + (rnd() - 0.5) * 0.35) * step;
      const y = (j + 0.5 + (rnd() - 0.5) * 0.35) * step;
      const r = step * (0.52 + rnd() * 0.12);
      for (const dx of [-N, 0, N]) {
        for (const dy of [-N, 0, N]) {
          const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, '#fff');
          gr.addColorStop(0.55, 'rgba(255,255,255,0.72)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr;
          g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }
      }
    }
  }
  return cv;
}

function shadowCanvas() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)');
  gr.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, N, N);
  return cv;
}

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ---- the ball's surface --------------------------------------------------------

/**
 * Pebbling and seams are computed in the shader from the ball's own surface
 * direction, rather than painted on a stretched texture: the opening shot
 * looks straight down at the ball, which is exactly where a wrapped texture
 * pinches. Pebbles are a small tiling height map sampled three ways
 * (triplanar); the seams are the classic basketball pattern — two
 * perpendicular great circles and two circles parallel to one of them.
 */
function ballMaterial(THREE, pebbleTex) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xe8b64c, metalness: 1, roughness: 0.42 });
  // Per seam, xyz: the axis n, w: the latitude; and xyz: the squeeze direction m, w: its amount k.
  const vec4 = (xyz, w) => { const v = new THREE.Vector3(...xyz).normalize(); return new THREE.Vector4(v.x, v.y, v.z, w); };
  const seam = ({ n, lat = 0 }) => vec4(n, lat);
  const bend = ({ bend: b }) => (b ? vec4(b.m, b.k) : new THREE.Vector4(1, 0, 0, 0));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uPebble: { value: pebbleTex },
      uPebbleScale: { value: 0.8 },
      uSeamCross: { value: seam(BALL_SEAMS.cross) },
      uSeamMiddle: { value: seam(BALL_SEAMS.middle) },
      uSeamUpper: { value: seam(BALL_SEAMS.upper) },
      uSeamLower: { value: seam(BALL_SEAMS.lower) },
      uBendUpper: { value: bend(BALL_SEAMS.upper) },
      uBendLower: { value: bend(BALL_SEAMS.lower) },
      uSeamW: { value: 0.024 },
      uBump: { value: 0.9 },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBallPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBallPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBallPos;
        uniform sampler2D uPebble;
        uniform float uPebbleScale, uSeamW, uBump;
        uniform vec4 uSeamCross, uSeamMiddle, uSeamUpper, uSeamLower, uBendUpper, uBendLower;
        // Angle between a point on the ball and one seam (see BALL_SEAMS).
        float seamDist(vec4 s, vec4 b, vec3 n) {
          float m = dot(b.xyz, n);
          return abs(asin(clamp(dot(s.xyz, n), -1.0, 1.0)) - s.w - b.w * m * m);
        }
        vec3 ballPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
          vec3 sx = normalize(dFdx(surfPos)), sy = normalize(dFdy(surfPos));
          vec3 r1 = cross(sy, surfNorm), r2 = cross(surfNorm, sx);
          float det = dot(sx, r1) * faceDir;
          vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
          return normalize(abs(det) * surfNorm - grad);
        }`)
      .replace('#include <map_fragment>', `
        vec3 bn = normalize(vBallPos);
        float seamD = min(min(seamDist(uSeamCross, vec4(0.0), bn), seamDist(uSeamMiddle, vec4(0.0), bn)),
                          min(seamDist(uSeamUpper, uBendUpper, bn), seamDist(uSeamLower, uBendLower, bn)));
        float seamT = clamp(seamD / uSeamW, 0.0, 1.0);
        float seamMask = 1.0 - smoothstep(0.55, 1.0, seamT);
        float pebbleW = smoothstep(1.0, 1.9, seamD / uSeamW);
        vec3 tp = vBallPos * uPebbleScale;
        vec3 tw = pow(abs(bn), vec3(4.0));
        tw /= (tw.x + tw.y + tw.z);
        float pebble = texture2D(uPebble, tp.yz).r * tw.x + texture2D(uPebble, tp.xz).r * tw.y + texture2D(uPebble, tp.xy).r * tw.z;
        float ballH = pebble * 0.3 * pebbleW - (1.0 - seamT * seamT) * 0.55;
        #include <map_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, mix(0.72, 1.0, pebble), pebbleW) * mix(1.0, 1.08, seamMask);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor + (1.0 - pebble) * 0.12 * pebbleW, 0.14, seamMask);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = ballPerturb(-vViewPosition, normal, vec2(dFdx(ballH), dFdy(ballH)) * uBump, faceDirection);`);
  };
  return mat;
}

// ---- the scene -----------------------------------------------------------------

/**
 * What the metal reflects: a dim, warm room with a few glowing panels, like a
 * photographer's softboxes — a big one overhead for the highlight across the
 * ball, a warm key to the left as in the photo, and a low panel behind the
 * viewer so the plates catch light. Only ever rendered into the environment
 * map, never shown.
 */
function studioScene(THREE) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(44, 32, 44), new THREE.MeshBasicMaterial({ color: 0x4a443d, side: THREE.BackSide }));
  room.position.y = 10;
  scene.add(room);
  const panel = (w, h, pos, intensity, color) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 8, 0);
    scene.add(m);
  };
  panel(18, 10, [0, 25, 5], 10, 0xfff1dc);
  panel(10, 16, [-20, 11, 9], 7, 0xffe3bd);
  panel(8, 12, [20, 13, -5], 3.5, 0xfff4e6);
  panel(30, 10, [0, 9, 21], 6, 0xfff8ee);
  // Light bounced up off a warm surface, as the wall does in the photo, so the
  // underside of the ball does not go muddy.
  panel(30, 12, [0, -8, 12], 1.4, 0xffe8cc);
  return scene;
}

function buildTrophy(THREE, { cards, logo, anisotropy }) {
  const group = new THREE.Group();
  const cardMeshes = [];
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = anisotropy;
    return t;
  };
  const plateMaterial = ({ color, orm }) => {
    const ormTex = tex(orm, false);
    return new THREE.MeshStandardMaterial({
      map: tex(color, true), aoMap: ormTex, roughnessMap: ormTex, metalnessMap: ormTex, roughness: 1, metalness: 1,
    });
  };

  // Matte black like the real base (about 16-20 of 255 in the photo). The
  // studio environment is bright enough that even a rough black reflects a
  // visible grey, so it gets only a sliver of it; the slot frames a little
  // more, to keep their edges.
  const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9, metalness: 0, envMapIntensity: 0.05 });
  const frameBlack = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.3, metalness: 0, envMapIntensity: 0.45 });
  const emptyPanel = new THREE.MeshStandardMaterial({ color: 0x040404, roughness: 0.85, metalness: 0, envMapIntensity: 0.05 });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(DIM.lowerW, DIM.lowerH, DIM.lowerW), black);
  lower.position.y = DIM.lowerH / 2;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(DIM.upperW, DIM.upperH, DIM.upperW), black);
  upper.position.y = DIM.lowerH + DIM.upperH / 2;
  group.add(lower, upper);

  const plaqueMat = plateMaterial(plaqueCanvases(logo));
  const plaqueFrameGeo = new THREE.BoxGeometry(PLAQUE.frameW, PLAQUE.frameH, 0.04);
  const plaqueGeo = new THREE.PlaneGeometry(PLAQUE.w, PLAQUE.h);
  const slotFrameGeo = new THREE.BoxGeometry(SLOT.w, SLOT.h, 0.035);
  const slotPlateGeo = new THREE.PlaneGeometry(SLOT.plateW, SLOT.plateH);

  const byFace = new Map();
  cards.forEach((card, i) => {
    const slot = slotForIndex(i);
    if (slot) byFace.set(`${slot.faceIndex}:${slot.row}:${slot.col}`, { card, index: i });
  });

  for (let face = 0; face < 4; face++) {
    const side = new THREE.Group();
    side.rotation.y = face * QUARTER;   // front +z, right +x, back −z, left −x
    group.add(side);

    const uz = DIM.upperW / 2;
    const frame = new THREE.Mesh(plaqueFrameGeo, frameBlack);
    frame.position.set(0, upper.position.y, uz + 0.02);
    const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaque.position.set(0, upper.position.y, uz + 0.042);
    side.add(frame, plaque);

    const lz = DIM.lowerW / 2;
    for (let row = 0; row < SLOT_ROWS; row++) {
      for (let col = 0; col < SLOT_COLUMNS; col++) {
        const x = (col - (SLOT_COLUMNS - 1) / 2) * (SLOT.w + SLOT.gapX);
        const y = DIM.lowerH / 2 + SLOT.gridOffsetY + ((SLOT_ROWS - 1) / 2 - row) * (SLOT.h + SLOT.gapY);
        const f = new THREE.Mesh(slotFrameGeo, frameBlack);
        f.position.set(x, y, lz + 0.0175);
        const filled = byFace.get(`${face}:${row}:${col}`);
        const plate = new THREE.Mesh(slotPlateGeo, filled ? plateMaterial(cardCanvases(filled.card, 101 + filled.index)) : emptyPanel);
        plate.position.set(x, y, lz + 0.037);
        if (filled) {
          plate.userData.card = filled.card;
          cardMeshes.push(plate);
        }
        side.add(f, plate);
      }
    }
  }

  // Stem: a twisted, faceted cup, like the polished one on the real trophy.
  const profile = [
    [1.32, 0], [1.36, 0.05], [1.3, 0.1], [1.05, 0.2], [0.8, 0.36], [0.62, 0.62], [0.5, 0.95],
    [0.43, 1.3], [0.45, 1.6], [0.53, 1.88], [0.64, 2.1], [0.6, 2.2], [0.45, 2.26],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const stemGeo = new THREE.LatheGeometry(profile, 10);
  const pos = stemGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getY(i) * 0.45, x = pos.getX(i), z = pos.getZ(i);
    pos.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), pos.getY(i), x * Math.sin(a) + z * Math.cos(a));
  }
  stemGeo.computeVertexNormals();
  const stem = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0xf0c25a, metalness: 1, roughness: 0.14, flatShading: true }));
  stem.position.y = BASE_TOP;
  group.add(stem);

  const pebble = tex(pebbleCanvas(), false);
  pebble.wrapS = pebble.wrapT = THREE.RepeatWrapping;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(DIM.ballR, 160, 120), ballMaterial(THREE, pebble));
  ball.position.y = BALL_Y;
  group.add(ball);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 13),
    new THREE.MeshBasicMaterial({ map: tex(shadowCanvas(), false), transparent: true, depthWrite: false, color: 0x000000 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;

  return { group, shadow, cardMeshes };
}

// ---- fallback (no WebGL) -------------------------------------------------------

function showFallback(section, cards) {
  section.classList.add('is-static', 'is-fallback');
  const view = section.querySelector('.trophy-view');
  view.innerHTML = cards.length
    ? `<div class="trophy-fallback">${cards.map(() => '<div class="trophy-fallback-slot"></div>').join('')}</div>`
    : '<p class="trophy-empty">The first champions are still to be crowned.</p>';
  view.querySelectorAll('.trophy-fallback-slot').forEach((slot, i) => slot.appendChild(cardElement(cards[i])));
}

// ---- mount ---------------------------------------------------------------------

/**
 * @param {HTMLElement} section a `.trophy-scroll` section — the awards page's or the home page's
 * @param {Array<{ team: string, season: string, lines: string[] }>} cards oldest first
 */
export async function mountTrophy(section, cards = []) {
  const stage = section.querySelector('.trophy-stage');
  const view = section.querySelector('.trophy-view');
  const canvas = section.querySelector('.trophy-canvas');
  const cue = section.querySelector('.trophy-cue');
  const srList = section.querySelector('.trophy-sr');
  if (srList) srList.innerHTML = cards.map(c => `<li>${esc(c.lines.join(', '))}</li>`).join('');

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  await loadCardFont();

  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) { showFallback(section, cards); return; }

  let THREE;
  try {
    THREE = await import(THREE_URL);
  } catch (err) {
    console.warn('Trophy: three.js unavailable', err);
    showFallback(section, cards);
    return;
  }

  const { showLoupe, hideLoupe, openModal } = overlays();
  const logo = await loadImage(`${getBasePath()}/images/trophy/plaque-logo.png`);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(studioScene(THREE), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff0d6, 2.2);
  key.position.set(-6, 20, 12);
  const rim = new THREE.DirectionalLight(0xffdca8, 0.9);
  rim.position.set(9, 12, -10);
  // A soft light from just above the viewer, so the plates catch it the way
  // the real ones catch the room light in the photo.
  const fill = new THREE.DirectionalLight(0xfff4e0, 1.2);
  fill.position.set(0, 9, 24);
  scene.add(key, rim, fill);

  const { group, shadow, cardMeshes } = buildTrophy(THREE, {
    cards, logo, anisotropy: renderer.capabilities.getMaxAnisotropy(),
  });
  // Each material gets the environment itself rather than through
  // scene.environment: with scene.environment, three.js replaces every
  // material's envMapIntensity with the scene's, and the black base would
  // reflect the whole bright studio as a charcoal grey.
  group.traverse(o => { if (o.material?.isMeshStandardMaterial) o.material.envMap = envMap; });
  scene.add(group, shadow);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  // ---- state
  let progressTarget = reduceMotion ? 1 : 0;
  let progress = progressTarget;
  let yaw = 0, yawTarget = 0;
  let startDist = 16, endDist = 40, startFov = 30;
  const END_FOV = 30;
  let active = false, raf = 0, lastT = 0, rendered = false;
  let pre = 0;            // px of the stage still below the top of the window, before it pins
  let cueInset = 0;       // px from the top of the controls row down to the scroll cue's text
  let cueRoom = '';
  let pinState = '';

  if (reduceMotion) section.classList.add('is-static');

  function frameDistances() {
    const tanV = Math.tan(THREE.MathUtils.degToRad(END_FOV / 2));
    // Opening shot: the ball alone, filling most of the frame. The camera has
    // to be close for the ball to hide the base beneath it — from further
    // back the base's corners peek out around it — so on a narrow screen the
    // lens widens instead of the camera backing off. It narrows again as the
    // camera pulls back: a gentle dolly zoom.
    startDist = 16;
    const ballTan = DIM.ballR / Math.sqrt(startDist ** 2 - DIM.ballR ** 2);
    startFov = Math.max(END_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(ballTan / (0.8 * Math.min(1, camera.aspect)))));
    // Upright: the whole trophy, with room for it to turn without clipping.
    const halfH = (TOP_Y / 2) * 1.06;
    const halfW = 4.3;
    endDist = Math.max(halfH / tanV, halfW / (tanV * camera.aspect)) + DIM.lowerW / 2;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    const zoom = canvas.getBoundingClientRect().width / w || 1;   // the site zooms <html> 110% on desktop
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * zoom);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    frameDistances();
    if (cue) {
      const text = document.createRange();
      text.selectNodeContents(cue);
      cueInset = (text.getBoundingClientRect().top - cue.getBoundingClientRect().top) / zoom;
    }
    // Under the desktop zoom, 100vh is 10% taller than the window; size the
    // stage from the real window instead so its controls stay on screen.
    const k = section.getBoundingClientRect().height / section.offsetHeight || 1;
    if (Math.abs(k - 1) > 0.01) section.style.setProperty('--trophy-h', `${window.innerHeight / k}px`);
    else section.style.removeProperty('--trophy-h');
    return true;
  }

  /**
   * Pin the stage and read how far the trophy has been raised.
   *
   * The pinning is done here rather than with position:sticky, which cannot
   * work on this site: body has overflow-x:hidden, which makes it a scroll
   * container that never scrolls, so sticky elements inside it never stick
   * (the nav's own position:sticky is inert for the same reason).
   */
  function readScroll() {
    if (reduceMotion || !section.offsetHeight) return;
    const rect = section.getBoundingClientRect();
    // Rects come back zoomed (the site zooms <html> 110% on desktop) while
    // offsetHeight does not; convert everything to rect units.
    const k = rect.height / section.offsetHeight || 1;
    const stageH = stage.offsetHeight * k;
    const state = rect.top > 0 ? '' : rect.bottom > stageH ? 'is-pinned' : 'is-past';
    if (state !== pinState) {
      section.classList.remove('is-pinned', 'is-past');
      if (state) section.classList.add(state);
      pinState = state;
    }
    pre = Math.max(0, rect.top / k);
    section.style.setProperty('--trophy-pre', `${pre.toFixed(1)}px`);
    const travel = rect.height - stageH;
    progressTarget = travel > 0 ? clamp01(-rect.top / (travel * RAISE_SHARE)) : 1;
  }

  const target = new THREE.Vector3();
  function placeCamera() {
    const e = easeInOut(progress);
    const polar = 0.02 + (THREE.MathUtils.degToRad(81) - 0.02) * e;
    const azimuth = 0.62 * (1 - e);
    const pull = easeInOut(clamp01(progress * 1.1));
    const dist = startDist + (endDist - startDist) * pull;
    camera.fov = startFov + (END_FOV - startFov) * pull;
    camera.updateProjectionMatrix();
    target.set(0, BALL_Y + (TOP_Y * 0.5 - 0.3 - BALL_Y) * e, 0);
    camera.position.set(
      target.x + dist * Math.sin(polar) * Math.sin(azimuth),
      target.y + dist * Math.cos(polar),
      target.z + dist * Math.sin(polar) * Math.cos(azimuth),
    );
    camera.lookAt(target);
    // Until the stage pins, part of it is still below the window — at the top
    // of the awards page by the height of the nav, at the bottom of the home
    // page by however much has scrolled into view. Centre the shot on the part
    // that can be seen, but only so far that the ball stays inside the stage.
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const shift = Math.min(pre / 2, Math.max(0, h / 2 - 0.44 * Math.min(w, h)));
    if (shift > 0.5 && w && h) camera.setViewOffset(w, h, 0, shift, w, h);
    else if (camera.view?.enabled) camera.clearViewOffset();
    // The scroll cue rides up with the bottom of the window (trophy.css). While
    // the ball still reaches down past it — as the home page's trophy scrolls
    // up into view, with only its top half on screen — the cue would be printed
    // across the ball, so it waits until the ball has cleared it.
    const ballPx = (h / 2) * Math.tan(Math.asin(DIM.ballR / dist)) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const clearance = (h / 2 + shift - ballPx) - pre + cueInset;
    const room = clamp01((clearance + 4) / 12).toFixed(2);
    if (room !== cueRoom) { cueRoom = room; stage.style.setProperty('--cue-room', room); }
  }

  const upright = () => progress > 0.985;
  const faceIndex = () => (((Math.round(-yaw / QUARTER)) % 4) + 4) % 4;

  const dots = section.querySelector('.trophy-dots');
  const faceLabel = section.querySelector('.trophy-face-label');
  dots.innerHTML = FACE_NAMES.map((n, i) => `<button type="button" class="trophy-dot" data-face="${i}" aria-label="Show ${n.toLowerCase()}"></button>`).join('');

  let shownFace = -1;
  function updateUi() {
    stage.style.setProperty('--raise', progress.toFixed(3));
    stage.classList.toggle('is-upright', upright());
    const f = faceIndex();
    if (f !== shownFace) {
      shownFace = f;
      dots.querySelectorAll('.trophy-dot').forEach((d, i) => d.classList.toggle('is-active', i === f));
      if (faceLabel) faceLabel.textContent = FACE_NAMES[f];
    }
  }

  function frame(t) {
    raf = 0;
    // Capped, but generously: a slow device should finish a turn late, not in slow motion.
    const dt = lastT ? Math.min(0.12, (t - lastT) / 1000) : 1 / 60;
    lastT = t;
    progress += (progressTarget - progress) * (1 - Math.exp(-dt * 7));
    if (Math.abs(progressTarget - progress) < 0.0004) progress = progressTarget;
    yaw += (yawTarget - yaw) * (1 - Math.exp(-dt * (dragging ? 22 : 7)));
    if (Math.abs(yawTarget - yaw) < 0.0004) yaw = yawTarget;
    group.rotation.y = yaw;
    placeCamera();
    updateUi();
    renderer.render(scene, camera);
    if (!rendered) { rendered = true; section.classList.add('is-ready'); }
    if (active && (progress !== progressTarget || yaw !== yawTarget)) raf = requestAnimationFrame(frame);
    else lastT = 0;
  }
  const kick = () => { if (active && !raf) raf = requestAnimationFrame(frame); };

  // Arriving at the page (it scrolls to the top) should not replay the move
  // backwards from wherever it was left: jump straight to the scroll position.
  const io = new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    if (active && resize()) { readScroll(); progress = progressTarget; kick(); }
  });
  io.observe(section);
  new ResizeObserver(() => { if (resize()) { readScroll(); kick(); } }).observe(view);
  // Pinning has to follow every scroll, drawn or not, or the stage would be
  // left fixed over the page when a fast fling carries it out of view.
  window.addEventListener('scroll', () => { readScroll(); kick(); hideLoupe(); }, { passive: true });

  // ---- turning
  const snap = (v) => Math.round(v / QUARTER) * QUARTER;
  const turn = (dir) => { if (!upright()) return; yawTarget = snap(yawTarget) - dir * QUARTER; kick(); };
  section.querySelectorAll('.trophy-arrow').forEach(b => b.addEventListener('click', () => turn(Number(b.dataset.turn))));
  dots.addEventListener('click', (e) => {
    const d = e.target.closest('.trophy-dot');
    if (!d || !upright()) return;
    const want = Number(d.dataset.face);
    let delta = ((want - faceIndex()) % 4 + 4) % 4;
    if (delta === 3) delta = -1;
    yawTarget = snap(yawTarget) - delta * QUARTER;
    kick();
  });
  stage.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { turn(-1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { turn(1); e.preventDefault(); }
  });

  // ---- pointer: drag to turn, hover to magnify, tap to open
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function cardAt(clientX, clientY) {
    if (!upright() || !cardMeshes.length) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(cardMeshes, false)[0]?.object.userData.card || null;
  }

  let dragging = false, down = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now(), yaw: yawTarget, id: e.pointerId };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (down && e.pointerId === down.id && upright()) {
      const dx = e.clientX - down.x;
      if (!dragging && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - down.y)) {
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add('is-dragging');
        hideLoupe();
      }
      if (dragging) {
        yawTarget = down.yaw + (dx / canvas.clientWidth) * Math.PI * 1.6;
        kick();
        return;
      }
    }
    if (e.pointerType === 'mouse' && !down) {
      const card = cardAt(e.clientX, e.clientY);
      canvas.classList.toggle('is-over-card', !!card);
      if (card) showLoupe(card, e.clientX, e.clientY); else hideLoupe();
    }
  });
  let justDragged = false;
  const release = (e) => {
    if (!down || e.pointerId !== down.id) return;
    down = null;
    if (!dragging) return;
    dragging = false;
    justDragged = true;
    canvas.classList.remove('is-dragging');
    yawTarget = snap(yawTarget);
    kick();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  // Cards open on click, not pointerup. On touch the browser fires its click
  // after the finger lifts, at whatever is under it by then — had the card
  // opened on pointerup, that click would land on the new overlay's backdrop
  // and close it again at once.
  canvas.addEventListener('click', (e) => {
    if (justDragged) { justDragged = false; return; }
    const card = cardAt(e.clientX, e.clientY);
    if (card) { hideLoupe(); openModal(card); }
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hideLoupe(); canvas.classList.remove('is-over-card'); } });

  // First frame now; the observer takes over deciding when to draw.
  resize();
  readScroll();
  progress = progressTarget;
  active = true;
  kick();
}
