/**
 * Infinity Clock.  Right click: set the time of day, stop/resume time (emulated world freeze), change the
 * day/night speed, and manage speed zones for the Avaritia machines (see timeZones.js).
 * Also: /scriptevent avaritia:clock   (open the menu without the item).
 * Anyone holding the item can use it. Set REQUIRE_ADMIN to true to restrict it to admins (see common.js).
 */
import * as MC from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { isAdmin, say, showForm } from "./common.js";
import { SPEEDS, getZones, addZone, updateZone, removeZone, setTimeStop } from "./timeZones.js";

const { world, system } = MC;

const ITEM_ID = "avaritia:infinity_clock";
const REQUIRE_ADMIN = false; // regular Avaritia item: anyone holding it can use it
const SPEED_KEY = "avaritia:daySpeed";
const DAY = 24000;
const DAY_SPEEDS = [1, 2, 4, 10, 20, 50];
const PRESETS = [
  ["Bình minh", 23000], ["Sáng", 1000], ["Trưa", 6000], ["Chiều", 9000],
  ["Hoàng hôn", 12000], ["Đêm", 13000], ["Nửa đêm", 18000],
];

const busy = new Set();

const daySpeed = () => { const v = world.getDynamicProperty(SPEED_KEY); return DAY_SPEEDS.includes(v) ? v : 1; };

// game rules: the scripting property names use a capital L in "DayLight"; fall back to /gamerule if a write is ignored
const RULE_CMD = {
  doDayLightCycle: "dodaylightcycle", doWeatherCycle: "doweathercycle", doMobSpawning: "domobspawning",
  doFireTick: "dofiretick", randomTickSpeed: "randomtickspeed",
};
const getRule = (k) => { try { return world.gameRules[k]; } catch { return undefined; } };
function setRule(k, v) {
  try { world.gameRules[k] = v; if (world.gameRules[k] === v) return; } catch { /* fall through */ }
  try { world.getDimension("overworld").runCommand(`gamerule ${RULE_CMD[k]} ${v}`); } catch { /* ignore */ }
}
const isFrozen = () => getRule("doDayLightCycle") === false;
const dimName = (id) => String(id).replace("minecraft:", "");
const pad = (n) => String(Math.floor(n)).padStart(2, "0");
// tick 0 = 06:00 in game time
function clockText(tick) {
  const h = (tick / 1000 + 6) % 24;
  return `${pad(h)}:${pad((h % 1) * 60)}`;
}

function setTime(player, tick) {
  const t = ((Math.round(tick) % DAY) + DAY) % DAY;
  try { world.setTimeOfDay(t); } catch { player.runCommand(`time set ${t}`); }
  say(player, `§b[Clock] §7Đã đặt thời gian: §f${clockText(t)} §8(${t})`);
}

// ---------- main menu ----------
async function mainMenu(player) {
  const tick = world.getTimeOfDay();
  const frozen = isFrozen();
  const form = new ActionFormData()
    .title("§l§cInfinity Clock")
    .body(
      `Giờ hiện tại: §f${clockText(tick)} §8(${tick})§r\n` +
      `Dòng thời gian: ${stop ? "§c§lTHẾ GIỚI ĐANG DỪNG" : frozen ? "§cNgày đêm đang dừng" : "§aĐang chạy"}§r\n` +
      `Tốc độ ngày đêm: §fx${daySpeed()}§r\n` +
      `Vùng tăng tốc máy: §f${getZones().length}`
    )
    .button("§l☀ Đặt thời gian")
    .button(stop ? "§a▶ Tiếp tục thời gian §8(đang dừng thế giới)" : "§c⏸ Dừng thời gian")
    .button("§l⏩ Tốc độ ngày đêm")
    .button("§l⚙ Vùng tăng tốc máy");
  const res = await showForm(form, player);
  if (!res || res.canceled) return;
  if (res.selection === 0) return timeMenu(player);
  if (res.selection === 1) {
    if (stop) { endStop("manual"); return mainMenu(player); }
    return stopMenu(player);
  }
  if (res.selection === 2) return speedMenu(player);
  return zonesMenu(player);
}

