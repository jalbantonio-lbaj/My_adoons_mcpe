/**
 * Admin Inventory Viewer (hidden item). Based on the InvSee add-on by r4isen1920 (MIT License),
 * rewritten without external libraries. The player-layout screen (armor icons, hotbar row) comes from
 * ui/admin/invsee_inventory.json plus the chest_screen.json additions.
 *
 * Use:  /give @s avaritia:admin_inventory_viewer   (or /scriptevent avaritia:invsee_give; item is in the creative Items tab)
 *       right click with the item (or /scriptevent avaritia:invsee) -> pick a player -> you sit on an
 *       invisible entity -> press the Inventory button to open that player's inventory. Edits are
 *       synced both ways. Sneak to leave.
 * Only operators (or players with the tag "admin") can use it.
 */
import { world, system, EquipmentSlot, ItemStack, ItemComponentTypes } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const ITEM_ID = "avaritia:admin_inventory_viewer";
const ENTITY_ID = "avaritia:admin_inventory_projector";
const TITLE_PREFIX = "_r4ui:inventory:"; // chest_screen.json decodes "<prefix><5 armor flags>:<name>" from the title
const TAG = "avaritia_invsee";
const ANIM = "animation.avaritia_invsee.player.riding.cancel";

const PLAYER_SLOTS = 36;
const HOTBAR = 9;
const MIRROR_SIZE = 41; // 36 inventory slots + head, chest, legs, feet, offhand
const MAIN = PLAYER_SLOTS - HOTBAR;
const EQUIP_BASE = 45;
const EQUIP_ORDER = [EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet, EquipmentSlot.Offhand];

// projector layout (rendered by ui/admin/invsee_inventory.json): rows 1-3 main inventory, row 4 hotbar, equipment at 45-49
const toProjector = (i) => (i < HOTBAR ? MAIN + i : i < PLAYER_SLOTS ? i - HOTBAR : EQUIP_BASE + (i - PLAYER_SLOTS));
const UNMAPPED = [];
for (let s = 36; s < 54; s++) if (!(s >= EQUIP_BASE && s < EQUIP_BASE + 5)) UNMAPPED.push(s);

const sessions = new Map(); // viewerId -> session
const busy = new Set();

const isAdmin = (p) => {
  try { if (p.isOp()) return true; } catch { /* ignore */ }
  try { if (Number(p.commandPermissionLevel) >= 2) return true; } catch { /* ignore */ } // admin / host / owner
  try { return p.hasTag("admin"); } catch { return false; }
};
const say = (p, m) => { try { p.sendMessage(m); } catch { /* ignore */ } };

function fingerprint(item) {
  if (!item) return "";
  let dmg = 0, ench = "";
  try { dmg = item.getComponent(ItemComponentTypes.Durability)?.damage ?? 0; } catch { /* ignore */ }
  try {
    const e = item.getComponent(ItemComponentTypes.Enchantable);
    if (e) ench = e.getEnchantments().map((x) => x.type.id + x.level).sort().join("+");
  } catch { /* ignore */ }
  let lore = "";
  try { lore = item.getLore().join("\n"); } catch { /* ignore */ }
  return [item.typeId, item.amount, dmg, item.nameTag ?? "", lore, ench].join("|");
}

function cursorHolding(player) {
  try { return !!player.getComponent("minecraft:cursor_inventory")?.item; } catch { return false; }
}

function invOf(entity) {
  try { return entity.getComponent("minecraft:inventory")?.container; } catch { return undefined; }
}

function readTarget(target, i) {
  if (i < PLAYER_SLOTS) return invOf(target)?.getItem(i);
  try { return target.getComponent("minecraft:equippable")?.getEquipment(EQUIP_ORDER[i - PLAYER_SLOTS]); } catch { return undefined; }
}

function writeTarget(target, i, item) {
  try {
    if (i < PLAYER_SLOTS) {
      const c = invOf(target);
      if (!c) return false;
      c.setItem(i, item);
      return true;
    }
    return target.getComponent("minecraft:equippable")?.setEquipment(EQUIP_ORDER[i - PLAYER_SLOTS], item) ?? false;
  } catch { return false; }
}

// slots the UI never renders: anything quick-moved there would vanish, so hand it back
function reclaimUnmapped(s) {
  const c = invOf(s.entity), vc = invOf(s.viewer);
  if (!c || !vc) return;
  for (const slot of UNMAPPED) {
    const stray = c.getItem(slot);
    if (!stray) continue;
    const left = vc.addItem(stray);
    if (left) dropAtViewer(s.viewer, left);
    c.setItem(slot, undefined);
  }
}

