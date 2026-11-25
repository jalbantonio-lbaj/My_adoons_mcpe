import { world, system, BlockPermutation } from "@minecraft/server";

const NS = "oredim";
const OVERWORLD = "minecraft:overworld";

const CHUNK = 16;
const VIEW = 4;
const FLOOR = 40;
const SEA = 62;
const BASE = 68;
const BLOCK_BUDGET = 1100;
const URGENT_BUDGET = 6000;

const ORES = [
  { key: "coal", name: "Coal", seed: 101,
    items: ["minecraft:coal"],
    solid: ["minecraft:coal_block"],
    ore: ["minecraft:coal_ore"], deep: ["minecraft:deepslate_coal_ore"] },
  { key: "copper", name: "Copper", seed: 211,
    items: ["minecraft:copper_ingot", "minecraft:raw_copper"],
    solid: ["minecraft:waxed_copper", "minecraft:waxed_copper_block", "minecraft:copper_block"],
    ore: ["minecraft:copper_ore"], deep: ["minecraft:deepslate_copper_ore"] },
  { key: "iron", name: "Iron", seed: 337,
    items: ["minecraft:iron_ingot", "minecraft:raw_iron"],
    solid: ["minecraft:iron_block"],
    ore: ["minecraft:iron_ore"], deep: ["minecraft:deepslate_iron_ore"] },
  { key: "gold", name: "Gold", seed: 449,
    items: ["minecraft:gold_ingot", "minecraft:raw_gold"],
    solid: ["minecraft:gold_block"],
    ore: ["minecraft:gold_ore"], deep: ["minecraft:deepslate_gold_ore"] },
  { key: "redstone", name: "Redstone", seed: 557,
    items: ["minecraft:redstone"],
    solid: ["minecraft:redstone_block"],
    ore: ["minecraft:redstone_ore"], deep: ["minecraft:deepslate_redstone_ore"] },
  { key: "lapis", name: "Lapis", seed: 673,
    items: ["minecraft:lapis_lazuli"],
    solid: ["minecraft:lapis_block"],
    ore: ["minecraft:lapis_ore"], deep: ["minecraft:deepslate_lapis_ore"] },
  { key: "diamond", name: "Diamond", seed: 787,
    items: ["minecraft:diamond"],
    solid: ["minecraft:diamond_block"],
    ore: ["minecraft:diamond_ore"], deep: ["minecraft:deepslate_diamond_ore"] },
  { key: "emerald", name: "Emerald", seed: 881,
    items: ["minecraft:emerald"],
    solid: ["minecraft:emerald_block"],
    ore: ["minecraft:emerald_ore"], deep: ["minecraft:deepslate_emerald_ore"] },
  { key: "quartz", name: "Quartz", seed: 991,
    items: ["minecraft:quartz"],
    solid: ["minecraft:quartz_block"],
    ore: ["minecraft:quartz_ore"], deep: ["minecraft:quartz_ore"] },
  { key: "netherite", name: "Netherite", seed: 1093,
    items: ["minecraft:netherite_ingot", "minecraft:netherite_scrap"],
    solid: ["minecraft:netherite_block"],
    ore: ["minecraft:ancient_debris"], deep: ["minecraft:ancient_debris"] },
];

const PASSIVE = ["cow", "pig", "sheep", "chicken", "rabbit", "horse", "wolf", "fox", "villager", "bee"];
const HOSTILE = ["zombie", "skeleton", "creeper", "spider"];

const O = {};
const DIM_OF = {};
const KEY_OF_DIM = {};
const ITEM_KEY = {};
const PORTAL_IDS = new Set();
for (const o of ORES) {
  O[o.key] = o;
  DIM_OF[o.key] = NS + ":" + o.key;
  KEY_OF_DIM[NS + ":" + o.key] = o.key;
  for (const it of o.items) ITEM_KEY[it] = o.key;
  o.leaves = NS + ":" + o.key + "_leaves";
  o.log = NS + ":" + o.key + "_log";
  o.wood = NS + ":" + o.key + "_wood";
  o.strippedLog = NS + ":" + o.key + "_stripped_log";
  o.strippedWood = NS + ":" + o.key + "_stripped_wood";
  o.planks = NS + ":" + o.key + "_planks";
  o.portal = NS + ":" + o.key + "_portal";
  PORTAL_IDS.add(o.portal);
  o.passive = PASSIVE.map((m) => NS + ":" + o.key + "_" + m);
  o.hostile = HOSTILE.map((m) => NS + ":" + o.key + "_" + m);
}

system.beforeEvents.startup.subscribe((event) => {
  for (const o of ORES) {
    try { event.dimensionRegistry.registerCustomDimension(DIM_OF[o.key]); } catch (e) {}
  }
});

const permCache = {};
function P(id, states) {
  const key = states ? id + JSON.stringify(states) : id;
  if (permCache[key] !== undefined) return permCache[key];
  let p = null;
  try { p = states ? BlockPermutation.resolve(id, states) : BlockPermutation.resolve(id); } catch (e) {}
  permCache[key] = p;
  return p;
}
function firstValid(list, fallback) {
  for (const id of list) if (P(id)) return id;
  return fallback;
}
function setB(dim, x, y, z, id, states) {
  const p = P(id, states);
  if (!p) return;
  try {
    const b = dim.getBlock({ x, y, z });
    if (b) b.setPermutation(p);
  } catch (e) {}
}
function setIfAir(dim, x, y, z, id) {
  try {
    const b = dim.getBlock({ x, y, z });
    if (b && b.isAir) {
      const p = P(id);
      if (p) b.setPermutation(p);
    }
  } catch (e) {}
}

let resolved = false;
function resolveBlocks() {
  if (resolved) return;
  resolved = true;
  for (const o of ORES) {
    o.solidId = firstValid(o.solid, "minecraft:stone");
    o.oreId = firstValid(o.ore, o.solidId);
    o.deepId = firstValid(o.deep, o.oreId);
    o.leafId = P(o.leaves) ? o.leaves : o.oreId;
    o.logId = P(o.log) ? o.log : o.solidId;
    o.woodId = P(o.wood) ? o.wood : o.logId;
    o.strippedLogId = P(o.strippedLog) ? o.strippedLog : o.logId;
    o.strippedWoodId = P(o.strippedWood) ? o.strippedWood : o.logId;
    o.planksId = P(o.planks) ? o.planks : o.solidId;
  }
}