async function timeMenu(player) {
  const form = new ActionFormData().title("Đặt thời gian").body("Chọn nhanh hoặc tự chỉnh giờ");
  for (const [name, t] of PRESETS) form.button(`${name}\n§8${clockText(t)}`);
  form.button("§l✎ Tuỳ chỉnh giờ phút");
  const res = await showForm(form, player);
  if (!res || res.canceled) return mainMenu(player);
  if (res.selection < PRESETS.length) { setTime(player, PRESETS[res.selection][1]); return mainMenu(player); }
  const now = (world.getTimeOfDay() / 1000 + 6) % 24;
  const m = new ModalFormData()
    .title("Tuỳ chỉnh giờ")
    .slider("Giờ", 0, 23, { valueStep: 1, defaultValue: Math.floor(now) })
    .slider("Phút", 0, 55, { valueStep: 5, defaultValue: Math.floor(((now % 1) * 60) / 5) * 5 });
  const r = await showForm(m, player);
  if (!r || r.canceled || !r.formValues) return timeMenu(player);
  const [h, min] = r.formValues;
  setTime(player, (((h - 6 + 24) % 24) + min / 60) * 1000);
  return mainMenu(player);
}

async function speedMenu(player) {
  const cur = DAY_SPEEDS.indexOf(daySpeed());
  const m = new ModalFormData()
    .title("Tốc độ ngày đêm")
    .dropdown("Tốc độ trôi của thời gian", DAY_SPEEDS.map((s) => (s === 1 ? "x1 (bình thường)" : `x${s}`)), { defaultValueIndex: Math.max(0, cur) });
  const r = await showForm(m, player);
  if (!r || r.canceled || !r.formValues) return mainMenu(player);
  const s = DAY_SPEEDS[r.formValues[0]];
  world.setDynamicProperty(SPEED_KEY, s);
  say(player, `§b[Clock] §7Tốc độ ngày đêm: §fx${s}` + (isFrozen() ? " §8(thời gian đang dừng)" : ""));
  return mainMenu(player);
}

// ---------- speed zones ----------
const speedLabel = (m) => (m === 0 ? "x0 (dừng máy)" : `x${m}`);

async function zonesMenu(player) {
  const zones = getZones();
  const form = new ActionFormData()
    .title("Vùng tăng tốc máy")
    .body(
      "Mỗi vùng là một khối lập phương quanh tâm. Máy Avaritia trong vùng (Neutron Collector, " +
      "Neutronium Compressor, Record Furnace) sẽ chạy nhanh theo hệ số, x0 là dừng máy."
    )
    .button("§l+ Tạo vùng tại chỗ tôi đứng");
  for (const z of zones) form.button(`${z.name}\n§8${speedLabel(z.mult)} | r=${z.r} | ${dimName(z.dim)} ${z.x},${z.y},${z.z}`);
  const res = await showForm(form, player);
  if (!res || res.canceled) return mainMenu(player);
  if (res.selection === 0) return createZone(player);
  return editZone(player, zones[res.selection - 1]);
}

async function createZone(player) {
  const m = new ModalFormData()
    .title("Tạo vùng mới")
    .textField("Tên vùng", "Nhà máy", { defaultValue: `Vùng ${getZones().length + 1}` })
    .slider("Bán kính (block)", 4, 128, { valueStep: 4, defaultValue: 32 })
    .dropdown("Tốc độ máy", SPEEDS.map(speedLabel), { defaultValueIndex: 3 });
  const r = await showForm(m, player);
  if (!r || r.canceled || !r.formValues) return zonesMenu(player);
  const [name, radius, si] = r.formValues;
  const l = player.location;
  const zone = addZone({
    name: String(name || "Vùng").slice(0, 24), dim: player.dimension.id,
    x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z), r: radius, mult: SPEEDS[si],
  });
  say(player, `§b[Clock] §7Đã tạo vùng §f${zone.name} §7(${speedLabel(zone.mult)}, bán kính ${zone.r})`);
  outline(player, zone);
}

