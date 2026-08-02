// ============================================================================
// levelgen.js — procedural dungeon generator.
//
// Produces a tile grid (0 = wall, 1 = floor) plus a list of rooms. Rooms are
// carved out and connected by L-shaped corridors so every room is reachable.
//
// This is intentionally simple and easy to extend later (BSP splits, cave
// automata, boss rooms, locked doors, …). Everything downstream only needs the
// returned { grid, width, height, rooms }.
// ============================================================================

import { makeRng, randInt } from './util.js';

export const WALL = 0;
export const FLOOR = 1;

/**
 * @param {object} opts
 * @param {number} opts.width   grid width in tiles
 * @param {number} opts.height  grid height in tiles
 * @param {number} opts.depth   current dungeon depth (scales room count)
 * @param {number} opts.seed    RNG seed (same seed → same level)
 * @returns {{ grid:number[][], width:number, height:number, rooms:Room[] }}
 */
export function generateLevel({ width, height, depth = 1, seed = 1 }) {
  const rng = makeRng(seed + depth * 1013);

  // Start every tile as solid wall, then carve rooms + corridors into it.
  const grid = createFilledGrid(width, height, WALL);

  const roomCount = 5 + depth; // more rooms the deeper you go
  const rooms = [];
  const maxAttempts = roomCount * 6;

  for (let attempt = 0; attempt < maxAttempts && rooms.length < roomCount; attempt++) {
    const room = randomRoom(rng, width, height);
    if (rooms.some((r) => roomsOverlap(r, room, 1))) continue; // keep a 1-tile gap
    carveRoom(grid, room);
    rooms.push(room);
  }

  // Connect rooms in sequence so the whole dungeon is traversable.
  for (let i = 1; i < rooms.length; i++) {
    connectRooms(grid, rooms[i - 1], rooms[i], rng);
  }

  // Start = first room's center. Exit (staircase down) = the room whose center
  // is farthest from the start, so descending means crossing the dungeon.
  const start = roomCenterTile(rooms[0]);
  let exit = start;
  let exitDistSq = -1;
  for (let i = 1; i < rooms.length; i++) {
    const c = roomCenterTile(rooms[i]);
    const dSq = (c.tx - start.tx) ** 2 + (c.ty - start.ty) ** 2;
    if (dSq > exitDistSq) {
      exitDistSq = dSq;
      exit = c;
    }
  }

  return { grid, width, height, rooms, start, exit };
}

// ---------------------------------------------------------------------------
// Room helpers
// ---------------------------------------------------------------------------

/** @typedef {{x:number,y:number,w:number,h:number}} Room  (tile coordinates) */

function randomRoom(rng, width, height) {
  const w = randInt(rng, 5, 9);
  const h = randInt(rng, 4, 8);
  const x = randInt(rng, 1, width - w - 2);
  const y = randInt(rng, 1, height - h - 2);
  return { x, y, w, h };
}

function roomsOverlap(a, b, pad = 0) {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

export function roomCenterTile(room) {
  return {
    tx: Math.floor(room.x + room.w / 2),
    ty: Math.floor(room.y + room.h / 2),
  };
}

// ---------------------------------------------------------------------------
// Carving
// ---------------------------------------------------------------------------

function createFilledGrid(width, height, value) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    grid.push(new Array(width).fill(value));
  }
  return grid;
}

function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      grid[y][x] = FLOOR;
    }
  }
}

/** Carve an L-shaped, 2-tile-wide corridor between two room centers. */
function connectRooms(grid, a, b, rng) {
  const ca = roomCenterTile(a);
  const cb = roomCenterTile(b);
  if (rng() < 0.5) {
    carveHTunnel(grid, ca.tx, cb.tx, ca.ty);
    carveVTunnel(grid, ca.ty, cb.ty, cb.tx);
  } else {
    carveVTunnel(grid, ca.ty, cb.ty, ca.tx);
    carveHTunnel(grid, ca.tx, cb.tx, cb.ty);
  }
}

function carveHTunnel(grid, x1, x2, y) {
  const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
  for (let x = lo; x <= hi; x++) {
    setFloorSafe(grid, x, y);
    setFloorSafe(grid, x, y + 1); // width 2
  }
}

function carveVTunnel(grid, y1, y2, x) {
  const [lo, hi] = y1 < y2 ? [y1, y2] : [y2, y1];
  for (let y = lo; y <= hi; y++) {
    setFloorSafe(grid, x, y);
    setFloorSafe(grid, x + 1, y); // width 2
  }
}

function setFloorSafe(grid, x, y) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    grid[y][x] = FLOOR;
  }
}