function hash2(x, z, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + seed) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function latt(ix, iz, salt) {
  return hash2(ix + salt * 1013, iz - salt * 977, salt) / 4294967296;
}
function noise2(x, z, salt) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const xf = x - x0, zf = z - z0;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const n00 = latt(x0, z0, salt), n10 = latt(x0 + 1, z0, salt);
  const n01 = latt(x0, z0 + 1, salt), n11 = latt(x0 + 1, z0 + 1, salt);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

function heightAt(key, x, z) {
  const s = O[key].seed;
  const hills = noise2(x * 0.004, z * 0.004, s + 3);
  const amp = 11 + hills * 26;
  const n1 = noise2(x * 0.012, z * 0.012, s + 1);
  const n2 = noise2(x * 0.05, z * 0.05, s + 2);

  return Math.max(FLOOR + 4, Math.round(BASE + (n1 - 0.5) * 2 * amp + (n2 - 0.5) * 8));
}

const TREE_CELL = 6;
function treeSpot(key, x, z) {
  const cx = Math.floor(x / TREE_CELL), cz = Math.floor(z / TREE_CELL);
  const h = hash2(cx, cz, O[key].seed + 91);
  return x - cx * TREE_CELL === 1 + (h % (TREE_CELL - 2)) &&
         z - cz * TREE_CELL === 1 + ((h >>> 8) % (TREE_CELL - 2));
}
function treeDensity(key, x, z) {
  const n = noise2(x * 0.006, z * 0.006, O[key].seed + 4);
  return 0.05 + n * n * 0.6;
}

function buildTree(dim, o, x, y, z, rng) {
  const h = 5 + Math.floor(rng() * 3);
  for (let i = 1; i <= h; i++) setB(dim, x, y + i, z, o.logId);
  const topY = y + h;
  const leaf = (lx, ly, lz) => {
    setIfAir(dim, lx, ly, lz, o.leafId);
  };
  for (let ly = topY - 1; ly <= topY; ly++)
    for (let lx = -2; lx <= 2; lx++)
      for (let lz = -2; lz <= 2; lz++) {
        if (lx === 0 && lz === 0) continue;
        if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && rng() < 0.6) continue;
        leaf(x + lx, ly, z + lz);
      }
  for (let ly = topY + 1; ly <= topY + 2; ly++)
    for (let lx = -1; lx <= 1; lx++)
      for (let lz = -1; lz <= 1; lz++) {
        if (Math.abs(lx) === 1 && Math.abs(lz) === 1 && ly === topY + 2 && rng() < 0.7) continue;
        leaf(x + lx, ly, z + lz);
      }
}

const jobs = [];
const GENERATED = new Set();
const QUEUE = [];
const queued = new Set();

function cellKey(key, cx, cz) { return key + "|" + cx + "," + cz; }

function startChunk(dim, key, cx, cz) {
  const ox = cx * CHUNK, oz = cz * CHUNK;
  let probe;
  try { probe = dim.getBlock({ x: ox + 8, y: FLOOR, z: oz + 8 }); } catch (e) { probe = undefined; }
  if (!probe) return "wait";
  if (!probe.isAir) return "skip";

  const rng = mulberry32(hash2(cx * 31 + 7, cz * 17 + 3, O[key].seed));
  const cols = [];
  for (let lx = 0; lx < CHUNK; lx++)
    for (let lz = 0; lz < CHUNK; lz++) {
      const x = ox + lx, z = oz + lz;
      cols.push({ x, z, h: heightAt(key, x, z) });
    }
  cols.sort((a, b) =>
    Math.abs(a.x - (ox + 8)) + Math.abs(a.z - (oz + 8)) -
    (Math.abs(b.x - (ox + 8)) + Math.abs(b.z - (oz + 8))));
  jobs.push({ dim, key, ox, oz, cols, ci: 0, rng });
  return "started";
}

function placeColumn(job, col) {
  const dim = job.dim;
  const o = O[job.key];
  const h = col.h;
  let placed = 0;
  setB(dim, col.x, FLOOR, col.z, "minecraft:bedrock");
  placed++;
  for (let y = FLOOR + 1; y <= h; y++) {

    let id;
    if (y >= h - 4) {
      id = job.rng() < 0.5 ? o.solidId : o.oreId;
    } else {
      const r = job.rng();
      id = r < 0.5 ? o.solidId : r < 0.75 ? o.oreId : o.deepId;
    }
    setB(dim, col.x, y, col.z, id);
    placed++;
  }
  for (let y = h + 1; y <= SEA; y++) {
    setB(dim, col.x, y, col.z, "minecraft:water");
    placed++;
  }
  return placed;
}

function finishChunk(job) {
  const dim = job.dim, rng = job.rng, key = job.key;
  const o = O[key];
  for (const col of job.cols) {
    if (col.h < SEA) continue;
    if (!treeSpot(key, col.x, col.z)) continue;
    if (rng() < treeDensity(key, col.x, col.z)) buildTree(dim, o, col.x, col.h, col.z, rng);
  }
  const night = isNight();
  const n = Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const col = job.cols[Math.floor(rng() * job.cols.length)];
    if (col.h < SEA) continue;
    const pool = night && rng() < 0.45 ? o.hostile : o.passive;
    const id = pool[Math.floor(rng() * pool.length)];
    try { dim.spawnEntity(id, { x: col.x + 0.5, y: col.h + 2, z: col.z + 0.5 }); } catch (e) {}
  }
}

function isNight() {
  try {
    const t = world.getTimeOfDay();
    return t >= 13000 && t < 23000;
  } catch (e) { return false; }
}

function playersByDim() {
  const out = {};
  for (const p of world.getAllPlayers()) {
    const k = KEY_OF_DIM[p.dimension.id];
    if (!k) continue;
    (out[k] = out[k] || []).push([
      Math.floor(p.location.x / CHUNK), Math.floor(p.location.z / CHUNK)]);
  }
  return out;
}
function chunkDist(cx, cz, pcs) {
  let best = Infinity;
  for (const [pcx, pcz] of pcs) {
    const d = Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz));
    if (d < best) best = d;
  }
  return best;
}