// the title carries one flag per equipment slot (a = occupied, b = empty) for the custom UI
function refreshNameTag(s, target) {
  let flags = "";
  for (let i = PLAYER_SLOTS; i < MIRROR_SIZE; i++) flags += s.mirror[i] ? "a" : "b";
  if (flags === s.flags) return;
  s.flags = flags;
  try { s.entity.nameTag = `${TITLE_PREFIX}${flags}:${target.name}`; } catch { /* ignore */ }
}

function prime(s, target) {
  const c = invOf(s.entity);
  if (!c) return;
  for (let i = 0; i < MIRROR_SIZE; i++) {
    const t = readTarget(target, i);
    s.mirror[i] = fingerprint(t);
    c.setItem(toProjector(i), t);
  }
  refreshNameTag(s, target);
}

function dropAtViewer(viewer, item) {
  if (!item) return;
  try { viewer.dimension.spawnItem(item, viewer.location); } catch { /* ignore */ }
}

function syncSession(s, target) {
  const c = invOf(s.entity);
  if (!c) return;
  for (let i = 0; i < MIRROR_SIZE; i++) {
    const p = c.getItem(toProjector(i));
    const t = readTarget(target, i);
    const fpP = fingerprint(p), fpT = fingerprint(t), last = s.mirror[i];
    if (fpP !== last) {
      // viewer edited this slot -> write to target
      if (writeTarget(target, i, p)) {
        s.mirror[i] = fpP;
      } else {
        // target refused the stack: restore and hand the stack back to the admin
        c.setItem(toProjector(i), t);
        s.mirror[i] = fpT;
        dropAtViewer(s.viewer, p);
      }
    } else if (fpT !== last) {
      // target changed this slot -> show it to the viewer
      c.setItem(toProjector(i), t);
      s.mirror[i] = fpT;
    }
  }
  refreshNameTag(s, target);
  reclaimUnmapped(s);
}

function endSession(viewerId, quiet) {
  const s = sessions.get(viewerId);
  if (!s) return;
  sessions.delete(viewerId);
  try {
    if (s.entity.isValid) {
      s.entity.getComponent("minecraft:rideable")?.ejectRiders();
      s.entity.remove();
    }
  } catch { /* ignore */ }
  if (!quiet) { try { s.viewer.onScreenDisplay.setActionBar("§7Đã đóng Inventory Viewer"); } catch { /* ignore */ } }
}

function startSession(viewer, target) {
  endSession(viewer.id, true);
  let entity;
  try {
    entity = viewer.dimension.spawnEntity(ENTITY_ID, viewer.location);
    entity.addTag(TAG);
    if (!entity.getComponent("minecraft:rideable")?.addRider(viewer)) throw new Error("addRider failed");
  } catch (e) {
    try { entity?.remove(); } catch { /* ignore */ }
    say(viewer, "§c[InvSee] Không thể mở túi đồ: " + e);
    return;
  }
  const s = { viewer, targetId: target.id, entity, mirror: new Array(MIRROR_SIZE).fill(""), flags: "", tick: system.currentTick };
  sessions.set(viewer.id, s);
  prime(s, target);
  system.runTimeout(() => {
    try { viewer.playAnimation(ANIM, { stopExpression: "q.is_sneaking || !q.is_riding" }); } catch { /* ignore */ }
  }, 2);
  try { viewer.onScreenDisplay.setActionBar(`§eBấm nút §lTúi đồ§r§e để mở túi đồ của §f${target.name} §7(Shift để thoát)`); } catch { /* ignore */ }
}

// ---------- forms ----------
async function showForm(form, player) {
  for (let i = 0; i < 12; i++) {
    const res = await form.show(player);
    if (res.cancelationReason !== "UserBusy") return res;
    await new Promise((r) => system.runTimeout(r, 10));
  }
  return undefined;
}

function pickTarget(viewer, target) {
  if (!target || !target.isValid) return;
  startSession(viewer, target);
}