async function editZone(player, zone) {
  if (!zone) return zonesMenu(player);
  const m = new ModalFormData()
    .title(`Sửa: ${zone.name}`)
    .slider("Bán kính (block)", 4, 128, { valueStep: 4, defaultValue: Math.min(128, Math.max(4, zone.r)) })
    .dropdown("Tốc độ máy", SPEEDS.map(speedLabel), { defaultValueIndex: Math.max(0, SPEEDS.indexOf(zone.mult)) })
    .toggle("Dời tâm về chỗ tôi đứng", { defaultValue: false })
    .toggle("Hiện viền vùng", { defaultValue: true })
    .toggle("§cXoá vùng này", { defaultValue: false });
  const r = await showForm(m, player);
  if (!r || r.canceled || !r.formValues) return zonesMenu(player);
  const [radius, si, move, show, del] = r.formValues;
  if (del) { removeZone(zone.id); say(player, `§b[Clock] §7Đã xoá vùng §f${zone.name}`); return zonesMenu(player); }
  const patch = { r: radius, mult: SPEEDS[si] };
  if (move) {
    const l = player.location;
    Object.assign(patch, { dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) });
  }
  const z = updateZone(zone.id, patch);
  say(player, `§b[Clock] §7Đã cập nhật vùng §f${z.name} §7(${speedLabel(z.mult)}, bán kính ${z.r})`);
  if (show) outline(player, z);
}

// draw the 12 edges of the zone cube with particles for a few seconds
function outline(player, z) {
  const min = { x: z.x - z.r, y: z.y - z.r, z: z.z - z.r };
  const max = { x: z.x + z.r + 1, y: z.y + z.r + 1, z: z.z + z.r + 1 };
  const len = max.x - min.x;
  const step = Math.max(2, Math.ceil(len / 40));
  const pts = [];
  for (const y of [min.y, max.y]) for (const o of [min.z, max.z]) for (let x = min.x; x <= max.x; x += step) pts.push({ x, y, z: o });
  for (const y of [min.y, max.y]) for (const o of [min.x, max.x]) for (let q = min.z; q <= max.z; q += step) pts.push({ x: o, y, z: q });
  for (const x of [min.x, max.x]) for (const q of [min.z, max.z]) for (let y = min.y; y <= max.y; y += step) pts.push({ x, y, z: q });
  let n = 0;
  const h = system.runInterval(() => {
    n++;
    try {
      if (!player.isValid || player.dimension.id !== z.dim) { system.clearRun(h); return; }
      const dim = player.dimension;
      for (const p of pts) { try { dim.spawnParticle("minecraft:endrod", p); } catch { /* unloaded */ } }
    } catch { system.clearRun(h); return; }
    if (n >= 8) system.clearRun(h);
  }, 10);
}

// ---------- time stop (emulated: Bedrock has no /tick freeze) ----------
const STOP_PROP = "avaritia:stopRestore";
const STOP_RULES = ["doDayLightCycle", "doWeatherCycle", "doMobSpawning", "doFireTick", "randomTickSpeed"];
const STOP_DURATIONS = [["5 giây", 100], ["10 giây", 200], ["30 giây", 600], ["1 phút", 1200], ["5 phút", 6000], ["Đến khi tôi tắt", 0]];
const STOP_RADII = [["16 block", 16], ["32 block", 32], ["64 block", 64], ["128 block", 128], ["Toàn bộ chunk đang tải", 0]];

let stop = null;               // {casterId, dim, x, y, z, r, until, freezePlayers}
const frozen = new Map();      // entityId -> {loc, rot}