system.runInterval(() => {
  if (!jobs.length) return;
  const byDim = playersByDim();
  for (const j of jobs) {
    const pcs = byDim[j.key];
    j.d = pcs ? chunkDist(j.ox / CHUNK, j.oz / CHUNK, pcs) : 999;
  }
  jobs.sort((a, b) => a.d - b.d);
  let budget = jobs[0].d === 0 ? URGENT_BUDGET : BLOCK_BUDGET;
  while (budget > 0 && jobs.length) {
    const job = jobs[0];
    while (budget > 0 && job.ci < job.cols.length) {
      budget -= placeColumn(job, job.cols[job.ci]);
      job.ci++;
    }
    if (job.ci >= job.cols.length) {
      finishChunk(job);
      jobs.shift();
    } else break;
  }
}, 1);

system.runInterval(() => {
  const byDim = playersByDim();
  for (const key in byDim)
    for (const [pcx, pcz] of byDim[key])
      for (let dx = -VIEW; dx <= VIEW; dx++)
        for (let dz = -VIEW; dz <= VIEW; dz++) {
          const cx = pcx + dx, cz = pcz + dz, k = cellKey(key, cx, cz);
          if (GENERATED.has(k) || queued.has(k)) continue;
          queued.add(k);
          QUEUE.push({ key, cx, cz, k, d: 0 });
        }
}, 10);

system.runInterval(() => {
  if (QUEUE.length === 0 || jobs.length > 4) return;
  const byDim = playersByDim();
  for (const c of QUEUE) {
    const pcs = byDim[c.key];
    c.d = pcs ? chunkDist(c.cx, c.cz, pcs) : 999;
  }
  QUEUE.sort((a, b) => a.d - b.d);
  let tries = 8;
  while (tries-- > 0 && QUEUE.length && jobs.length <= 4) {
    const cell = QUEUE.shift();
    queued.delete(cell.k);
    if (cell.d >= 999) continue;
    let dim;
    try { dim = world.getDimension(DIM_OF[cell.key]); } catch (e) { continue; }
    const res = startChunk(dim, cell.key, cell.cx, cell.cz);
    if (res === "wait") {
      queued.add(cell.k);
      QUEUE.push(cell);
      continue;
    }
    GENERATED.add(cell.k);
  }
}, 2);

const followCenter = {};
function safeId(pid) { return "oredim_follow_" + String(pid).replace(/[^0-9-]/g, ""); }

function dropFollow(pid) {
  delete followCenter[pid];
  (async () => {
    try { await world.tickingAreaManager.removeTickingArea(safeId(pid)); } catch (e) {}
  })();
}

system.runInterval(() => {
  const online = new Set();
  for (const player of world.getAllPlayers()) {
    online.add(player.id);
    const key = KEY_OF_DIM[player.dimension.id];
    if (!key) {
      if (followCenter[player.id]) dropFollow(player.id);
      continue;
    }
    const cx = Math.floor(player.location.x / CHUNK);
    const cz = Math.floor(player.location.z / CHUNK);
    const prev = followCenter[player.id];
    if (prev && prev.key === key && Math.abs(cx - prev.cx) < 2 && Math.abs(cz - prev.cz) < 2) continue;
    followCenter[player.id] = { key, cx, cz };
    const id = safeId(player.id);
    const R = (VIEW + 1) * CHUNK;
    const px = player.location.x, pz = player.location.z;
    (async () => {
      try { await world.tickingAreaManager.removeTickingArea(id); } catch (e) {}
      try {
        await world.tickingAreaManager.createTickingArea(id, {
          dimension: world.getDimension(DIM_OF[key]),
          from: { x: px - R, y: FLOOR - 4, z: pz - R },
          to: { x: px + R, y: 160, z: pz + R },
        });
      } catch (e) {}
    })();
  }
  for (const id in followCenter) {
    if (online.has(id)) continue;
    delete pcool[id];
    dropFollow(id);
  }
}, 30);

function chunkReady(key, cx, cz) {
  if (!GENERATED.has(cellKey(key, cx, cz))) return false;
  for (const j of jobs) if (j.key === key && j.ox === cx * CHUNK && j.oz === cz * CHUNK) return false;
  return true;
}
function nothingUnder(dim, x, y, z) {
  for (let dy = 1; dy <= 3; dy++) {
    let b;
    try { b = dim.getBlock({ x, y: y - dy, z }); } catch (e) { return true; }
    if (!b) return true;
    if (!b.isAir) return false;
  }
  return true;
}

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const key = KEY_OF_DIM[p.dimension.id];
    if (!key) continue;
    const loc = p.location;
    const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
    const ground = Math.max(heightAt(key, fx, fz), SEA);
    if (loc.y >= ground && loc.y >= FLOOR) continue;
    const cx = Math.floor(loc.x / CHUNK), cz = Math.floor(loc.z / CHUNK);
    if (loc.y >= FLOOR && (chunkReady(key, cx, cz) || !nothingUnder(p.dimension, fx, fy, fz))) continue;
    try {
      p.teleport({ x: loc.x, y: ground + 3, z: loc.z });
      p.addEffect("resistance", 60, { amplifier: 255, showParticles: false });
    } catch (e) {}
  }
}, 1);

const VILLAGE_GRID = 384;
const VILLAGE_CHANCE = 0.6;
const VILLAGE_R = 34;

const VILLAGE_BUILD_DIST = 28;
const VILLAGE_BUDGET = 700;

let villages = [];
const villageKeys = new Set();
const vops = [];
let vhead = 0;

function saveVillages() {
  try { world.setDynamicProperty("oredim:villages", JSON.stringify(villages)); } catch (e) {}
}
function loadVillages() {
  try {
    const raw = world.getDynamicProperty("oredim:villages");
    villages = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) { villages = []; }
  villageKeys.clear();
  for (const v of villages) villageKeys.add(v.k + "|" + v.gx + "," + v.gz);
}

