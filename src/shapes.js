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
