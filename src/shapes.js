// ============================================================================
// shapes.js — shape registry + runtime texture baking.
//
// Player dots are circles; enemies are *other* shapes (square, triangle, …).
// Each shape is a small draw function. To add a new enemy silhouette, add one
// entry here — everything else (enemies, textures) picks it up automatically.
//
// Every drawer fills a white shape inside a `size` x `size` box (origin 0,0).
// Colour comes later via sprite tint, so the texture itself is always white.
// ============================================================================

export const SHAPES = {
  circle(g, size) {
    const r = size / 2;
    g.fillCircle(r, r, r);
  },

  square(g, size) {
    g.fillRect(0, 0, size, size);
  },

  triangle(g, size) {
    // Upward-pointing triangle filling the box.
    g.fillTriangle(size / 2, 0, size, size, 0, size);
  },

  dart(g, size) {
    // A thin needle: a long sharp tip up top and one very short base side at the
    // bottom. Drawn pointing "up"; the sprite is rotated so the tip leads travel.
    const half = size * 0.22; // half-width of the short base (keeps it slim)
    g.fillTriangle(size / 2, 0, size / 2 + half, size, size / 2 - half, size);
  },

  x(g, size) {
    // A bold saltire (diagonal cross) — two thick diagonal bars. Corners spill a
    // hair outside the box and get clipped by generateTexture, giving flat arm-tips.
    const o = (size * 0.26) / 2 / Math.SQRT2; // half-thickness, projected onto an axis
    const s = size;
    g.fillPoints(
      [
        { x: 0 + o, y: 0 - o },
        { x: 0 - o, y: 0 + o },
        { x: s - o, y: s + o },
        { x: s + o, y: s - o },
      ],
      true
    ); // "\" bar
    g.fillPoints(
      [
        { x: 0 + o, y: s + o },
        { x: 0 - o, y: s - o },
        { x: s - o, y: 0 - o },
        { x: s + o, y: 0 + o },
      ],
      true
    ); // "/" bar
  },

  hexagon(g, size) {
    // Pointy-top hexagon filling the box (used big, for the Warden boss).
    const r = size / 2;
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * (Math.PI / 3);
      pts.push({ x: r + Math.cos(a) * r, y: r + Math.sin(a) * r });
    }
    g.fillPoints(pts, true);
  },

  diamond(g, size) {
    const h = size / 2;
    g.fillPoints(
      [
        { x: h, y: 0 },
        { x: size, y: h },
        { x: h, y: size },
        { x: 0, y: h },
      ],
      true
    );
  },
};

/**
 * Bake a shape into a reusable white texture (tinted per-instance later).
 * No-op if the texture key already exists.
 * @param {Phaser.Scene} scene
 * @param {string} key   texture key to create
 * @param {string} shape one of the keys in SHAPES
 * @param {number} size  width == height of the texture, in pixels
 */
export function makeShapeTexture(scene, key, shape, size) {
  if (scene.textures.exists(key)) return;
  const draw = SHAPES[shape];
  if (!draw) throw new Error(`Unknown shape: "${shape}"`);

  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  draw(g, size);
  g.generateTexture(key, size, size);
  g.destroy();
}

/** Conventional texture key for a given shape (e.g. "square" → "shape_square"). */
export function shapeTextureKey(shape) {
  return `shape_${shape}`;
}