async function stopMenu(player) {
  const form = new ActionFormData()
    .title("Dừng thời gian")
    .body(
      "§lDừng thế giới:§r đóng băng mob, vật phẩm rơi, đạn, đồ vật đang bay/rơi, máy Avaritia; dừng ngày đêm, mưa, sinh mob, lửa lan và cây lớn. Bạn không bị đóng băng.\n\n" +
      "§7Không dừng được: redstone, piston, nước/dung nham chảy, lò nung và phễu của game."
    )
    .button("§l⏸ Dừng thế giới")
    .button(isFrozen() ? "§a▶ Chạy lại ngày đêm" : "§e⏸ Chỉ dừng ngày đêm");
  const res = await showForm(form, player);
  if (!res || res.canceled) return mainMenu(player);
  if (res.selection === 1) {
    const f = isFrozen();
    setRule("doDayLightCycle", f);
    say(player, f ? "§b[Clock] §aNgày đêm chạy lại" : "§b[Clock] §cNgày đêm đã dừng");
    return mainMenu(player);
  }
  const m = new ModalFormData()
    .title("Dừng thế giới")
    .dropdown("Thời gian dừng", STOP_DURATIONS.map((d) => d[0]), { defaultValueIndex: 1 })
    .dropdown("Phạm vi quanh bạn", STOP_RADII.map((d) => d[0]), { defaultValueIndex: 1 })
    .dropdown("Cách giữ mob", ["Chung: ghim vị trí", "Ghế vô hình (thử nghiệm)"], { defaultValueIndex: 0 })
    .toggle("Đóng băng cả người chơi khác", { defaultValue: true });
  const r = await showForm(m, player);
  if (!r || r.canceled || !r.formValues) return stopMenu(player);
  startStop(player, STOP_DURATIONS[r.formValues[0]][1], STOP_RADII[r.formValues[1]][1], !!r.formValues[3], r.formValues[2] === 1 ? "seat" : "pin");
}

function startStop(player, ticks, radius, freezePlayers, mode) {
  if (stop) endStop("restart");
  const prev = {};
  for (const k of STOP_RULES) prev[k] = getRule(k);
  try { world.setDynamicProperty(STOP_PROP, JSON.stringify(prev)); } catch { /* ignore */ }
  for (const k of STOP_RULES) setRule(k, k === "randomTickSpeed" ? 0 : false);
  const l = player.location;
  stop = {
    casterId: player.id, dim: player.dimension.id, x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z),
    r: radius, until: ticks > 0 ? system.currentTick + ticks : 0, freezePlayers, mode, prev,
  };
  setTimeStop({ dim: stop.dim, x: stop.x, y: stop.y, z: stop.z, r: stop.r });
  say(player, "§b[Clock] §c§lTHẾ GIỚI ĐÃ DỪNG §r§7- mở đồng hồ để tiếp tục thời gian");
  say(player, "§7[TS] build aiwatch-v4: debug AI bật, tin [TS] sẽ hiện cho người cầm đồng hồ");
  try { player.playSound("beacon.deactivate", { volume: 1, pitch: 0.6 }); } catch { /* ignore */ }
}

// lock / unlock every kind of input of a player; returns true if the game accepted at least the camera + movement locks
const INPUT_CATEGORIES = ["Camera", "Movement", "Jump", "Sneak", "Mount", "Dismount"];
function setInput(e, allowed) {
  const got = {};
  for (const name of INPUT_CATEGORIES) {
    try {
      const cat = MC.InputPermissionCategory?.[name];
      if (cat === undefined) continue;
      e.inputPermissions.setPermissionCategory(cat, allowed);
      got[name] = true;
    } catch { /* not supported in this game version */ }
  }
  return !!(got.Camera && got.Movement);
}
const releasePlayer = (e) => setInput(e, true);