function villageSite(key, gx, gz) {
  const h = hash2(gx * 7919 + 13, gz * 104729 + 7, O[key].seed + 9);
  if ((h % 1000) / 1000 >= VILLAGE_CHANCE) return null;
  const rng = mulberry32(h ^ 0x5f3a);
  const pad = VILLAGE_R + 16;
  const cx = gx * VILLAGE_GRID + pad + Math.floor(rng() * (VILLAGE_GRID - pad * 2));
  const cz = gz * VILLAGE_GRID + pad + Math.floor(rng() * (VILLAGE_GRID - pad * 2));
  return { cx, cz, rng };
}

function vset(dim, x, y, z, id, states) {
  if (id) vops.push({ dim, x, y, z, id, states });
}

function rotBox(dx, dz, w, d, rot) {
  if (rot === 1) return [d - 1 - dz, dx];
  if (rot === 2) return [w - 1 - dx, d - 1 - dz];
  if (rot === 3) return [dz, w - 1 - dx];
  return [dx, dz];
}

function houseOps(dim, o, ox, oy, oz, w, d, wallH, rot, rng) {
  const put = (dx, dy, dz, id, states) => {
    const [rx, rz] = rotBox(dx, dz, w, d, rot);
    vset(dim, ox + rx, oy + dy, oz + rz, id, states);
  };

  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++) {
      put(dx, -1, dz, o.strippedWoodId);
      put(dx, 0, dz, o.woodId);
    }

  for (let dy = 1; dy <= wallH; dy++)
    for (let dx = 0; dx < w; dx++)
      for (let dz = 0; dz < d; dz++) {
        const edge = dx === 0 || dz === 0 || dx === w - 1 || dz === d - 1;
        if (!edge) { put(dx, dy, dz, "minecraft:air"); continue; }
        const corner = (dx === 0 || dx === w - 1) && (dz === 0 || dz === d - 1);
        let id = corner ? o.logId : o.planksId;

        if (!corner && dy === 2 && (dx % 2 === 1 || dz % 2 === 1)) id = "minecraft:glass_pane";
        put(dx, dy, dz, id);
      }

  const doorX = Math.floor(w / 2);
  put(doorX, 1, 0, "minecraft:air");
  put(doorX, 2, 0, "minecraft:air");

  const peak = Math.floor(Math.min(w, d) / 2);
  for (let s = 0; s <= peak; s++) {
    const y = oy + wallH + 1 + s;
    for (let dx = -1 + s; dx < w + 1 - s; dx++)
      for (let dz = -1 + s; dz < d + 1 - s; dz++) {
        const ring = dx === -1 + s || dz === -1 + s || dx === w - s || dz === d - s;
        if (ring || s === peak) {
          const [rx, rz] = rotBox(dx, dz, w, d, rot);
          vset(dim, ox + rx, y, oz + rz, o.strippedWoodId);
        }
      }
  }

  put(1, 1, 1, "minecraft:lantern", { hanging: false });
  const JOBS = ["minecraft:composter", "minecraft:smithing_table", "minecraft:cartography_table",
    "minecraft:fletching_table", "minecraft:barrel", "minecraft:loom", "minecraft:smoker",
    "minecraft:stonecutter_block", "minecraft:grindstone", "minecraft:cauldron",
    "minecraft:lectern", "minecraft:blast_furnace"];
  put(w - 2, 1, d - 2, JOBS[Math.floor(rng() * JOBS.length)]);
  try {
    put(1, 1, d - 2, "minecraft:bed", { direction: (rot + 2) % 4, head_piece_bit: false });
    put(1, 1, d - 3, "minecraft:bed", { direction: (rot + 2) % 4, head_piece_bit: true });
  } catch (e) {}
}

function farmOps(dim, o, ox, oy, oz, w, d) {
  for (let dx = 0; dx < w; dx++)
    for (let dz = 0; dz < d; dz++) {
      const water = dz === Math.floor(d / 2) && dx > 0 && dx < w - 1;
      if (dx === 0 || dz === 0 || dx === w - 1 || dz === d - 1) {
        vset(dim, ox + dx, oy, oz + dz, o.strippedLogId);
        continue;
      }
      if (water) { vset(dim, ox + dx, oy, oz + dz, "minecraft:water"); continue; }
      vset(dim, ox + dx, oy, oz + dz, "minecraft:farmland", { moisturized_amount: 7 });
      vset(dim, ox + dx, oy + 1, oz + dz, "minecraft:wheat", { growth: 7 });
    }
}

function wellOps(dim, o, cx, y, cz) {
  for (let dx = -2; dx <= 2; dx++)
    for (let dz = -2; dz <= 2; dz++) {
      const r = Math.max(Math.abs(dx), Math.abs(dz));
      if (r === 2) vset(dim, cx + dx, y, cz + dz, o.strippedWoodId);
      else if (r === 1) vset(dim, cx + dx, y, cz + dz, o.solidId);
      else vset(dim, cx + dx, y, cz + dz, "minecraft:water");
    }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    for (let dy = 1; dy <= 3; dy++) vset(dim, cx + dx, y + dy, cz + dz, o.logId);
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) vset(dim, cx + dx, y + 4, cz + dz, o.strippedWoodId);
}

function lampOps(dim, o, x, y, z) {
  for (let dy = 1; dy <= 3; dy++) vset(dim, x, y + dy, z, o.logId);
  vset(dim, x, y + 4, z, "minecraft:lantern", { hanging: false });
}

function footprintReady(key, cx, cz) {
  const c0x = Math.floor((cx - VILLAGE_R) / CHUNK), c1x = Math.floor((cx + VILLAGE_R) / CHUNK);
  const c0z = Math.floor((cz - VILLAGE_R) / CHUNK), c1z = Math.floor((cz + VILLAGE_R) / CHUNK);
  for (let x = c0x; x <= c1x; x++)
    for (let z = c0z; z <= c1z; z++)
      if (!chunkReady(key, x, z)) return false;
  return true;
}