async function showPicker(viewer) {
  const others = world.getAllPlayers().filter((p) => p.id !== viewer.id);
  const form = new ActionFormData().title("Inventory Viewer").body(
    others.length ? "Chọn người chơi để xem túi đồ" : "Không có người chơi nào khác đang online (chơi đơn: dùng nút thử nghiệm bên dưới)"
  );
  form.button("§l🔍 Tìm theo tên");
  form.button("§2Túi đồ của chính mình §7(thử nghiệm)");
  for (const p of others) form.button(p.name);
  const res = await showForm(form, viewer);
  if (!res || res.canceled || res.selection === undefined) return;
  if (res.selection === 0) return showSearch(viewer);
  if (res.selection === 1) return pickTarget(viewer, viewer);
  pickTarget(viewer, others[res.selection - 2]);
}

async function showSearch(viewer) {
  const m = new ModalFormData().title("Tìm người chơi").textField("Tên người chơi", "Steve");
  const r = await showForm(m, viewer);
  if (!r || r.canceled || !r.formValues) return showPicker(viewer);
  const q = String(r.formValues[0] ?? "").toLowerCase();
  const matches = world.getAllPlayers().filter((p) => p.id !== viewer.id && p.name.toLowerCase().includes(q));
  const form = new ActionFormData().title("Kết quả tìm kiếm");
  if (!matches.length) form.body(`Không thấy người chơi nào có tên '${q}'`).button("Tìm lại");
  else { form.body(matches.length === 1 ? "Tìm thấy người chơi:" : "Tìm thấy các người chơi:"); for (const p of matches) form.button(p.name); }
  const res = await showForm(form, viewer);
  if (!res || res.canceled || res.selection === undefined) return;
  if (!matches.length) return showSearch(viewer);
  pickTarget(viewer, matches[res.selection]);
}

async function openMenu(viewer) {
  if (!isAdmin(viewer)) { say(viewer, "§c[InvSee] Chỉ admin mới dùng được vật phẩm này"); return; }
  if (busy.has(viewer.id)) return;
  busy.add(viewer.id);
  try { await showPicker(viewer); } catch (e) { console.warn("[InvSee] menu failed: " + e); } finally { busy.delete(viewer.id); }
}

// ---------- events ----------
world.afterEvents.itemUse.subscribe((ev) => {
  if (ev.itemStack?.typeId === ITEM_ID && ev.source?.typeId === "minecraft:player") openMenu(ev.source);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  const p = ev.sourceEntity;
  if (!p || p.typeId !== "minecraft:player") return;
  if (ev.id === "avaritia:invsee") openMenu(p);
  else if (ev.id === "avaritia:invsee_give") {
    if (!isAdmin(p)) return say(p, "§c[InvSee] Chỉ admin mới dùng được lệnh này");
    const left = invOf(p)?.addItem(new ItemStack(ITEM_ID, 1));
    if (left) dropAtViewer(p, left);
  }
});

world.afterEvents.playerLeave.subscribe((ev) => {
  endSession(ev.playerId, true);
  for (const [vid, s] of sessions) if (s.targetId === ev.playerId) { try { s.viewer.sendMessage("§e[InvSee] Người chơi đã thoát game"); } catch { /* ignore */ } endSession(vid, true); }
});
world.afterEvents.playerDimensionChange.subscribe((ev) => endSession(ev.player.id, true));
world.afterEvents.entityRemove.subscribe((ev) => {
  for (const [vid, s] of sessions) if (s.entity.id === ev.removedEntityId) sessions.delete(vid);
});

// main sync loop
system.runInterval(() => {
  for (const [vid, s] of sessions) {
    if (!s.viewer.isValid || !s.entity.isValid) { endSession(vid, true); continue; }
    const target = world.getEntity(s.targetId);
    if (!target || !target.isValid) { endSession(vid); continue; }
    // viewer left the seat (sneak) -> close
    if (system.currentTick - s.tick > 40) {
      let ridingId;
      try { ridingId = s.viewer.getComponent("minecraft:riding")?.entityRidingOn?.id; } catch { ridingId = undefined; }
      if (ridingId !== s.entity.id) { endSession(vid); continue; }
    }
    // a stack on either cursor lives in no container: wait so a drag is never read as a deletion
    if (cursorHolding(s.viewer) || (target.typeId === "minecraft:player" && cursorHolding(target))) continue;
    syncSession(s, target);
  }
}, 2);

// heartbeat: remove orphaned projector entities (e.g. after a script reload)
system.runInterval(() => {
  const live = new Set([...sessions.values()].map((s) => s.entity.id));
  for (const dimId of ["overworld", "nether", "the_end"]) {
    try {
      for (const e of world.getDimension(dimId).getEntities({ type: ENTITY_ID })) if (!live.has(e.id)) e.remove();
    } catch { /* ignore */ }
  }
}, 100);