function endStop(reason) {
  if (!stop) return;
  const s = stop;
  stop = null;
  for (const k of STOP_RULES) if (s.prev[k] !== undefined) setRule(k, s.prev[k]);
  for (const [id, st] of frozen) {
    unseat(st);
    const e = world.getEntity(id);
    if (!e || !e.isValid) continue;
    if (e.typeId === "minecraft:player") releasePlayer(e);
    else speedUp(e);
  }
  frozen.clear();
  aggroBypass.clear();
  dbgSeen.clear();
  setTimeStop(null);
  try { world.setDynamicProperty(STOP_PROP, undefined); } catch { /* ignore */ }
  const caster = world.getEntity(s.casterId);
  if (caster?.isValid) {
    if (reason !== "restart") {
      say(caster, reason === "timeout" ? "§b[Clock] §aThời gian chạy lại (hết giờ)" : "§b[Clock] §aThời gian chạy lại");
      try { caster.playSound("beacon.activate", { volume: 1, pitch: 1.2 }); } catch { /* ignore */ }
    }
  }
}

// Mobs (vanilla and from other add-ons): zero every speed attribute they have so their AI can no longer walk, fly or swim
// (this also stops the walking animation). The original values are kept on the entity itself, so a mob can never stay
// stuck even if the world is closed during a stop.
const SPEED_COMPONENTS = ["minecraft:movement", "minecraft:underwater_movement", "minecraft:lava_movement", "minecraft:flying_speed"];
const SPEED_MARK = "avaritia:frozenSpeed";
const FREEZE_ANIM = "animation.avaritia.time_stop.freeze"; // RP animation: overrides the mob's own animations (re-sent every 20 ticks)

function slowDown(e) {
  try {
    if (e.getDynamicProperty(SPEED_MARK) !== undefined) return;
    const saved = {};
    for (const id of SPEED_COMPONENTS) {
      try {
        const c = e.getComponent(id);
        if (!c) continue;
        saved[id] = c.currentValue;
        c.setCurrentValue(0);
      } catch { /* component not present / read only */ }
    }
    if (Object.keys(saved).length) e.setDynamicProperty(SPEED_MARK, JSON.stringify(saved));
  } catch { /* ignore */ }
}

function speedUp(e) {
  try {
    const raw = e.getDynamicProperty(SPEED_MARK);
    if (typeof raw !== "string") return;
    const saved = JSON.parse(raw);
    for (const id of Object.keys(saved)) { try { e.getComponent(id)?.setCurrentValue(saved[id]); } catch { /* ignore */ } }
    e.setDynamicProperty(SPEED_MARK, undefined);
  } catch { /* ignore */ }
}

// Experimental "seat" mode: every living mob is made to ride an invisible, motionless entity. A rider cannot
// pathfind or walk, and this works for any mob of any add-on without declaring anything.
const SEAT_ID = "avaritia:time_stop_seat";
let seatCount = 0;

function seatEntity(e, st) {
  if (st.seat || st.seatFailed || !stop || stop.mode !== "seat") return;
  try {
    if (!e.getComponent("minecraft:health") || e.getComponent("minecraft:riding")?.entityRidingOn) { st.seatFailed = true; return; }
    const r = e.getComponent("minecraft:rideable");
    if (r && r.getRiders().length) { st.seatFailed = true; return; }
    const seat = e.dimension.spawnEntity(SEAT_ID, e.location);
    if (seat.getComponent("minecraft:rideable")?.addRider(e)) { st.seat = seat; seatCount++; }
    else { seat.remove(); st.seatFailed = true; }
  } catch { st.seatFailed = true; }
}

function unseat(st) {
  if (!st?.seat) return;
  try { st.seat.getComponent("minecraft:rideable")?.ejectRiders(); } catch { /* ignore */ }
  try { if (st.seat.isValid) st.seat.remove(); } catch { /* ignore */ }
  st.seat = undefined;
  seatCount = Math.max(0, seatCount - 1);
}