function buildVillage(dim, key, site) {
  const o = O[key];
  const rng = site.rng;
  const cx = site.cx, cz = site.cz;
  const baseY = Math.max(heightAt(key, cx, cz), SEA + 1);

  for (let dx = -VILLAGE_R; dx <= VILLAGE_R; dx++)
    for (let dz = -VILLAGE_R; dz <= VILLAGE_R; dz++) {
      if (dx * dx + dz * dz > VILLAGE_R * VILLAGE_R) continue;
      const x = cx + dx, z = cz + dz;
      const h = heightAt(key, x, z);
      for (let y = Math.min(h, baseY); y <= baseY; y++) vset(dim, x, y, z, o.oreId);

      for (let y = baseY + 1; y <= Math.max(h, baseY) + 10; y++)
        vset(dim, x, y, z, "minecraft:air");
      const rr = Math.sqrt(dx * dx + dz * dz);

      if (Math.abs(rr - 12) < 1.2 || Math.abs(rr - 22) < 1.2 ||
          ((Math.abs(dx) < 2 || Math.abs(dz) < 2) && rr < 23))
        vset(dim, x, baseY, z, o.strippedWoodId);
    }

  wellOps(dim, o, cx, baseY, cz);

  const RING_IN = 17, RING_OUT = 27;
  const spin = rng() * Math.PI * 2;
  const slots = [];
  for (let i = 0; i < 4; i++) {
    slots.push({ ang: spin + i * (Math.PI / 2) + Math.PI / 4, r: RING_IN });
    slots.push({ ang: spin + i * (Math.PI / 2), r: RING_OUT });
  }
  const spots = [];
  let farms = 1 + Math.floor(rng() * 2);
  for (const s of slots) {
    const x = Math.round(cx + Math.cos(s.ang) * s.r);
    const z = Math.round(cz + Math.sin(s.ang) * s.r);
    if (farms > 0 && rng() < 0.35) {
      farms--;
      farmOps(dim, o, x - 3, baseY, z - 3, 7, 7);
      continue;
    }
    const big = rng() < 0.35;
    houseOps(dim, o, x - 3, baseY, z - 3, big ? 9 : 7, big ? 7 : 6,
             big ? 4 : 3, Math.floor(rng() * 4), rng);
    spots.push({ x, z });
  }
  for (let i = 0; i < 4; i++) {
    const ang = i * (Math.PI / 2) + Math.PI / 4;
    lampOps(dim, o, Math.round(cx + Math.cos(ang) * 12), baseY,
            Math.round(cz + Math.sin(ang) * 12));
  }

  villages.push({ k: key, gx: site.gx, gz: site.gz, x: cx, z: cz, y: baseY, n: spots.length });
  villageKeys.add(key + "|" + site.gx + "," + site.gz);
  saveVillages();
  return { cx, cz, baseY, homes: spots.length };
}

system.runInterval(() => {
  if (vhead < vops.length) return;
  for (const p of world.getAllPlayers()) {
    const key = KEY_OF_DIM[p.dimension.id];
    if (!key) continue;
    const pgx = Math.floor(p.location.x / VILLAGE_GRID);
    const pgz = Math.floor(p.location.z / VILLAGE_GRID);
    for (let dgx = -1; dgx <= 1; dgx++)
      for (let dgz = -1; dgz <= 1; dgz++) {
        const gx = pgx + dgx, gz = pgz + dgz;
        if (villageKeys.has(key + "|" + gx + "," + gz)) continue;
        const site = villageSite(key, gx, gz);
        if (!site) { villageKeys.add(key + "|" + gx + "," + gz); continue; }
        const dx = site.cx - p.location.x, dz = site.cz - p.location.z;
        if (dx * dx + dz * dz > VILLAGE_BUILD_DIST * VILLAGE_BUILD_DIST) continue;
        if (Math.max(heightAt(key, site.cx, site.cz), 0) < SEA) {
          villageKeys.add(key + "|" + gx + "," + gz);
          continue;
        }
        if (!footprintReady(key, site.cx, site.cz)) continue;
        site.gx = gx; site.gz = gz;
        const built = buildVillage(p.dimension, key, site);
        system.runTimeout(() => populateVillage(p.dimension, key, built), 200);
        return;
      }
  }
}, 60);

system.runInterval(() => {
  if (vhead >= vops.length) {
    if (vops.length) { vops.length = 0; vhead = 0; }
    return;
  }
  const end = Math.min(vops.length, vhead + VILLAGE_BUDGET);
  for (; vhead < end; vhead++) {
    const op = vops[vhead];
    setB(op.dim, op.x, op.y, op.z, op.id, op.states);
  }
}, 1);

function populateVillage(dim, key, built) {
  const o = O[key];
  const n = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 14;
    const x = built.cx + Math.cos(ang) * r;
    const z = built.cz + Math.sin(ang) * r;
    try {
      dim.spawnEntity(NS + ":" + key + "_villager", { x, y: built.baseY + 2, z });
    } catch (e) {}
  }
  for (let i = 0; i < 3; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = 8 + Math.random() * 12;
    const id = o.passive[Math.floor(Math.random() * o.passive.length)];
    try {
      dim.spawnEntity(id, { x: built.cx + Math.cos(ang) * r, y: built.baseY + 2,
                            z: built.cz + Math.sin(ang) * r });
    } catch (e) {}
  }
}

let portals = [];

function savePortals() {
  try { world.setDynamicProperty("oredim:portals", JSON.stringify(portals)); } catch (e) {}
}
function loadPortals() {
  try {
    const raw = world.getDynamicProperty("oredim:portals");
    portals = typeof raw === "string" ? JSON.parse(raw) : [];
  } catch (e) { portals = []; }
}

function coord(axis, u, y, fixed) {
  return axis === "x" ? { x: u, y, z: fixed } : { x: fixed, y, z: u };
}
function blockAt(dim, pos) {
  try { return dim.getBlock(pos); } catch (e) { return undefined; }
}

const MAX_SIDE = 21;
const FLOOD_CAP = 512;
const OPEN_BLOCKS = new Set(["minecraft:water", "minecraft:fire", "minecraft:soul_fire",
  "minecraft:short_grass", "minecraft:tall_grass"]);

function isOpen(dim, axis, u, y, fixed) {
  const b = blockAt(dim, coord(axis, u, y, fixed));
  if (!b) return false;
  return b.isAir || OPEN_BLOCKS.has(b.typeId);
}

function isFrame(dim, axis, u, y, fixed) {
  const b = blockAt(dim, coord(axis, u, y, fixed));
  if (!b || b.isAir) return false;
  const t = b.typeId;
  if (OPEN_BLOCKS.has(t) || PORTAL_IDS.has(t)) return false;
  if (t === "minecraft:water" || t === "minecraft:lava" || t === "minecraft:flowing_water" ||
      t === "minecraft:flowing_lava") return false;
  return true;
}

function ringCells(axis, u0, y0, fixed, w, h) {
  const out = [];
  for (let u = u0 - 1; u <= u0 + w; u++) out.push(coord(axis, u, y0 - 1, fixed));
  for (let y = y0; y < y0 + h; y++) out.push(coord(axis, u0 + w, y, fixed));
  for (let u = u0 + w; u >= u0 - 1; u--) out.push(coord(axis, u, y0 + h, fixed));
  for (let y = y0 + h - 1; y >= y0; y--) out.push(coord(axis, u0 - 1, y, fixed));
  return out;
}

function validateFrame(dim, axis, u0, y0, fixed, w, h, clicked) {
  for (let u = u0; u < u0 + w; u++)
    for (let y = y0; y < y0 + h; y++)
      if (!isOpen(dim, axis, u, y, fixed)) return null;
  for (let u = u0; u < u0 + w; u++) {
    if (!isFrame(dim, axis, u, y0 - 1, fixed)) return null;
    if (!isFrame(dim, axis, u, y0 + h, fixed)) return null;
  }
  for (let y = y0; y < y0 + h; y++) {
    if (!isFrame(dim, axis, u0 - 1, y, fixed)) return null;
    if (!isFrame(dim, axis, u0 + w, y, fixed)) return null;
  }
  const cu = axis === "x" ? clicked.x : clicked.z;
  const cf = axis === "x" ? clicked.z : clicked.x;
  if (cf !== fixed) return null;
  const onBottom = clicked.y === y0 - 1 && cu >= u0 && cu < u0 + w;
  const onTop = clicked.y === y0 + h && cu >= u0 && cu < u0 + w;
  const onLeft = cu === u0 - 1 && clicked.y >= y0 && clicked.y < y0 + h;
  const onRight = cu === u0 + w && clicked.y >= y0 && clicked.y < y0 + h;
  if (!(onBottom || onTop || onLeft || onRight)) return null;
  const cells = [];
  for (let u = u0; u < u0 + w; u++)
    for (let y = y0; y < y0 + h; y++) cells.push(coord(axis, u, y, fixed));
  return { axis, cells, ring: ringCells(axis, u0, y0, fixed, w, h) };
}

function floodInterior(dim, axis, fixed, su, sy, clicked) {
  if (!isOpen(dim, axis, su, sy, fixed)) return null;
  const seen = new Set();
  const stack = [[su, sy]];
  let minU = su, maxU = su, minY = sy, maxY = sy;
  while (stack.length) {
    const [u, y] = stack.pop();
    if (Math.abs(u - su) > MAX_SIDE || Math.abs(y - sy) > MAX_SIDE) return null;
    const k = u + "," + y;
    if (seen.has(k)) continue;
    if (!isOpen(dim, axis, u, y, fixed)) continue;
    seen.add(k);
    if (seen.size > FLOOD_CAP) return null;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([u + 1, y], [u - 1, y], [u, y + 1], [u, y - 1]);
  }
  const w = maxU - minU + 1;
  const h = maxY - minY + 1;
  if (w < 2 || h < 3 || w > MAX_SIDE || h > MAX_SIDE) return null;
  if (seen.size !== w * h) return null;
  return validateFrame(dim, axis, minU, minY, fixed, w, h, clicked);
}

function detectFrame(dim, clicked) {
  for (const axis of ["x", "z"]) {
    const cu = axis === "x" ? clicked.x : clicked.z;
    const fixed = axis === "x" ? clicked.z : clicked.x;
    for (const [du, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const res = floodInterior(dim, axis, fixed, cu + du, clicked.y + dy, clicked);
      if (res) return res;
    }
  }
  return null;
}

function aabbOf(cells) {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (const c of cells) {
    minx = Math.min(minx, c.x); maxx = Math.max(maxx, c.x);
    miny = Math.min(miny, c.y); maxy = Math.max(maxy, c.y);
    minz = Math.min(minz, c.z); maxz = Math.max(maxz, c.z);
  }
  return { minx, miny, minz, maxx, maxy, maxz };
}

function registerPortal(dim, cells, key) {
  const box = aabbOf(cells);
  const exists = portals.some((p) => p.dimId === dim.id && p.key === key &&
    p.minx === box.minx && p.miny === box.miny && p.minz === box.minz);
  if (!exists) {
    portals.push({ dimId: dim.id, key, ...box });
    savePortals();
  }
}

const activating = new Set();

function consumeOne(player) {
  try {
    const creative = world.getPlayers({ gameMode: "creative" }).some((p) => p.id === player.id);
    if (creative) return;
  } catch (e) {}
  try {
    const inv = player.getComponent("minecraft:inventory");
    const c = inv && inv.container;
    if (!c) return;
    const slot = player.selectedSlotIndex !== undefined
      ? player.selectedSlotIndex : player.selectedSlot;
    const it = c.getItem(slot);
    if (!it) return;
    if (it.amount > 1) { it.amount -= 1; c.setItem(slot, it); }
    else c.setItem(slot, undefined);
  } catch (e) {}
}

function spark(dim, c, id) {
  try { dim.spawnParticle(id, { x: c.x + 0.5, y: c.y + 0.5, z: c.z + 0.5 }); } catch (e) {}
}

function activatePortal(player, dim, key, frame) {
  const o = O[key];
  const ring = frame.ring;

  const step = ring.length > 24 ? 1 : 2;
  let i = 0;
  const iv = system.runInterval(() => {
    const c = ring[i++];
    if (c) {
      setB(dim, c.x, c.y, c.z, o.solidId);
      spark(dim, c, "minecraft:electric_spark_particle");
      try {
        dim.playSound("dig.stone", c, { pitch: 0.7 + (i / ring.length) * 0.8, volume: 0.9 });
      } catch (e) {}
    }
    if (i >= ring.length) {
      system.clearRun(iv);
      igniteInterior(player, dim, key, frame);
    }
  }, step);
}

function igniteInterior(player, dim, key, frame) {
  const o = O[key];
  const box = aabbOf(frame.cells);
  const center = { x: (box.minx + box.maxx) / 2 + 0.5,
                   y: (box.miny + box.maxy) / 2 + 0.5,
                   z: (box.minz + box.maxz) / 2 + 0.5 };
  for (const c of frame.cells) setB(dim, c.x, c.y, c.z, o.portal);
  registerPortal(dim, frame.cells, key);
  activating.delete(frameTag(dim, frame));

  try { dim.spawnParticle("minecraft:huge_explosion_emitter", center); } catch (e) {}
  for (const c of frame.cells) spark(dim, c, "minecraft:electric_spark_particle");
  try { dim.playSound("random.explode", center, { volume: 1.2, pitch: 0.8 }); } catch (e) {}
  try { dim.playSound("beacon.activate", center, { volume: 1 }); } catch (e) {}
  try { dim.playSound("portal.trigger", center, { volume: 0.7 }); } catch (e) {}

  try {
    player.sendMessage(dim.id === DIM_OF[key]
      ? "The " + o.name + " portal is open. Step through to go back."
      : "The " + o.name + " portal is open. Step through to reach the " + o.name + " Dimension.");
  } catch (e) {}
}

function frameTag(dim, frame) {
  const b = aabbOf(frame.cells);
  return dim.id + "|" + b.minx + "," + b.miny + "," + b.minz;
}

world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  try {
    const item = ev.itemStack;
    if (!item) return;
    const key = ITEM_KEY[item.typeId];
    if (!key || !ev.block) return;
    const dim = ev.player.dimension;
    const clicked = { x: ev.block.x, y: ev.block.y, z: ev.block.z };
    const frame = detectFrame(dim, clicked);
    if (!frame) return;
    const tag = frameTag(dim, frame);
    if (activating.has(tag)) { ev.cancel = true; return; }
    ev.cancel = true;
    activating.add(tag);
    const player = ev.player;
    system.run(() => {
      resolveBlocks();
      consumeOne(player);
      try { dim.playSound("beacon.power", clicked, { volume: 0.8, pitch: 1.2 }); } catch (e) {}
      activatePortal(player, dim, key, frame);
    });
  } catch (e) {}
});