// players: input permissions only (no potion effects)
function lockEntity(e, st) {
  if (e.typeId === "minecraft:player") { st.inputLocked = setInput(e, false); return; }
  slowDown(e);
  seatEntity(e, st);
  try { e.playAnimation(FREEZE_ANIM, { blendOutTime: 0.1 }); } catch { /* entity without a client model */ }
}

// ---------- AI kill: self-target ----------
// Every frozen mob is kept "targeting itself": it then has nothing to chase or shoot and its AI idles.
// If a mob is found targeting some other entity X, X "hits" it for 0 damage (so it forgets X), then it hits itself for
// 0 damage (so it targets itself). Only holds while attackNearest finds no other target; aiWatch re-applies it.
const aggroBypass = new Set(); // mobs whose 0-damage hits must not be cancelled by hurtBlocked
let hitTagN = 0;
// 0-damage "hit" via /damage so hurt_by_target fires even though applyDamage(0) returns false.
// by === victim (or no attacker): mob hits itself. Otherwise `by` is tagged for a moment so the command can select it.
const hit0 = (victim, by) => {
  try {
    if (!by || by.id === victim.id) {
      victim.runCommand("damage @s 0 entity_attack entity @s");
      return;
    }
    const tag = "ts_aggro_" + (hitTagN++ % 1000);
    by.addTag(tag);
    try { victim.runCommand(`damage @s 0 entity_attack entity @e[tag=${tag},c=1]`); }
    finally { try { by.removeTag(tag); } catch { /* gone */ } }
  } catch { /* not damageable / command failed */ }
};
// Debug: give yourself the tag "ts_debug" (/tag @s add ts_debug) to get a chat line per mob type showing what e.target
// reads 6 ticks after the self-hit. That tells whether the self-hit really makes the mob target itself.
const dbgSeen = new Set();
function dbgReport(e, label) {
  try {
    const key = e.typeId + label;
    if (dbgSeen.has(key)) return;
    const viewers = world.getAllPlayers().filter((p) => p.id === stop?.casterId || p.hasTag("ts_debug"));
    if (!viewers.length) return;
    dbgSeen.add(key);
    let t, readable = true;
    try { t = e.target; } catch { readable = false; }
    const msg = `§7[TS] ${e.typeId} ${label}: ` + (!readable ? "target UNREADABLE" : t ? `target=${t.typeId}${t.id === e.id ? " (SELF)" : ""}` : "target=none");
    for (const p of viewers) p.sendMessage(msg);
  } catch { /* ignore */ }
}

const AI_HITS_ENABLED = false; // temporarily OFF: no /damage hits at all (only reports what each mob targets by itself)
const MAX_AI_HITS = 3; // each /damage hit makes the mob flash red, so never spam it
function aiWatch(e, st) {
  if (system.currentTick < (st.aiWait ?? 0)) return;
  if ((st.aiHits ?? 0) >= MAX_AI_HITS) return;
  let t;
  try { t = e.target; } catch { t = undefined; }
  if (!AI_HITS_ENABLED) { dbgReport(e, "natural"); return; }
  if (t && t.id === e.id) { dbgReport(e, "already-self"); return; } // already targeting itself: leave it
  st.aiWait = system.currentTick + 20;
  st.aiHits = (st.aiHits ?? 0) + 1;
  aggroBypass.add(e.id);
  system.runTimeout(() => aggroBypass.delete(e.id), 10);
  dbgReport(e, "before");
  if (t && t.isValid) {
    hit0(e, t); // X damages the mob -> it drops X
    system.runTimeout(() => { if (e.isValid && stop) hit0(e, e); }, 2); // then it targets itself
  } else {
    hit0(e, e);
  }
  system.runTimeout(() => { if (e.isValid && stop) dbgReport(e, "after"); }, 8);
}