function ensureHomePortal(key) {
  if (portals.some((p) => p.dimId === DIM_OF[key])) return;
  const dim = world.getDimension(DIM_OF[key]);
  const o = O[key];
  const axis = "x", u0 = 11, fixed = 6, w = 2, h = 3;
  const y0 = Math.max(heightAt(key, u0, fixed), SEA) + 1;
  for (let u = u0 - 1; u <= u0 + w; u++) {
    setB(dim, ...vals(coord(axis, u, y0 - 1, fixed)), o.solidId);
    setB(dim, ...vals(coord(axis, u, y0 + h, fixed)), o.solidId);
  }
  for (let y = y0; y < y0 + h; y++) {
    setB(dim, ...vals(coord(axis, u0 - 1, y, fixed)), o.solidId);
    setB(dim, ...vals(coord(axis, u0 + w, y, fixed)), o.solidId);
  }
  const cells = [];
  for (let u = u0; u < u0 + w; u++)
    for (let y = y0; y < y0 + h; y++) {
      const c = coord(axis, u, y, fixed);
      setB(dim, c.x, c.y, c.z, o.portal);
      cells.push(c);
    }
  registerPortal(dim, cells, key);
}
function vals(c) { return [c.x, c.y, c.z]; }

const pcool = {};
const inPortal = new Set();
function portalUnder(player) {
  const px = Math.floor(player.location.x);
  const py = Math.floor(player.location.y);
  const pz = Math.floor(player.location.z);
  for (const p of portals) {
    if (p.dimId !== player.dimension.id) continue;
    if (px < p.minx || px > p.maxx || pz < p.minz || pz > p.maxz) continue;
    if (py < p.miny - 1 || py > p.maxy) continue;
    return p;
  }
  return null;
}
system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    if ((pcool[player.id] || 0) > now) continue;
    const p = portalUnder(player);
    if (!p) { inPortal.delete(player.id); continue; }
    if (inPortal.has(player.id)) continue;
    inPortal.add(player.id);
    pcool[player.id] = now + 100;
    if (player.dimension.id === DIM_OF[p.key]) system.run(() => returnHome(player));
    else system.run(() => enterDimension(player, p.key));
  }
}, 10);

function saveReturn(player) {
  try {
    const loc = player.location;
    player.setDynamicProperty("oredim:return", JSON.stringify(
      { x: loc.x, y: loc.y, z: loc.z, dim: player.dimension.id }));
  } catch (e) {}
}

async function enterDimension(player, key) {
  resolveBlocks();
  if (!KEY_OF_DIM[player.dimension.id]) saveReturn(player);
  const dim = world.getDimension(DIM_OF[key]);
  const spawn = { x: 8, y: Math.max(heightAt(key, 8, 8), SEA) + 3, z: 8 };
  const taId = "oredim_spawn_" + key;
  try { player.sendMessage("Generating the " + O[key].name + " Dimension around you..."); } catch (e) {}
  try {
    await world.tickingAreaManager.createTickingArea(taId, {
      dimension: dim,
      from: { x: -24, y: FLOOR - 4, z: -24 },
      to: { x: 24, y: 150, z: 24 },
    });
  } catch (e) {}
  if (!GENERATED.has(cellKey(key, 0, 0))) {
    startChunk(dim, key, 0, 0);
    GENERATED.add(cellKey(key, 0, 0));
  }
  await new Promise((r) => system.runTimeout(r, 40));
  ensureHomePortal(key);
  try { player.teleport(spawn, { dimension: dim }); } catch (e) {}

  try { player.addEffect("resistance", 200, { amplifier: 255, showParticles: false }); } catch (e) {}
  try { player.playSound("beacon.power", { volume: 1 }); } catch (e) {}
  try { player.sendMessage("Welcome to the " + O[key].name + " Dimension."); } catch (e) {}
  system.runTimeout(async () => {
    try { await world.tickingAreaManager.removeTickingArea(taId); } catch (e) {}
  }, 200);
}

const DIM_NAMES = {
  "minecraft:overworld": "Overworld",
  "minecraft:nether": "Nether",
  "minecraft:the_end": "End",
};

function returnHome(player) {
  let target = null;
  try {
    const raw = player.getDynamicProperty("oredim:return");
    if (typeof raw === "string") target = JSON.parse(raw);
  } catch (e) {}
  system.run(() => {
    try {
      let destId = OVERWORLD;
      if (target && target.dim && !KEY_OF_DIM[target.dim]) {
        destId = target.dim;
        player.teleport({ x: target.x, y: target.y, z: target.z },
          { dimension: world.getDimension(target.dim) });
      } else {
        let bed = null;
        try { bed = player.getSpawnPoint(); } catch (e) {}
        if (bed && bed.dimension && !KEY_OF_DIM[bed.dimension.id]) {
          destId = bed.dimension.id;
          player.teleport({ x: bed.x + 0.5, y: bed.y, z: bed.z + 0.5 }, { dimension: bed.dimension });
        } else {
          const s = world.getDefaultSpawnLocation();
          const y = s.y > 300 ? 100 : s.y;
          player.teleport({ x: s.x, y, z: s.z }, { dimension: world.getDimension(OVERWORLD) });
        }
      }
      try { player.addEffect("resistance", 60, { amplifier: 255, showParticles: false }); } catch (e) {}
      try { player.playSound("portal.travel", { volume: 0.5 }); } catch (e) {}
      player.sendMessage("Back to the " + (DIM_NAMES[destId] || "Overworld") + ".");
    } catch (e) {}
  });
}

system.runInterval(() => {
  const all = world.getAllPlayers();
  if (!all.length) return;
  for (const key in DIM_OF) {
    const players = all.filter((p) => p.dimension.id === DIM_OF[key]);
    if (!players.length) continue;
    const dim = world.getDimension(DIM_OF[key]);
    let count = 0;
    try { count = dim.getEntities({ families: ["oredim_" + key] }).length; } catch (e) { continue; }
    if (count >= Math.min(80, 40 + (players.length - 1) * 10)) continue;
    const p = players[Math.floor(Math.random() * players.length)];
    const o = O[key];
    const pool = isNight() && Math.random() < 0.6 ? o.hostile : o.passive;
    const ang = Math.random() * Math.PI * 2;
    const d = 20 + Math.random() * 24;
    const x = Math.floor(p.location.x + Math.cos(ang) * d);
    const z = Math.floor(p.location.z + Math.sin(ang) * d);
    const y = Math.max(heightAt(key, x, z), SEA) + 2;
    try { dim.spawnEntity(pool[Math.floor(Math.random() * pool.length)],
      { x: x + 0.5, y, z: z + 0.5 }); } catch (e) {}
  }
}, 100);

world.afterEvents.worldLoad.subscribe(() => {
  resolveBlocks();
  loadPortals();
  loadVillages();
});

world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  const player = ev.player;
  try {
    if (player.getDynamicProperty("oredim:tip_seen")) return;
    player.setDynamicProperty("oredim:tip_seen", true);
    player.sendMessage(
      "[Ores Dimension] Build a nether portal shape out of any blocks you like, " +
      "then right click the frame holding an ore - a diamond, an iron ingot, redstone - " +
      "and the frame turns into that ore and opens a portal to its world.");
  } catch (e) {}
});

function portalPlaneIsX(p) { return p.minz === p.maxz; }

function isPortalFrameCell(p, x, y, z) {
  const planeX = portalPlaneIsX(p);
  if ((planeX ? z : x) !== (planeX ? p.minz : p.minx)) return false;
  const u = planeX ? x : z;
  const uMin = (planeX ? p.minx : p.minz) - 1;
  const uMax = (planeX ? p.maxx : p.maxz) + 1;
  const yMin = p.miny - 1;
  const yMax = p.maxy + 1;
  if (u < uMin || u > uMax || y < yMin || y > yMax) return false;
  const onSide = u === uMin || u === uMax;
  const onCap = y === yMin || y === yMax;
  if (!onSide && !onCap) return false;
  if (onSide && onCap) return false;
  return true;
}

function closePortal(rec) {
  const i = portals.indexOf(rec);
  if (i !== -1) { portals.splice(i, 1); savePortals(); }
  let dim = null;
  try { dim = world.getDimension(rec.dimId); } catch (e) {}
  if (!dim) return;
  let cleared = 0;
  for (let x = rec.minx; x <= rec.maxx; x++)
    for (let y = rec.miny; y <= rec.maxy; y++)
      for (let z = rec.minz; z <= rec.maxz; z++) {
        const b = blockAt(dim, { x, y, z });
        if (!b || !PORTAL_IDS.has(b.typeId)) continue;
        setB(dim, x, y, z, "minecraft:air");
        spark(dim, { x, y, z }, "minecraft:basic_smoke_particle");
        cleared++;
      }
  if (!cleared) return;
  const center = { x: (rec.minx + rec.maxx) / 2 + 0.5,
                   y: (rec.miny + rec.maxy) / 2 + 0.5,
                   z: (rec.minz + rec.maxz) / 2 + 0.5 };
  try { dim.playSound("random.fizz", center, { volume: 1, pitch: 0.7 }); } catch (e) {}
  try { dim.playSound("beacon.deactivate", center, { volume: 0.8 }); } catch (e) {}
}

try {
  world.afterEvents.playerBreakBlock.subscribe((ev) => {
    try {
      const b = ev.block;
      if (!b) return;
      const dimId = ev.dimension ? ev.dimension.id
                  : (ev.player ? ev.player.dimension.id : null);
      if (!dimId) return;
      const hit = portals.filter((p) =>
        p.dimId === dimId && isPortalFrameCell(p, b.x, b.y, b.z));
      if (!hit.length) return;
      system.run(() => {
        for (const rec of hit) closePortal(rec);
        try {
          if (ev.player) ev.player.sendMessage("The portal collapses.");
        } catch (e) {}
      });
    } catch (e) {}
  });
} catch (e) {}

try {
  world.afterEvents.blockExplode.subscribe((ev) => {
    try {
      const b = ev.block;
      if (!b || !ev.dimension) return;
      const dimId = ev.dimension.id;
      const hit = portals.filter((p) =>
        p.dimId === dimId && isPortalFrameCell(p, b.x, b.y, b.z));
      if (!hit.length) return;
      system.run(() => {
        for (const rec of hit) closePortal(rec);
      });
    } catch (e) {}
  });
} catch (e) {}