system.runInterval(() => {
  if (!stop) return;
  const caster = world.getEntity(stop.casterId);
  if (!caster || !caster.isValid || caster.dimension.id !== stop.dim) { endStop("caster"); return; }
  if (stop.until && system.currentTick >= stop.until) { endStop("timeout"); return; }
  const dim = world.getDimension(stop.dim);
  const centre = { x: stop.x + 0.5, y: stop.y, z: stop.z + 0.5 };
  let list;
  try { list = stop.r > 0 ? dim.getEntities({ location: centre, maxDistance: stop.r * 1.75 }) : dim.getEntities(); } catch { return; }
  const refresh = system.currentTick % 20 === 0;
  const seen = new Set();
  for (const e of list) {
    if (!e.isValid || e.id === stop.casterId || e.typeId === "avaritia:admin_inventory_projector" || e.typeId === SEAT_ID) continue;
    const isPlayer = e.typeId === "minecraft:player";
    if (isPlayer && !stop.freezePlayers) continue;
    seen.add(e.id);
    let st = frozen.get(e.id);
    if (!st) {
      st = { loc: e.location, rot: e.getRotation(), inputLocked: false };
      frozen.set(e.id, st);
      lockEntity(e, st);
    } else if (refresh) lockEntity(e, st);
    if (st.seat && !st.seat.isValid) { st.seat = undefined; seatCount = Math.max(0, seatCount - 1); st.seatFailed = true; }
    if (!isPlayer && system.currentTick % 3 === 0) aiWatch(e, st);
    if (st.seat) continue; // seated mobs cannot walk: no pinning needed
    const l = e.location;
    const dx = l.x - st.loc.x, dy = l.y - st.loc.y, dz = l.z - st.loc.z;
    const pinRot = !isPlayer || !st.inputLocked; // players keep their view locked via input permissions, or by pinning when those are missing
    let rotMoved = false;
    if (pinRot && isPlayer) {
      try { const r = e.getRotation(); rotMoved = Math.abs(r.x - st.rot.x) > 0.5 || Math.abs(r.y - st.rot.y) > 0.5; } catch { /* ignore */ }
    }
    if (dx * dx + dy * dy + dz * dz > 0.0025 || rotMoved) {
      try { e.teleport(st.loc, pinRot ? { keepVelocity: false, rotation: st.rot } : { keepVelocity: false }); } catch { /* ignore */ }
    }
    if (!isPlayer) { try { e.clearVelocity(); } catch { /* ignore */ } }
  }
  if (system.currentTick % 100 === 0) {
    for (const id of [...frozen.keys()]) {
      if (seen.has(id)) continue;
      unseat(frozen.get(id));
      const gone = world.getEntity(id);
      if (gone?.isValid) { if (gone.typeId === "minecraft:player") releasePlayer(gone); else speedUp(gone); }
      frozen.delete(id);
    }
  }
  if (system.currentTick % 10 === 0) {
    const left = stop.until ? `còn ${Math.ceil((stop.until - system.currentTick) / 20)}s` : "mở đồng hồ để tiếp tục";
    try { caster.onScreenDisplay.setActionBar(`§c§l⏸ THẾ GIỚI ĐANG DỪNG §r§7(${left})`); } catch { /* ignore */ }
  }
}, 1);

world.afterEvents.playerLeave.subscribe((ev) => { if (stop && ev.playerId === stop.casterId) endStop("caster"); });

// While time is stopped, cancel what frozen players try to do and what the world would do (everyone except the caster)
const frozenPlayer = (p) => !!stop && !!p && p.id !== stop.casterId && stop.freezePlayers && p.dimension?.id === stop.dim;
for (const name of ["playerBreakBlock", "playerPlaceBlock", "playerInteractWithBlock", "playerInteractWithEntity"]) {
  try { world.beforeEvents[name]?.subscribe((ev) => { if (frozenPlayer(ev.player)) ev.cancel = true; }); } catch { /* event not available */ }
}
try { world.beforeEvents.itemUse?.subscribe((ev) => { if (frozenPlayer(ev.source)) ev.cancel = true; }); } catch { /* ignore */ }
try { world.beforeEvents.explosion?.subscribe((ev) => { if (stop && ev.dimension?.id === stop.dim) ev.cancel = true; }); } catch { /* ignore */ }
// damage while time is stopped: frozen mobs cannot hurt anyone (the caster included), and frozen entities take no
// damage except from the caster. Uses the "before" event when this game version has it, otherwise heals the damage back.
const hasBeforeHurt = !!world.beforeEvents.entityHurt;
const hurtBlocked = (victimId, attackerId) =>
  !!stop && !aggroBypass.has(victimId) &&
  ((!!attackerId && frozen.has(attackerId)) || (frozen.has(victimId) && attackerId !== stop.casterId));
try {
  world.beforeEvents.entityHurt?.subscribe((ev) => {
    if (hurtBlocked(ev.hurtEntity?.id, ev.damageSource?.damagingEntity?.id)) ev.cancel = true;
  });
} catch { /* ignore */ }
try {
  if (!hasBeforeHurt) {
    world.afterEvents.entityHurt.subscribe((ev) => {
      if (!hurtBlocked(ev.hurtEntity?.id, ev.damageSource?.damagingEntity?.id)) return;
      try {
        const h = ev.hurtEntity.getComponent("minecraft:health");
        if (h) h.setCurrentValue(Math.min(h.effectiveMax, h.currentValue + ev.damage));
      } catch { /* ignore */ }
    });
  }
} catch { /* ignore */ }

// safety net: a marked mob that loads while nothing is stopped gets its speed back
try {
  world.afterEvents.entityLoad?.subscribe((ev) => {
    if (stop) return;
    if (ev.entity.typeId === SEAT_ID) {
      try { ev.entity.getComponent("minecraft:rideable")?.ejectRiders(); ev.entity.remove(); } catch { /* ignore */ }
    } else speedUp(ev.entity);
  });
} catch { /* ignore */ }

// if the world was closed during a stop, put the game rules back
system.run(() => {
  try {
    for (const id of ["overworld", "nether", "the_end"]) {
      try {
        const dim = world.getDimension(id);
        for (const e of dim.getEntities({ type: SEAT_ID })) { try { e.getComponent("minecraft:rideable")?.ejectRiders(); e.remove(); } catch { /* ignore */ } }
        for (const e of dim.getEntities()) speedUp(e);
      } catch { /* ignore */ }
    }
    const raw = world.getDynamicProperty(STOP_PROP);
    if (typeof raw !== "string") return;
    const prev = JSON.parse(raw);
    for (const k of STOP_RULES) if (prev[k] !== undefined) setRule(k, prev[k]);
    world.setDynamicProperty(STOP_PROP, undefined);
  } catch { /* ignore */ }
});

// ---------- entry points ----------
async function open(player) {
  if (REQUIRE_ADMIN && !isAdmin(player)) { say(player, "§c[Clock] Chỉ admin mới dùng được Infinity Clock (cần quyền admin hoặc tag 'admin')"); return; }
  if (busy.has(player.id)) return;
  busy.add(player.id);
  try { await mainMenu(player); } catch (e) { console.warn("[Clock] menu failed: " + e); } finally { busy.delete(player.id); }
}

world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId === ITEM_ID && ev.source?.typeId === "minecraft:player") open(ev.source);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "avaritia:clock" && ev.sourceEntity?.typeId === "minecraft:player") open(ev.sourceEntity);
});

// faster day/night: add the extra ticks each game tick while the day cycle is running
system.runInterval(() => {
  const s = daySpeed();
  if (s <= 1 || isFrozen()) return;
  try { world.setTimeOfDay((world.getTimeOfDay() + s - 1) % DAY); } catch { /* ignore */ }
}, 1);
