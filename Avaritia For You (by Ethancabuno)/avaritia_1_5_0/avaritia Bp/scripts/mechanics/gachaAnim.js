// Gacha pull animations. The screens live in RP/ui/server_form.json (gacha_anim_panel) and are
// recognised by the form title "avaritia:gacha_ui_anim:<style>" (x1) or "...:m<style>" (x10 screens).
// Every animation plays on the player's side (JSON UI animations); this module only decides WHAT is
// shown: which tier colour and which item icons the form buttons carry. Button indices follow
// gachaAnimLayout.js (generated together with the UI, so the two always agree).
// Item icons are animated as F separate frame images (items/<name>_0..7) that the UI loops with alpha.
import { ActionFormData } from "@minecraft/server-ui";
import { ANIM_LAYOUT as L } from "./gachaAnimLayout.js";

export const STYLE_NAMES = ["Off", ...L.styles]; // 0 = Off, 1..6 = Drop, Wheel, Reel, Flip, Orb, Grid
// Reel frame skins (0 = original). The UI picks the skin from the ":f<n>" suffix of the form title.
export const FRAME_NAMES = ["Default", "Royal", "Marquee", "Cosmic", "Cyber", "Prism"];
const TEX = "textures/ui/gacha/";
const NONE = TEX + "anim/none";
const F = L.frames;
const TIER_IDX = { common: 0, rare: 1, epic: 2, legendary: 3, unreal: 4 };
const TIER_WEIGHTS = [55, 25, 12, 6, 2];
const TIER_KEYS = ["common", "rare", "epic", "legendary", "unreal"];

const iconName = (id) => {
  const n = id.split(":")[1];
  return L.icons.includes(n) ? n : null;
};
const iconFrames = (id) => {
  const n = iconName(id);
  return Array.from({ length: F }, (_, k) => (n ? `${TEX}items/${n}_${k}` : NONE));
};
const iconStatic = (id) => iconFrames(id)[0];
const tierTex = (kind, t) => `${TEX}anim/${kind}_${t}`;
const needleTex = (deg) => `${TEX}anim/needle_${String(Math.round(deg / 5) % 72).padStart(2, "0")}`;

function randomTier() {
  let r = Math.random() * 100;
  for (let i = 0; i < 5; i++) {
    r -= TIER_WEIGHTS[i];
    if (r < 0) return i;
  }
  return 4;
}

const rnd = (lo, hi) => lo + Math.random() * (hi - lo);

/**
 * Needle angles for one spin of N frames (20 fps): a fast constant-speed phase, then friction-like
 * exponential slowdown that creeps over the last segments and finally stops INSIDE the winning
 * segment (at a random spot, never on the edge). Returns the angles and the final needle angle.
 */
function spinAngles(a0, tier, N, fast, v1, minTurns) {
  const land = tier * 72 + 36 + Math.floor(rnd(-24, 25)); // random point inside the segment (12..60 deg of 72)
  const A1 = fast * v1; // distance covered at constant speed
  const need = (((land - a0 - A1) % 360) + 360) % 360; // extra angle so the spin ends exactly on `land`
  const m = N - fast - 1; // frames of the slowdown
  const tau = m / 4.5; // time constant: the needle is almost still at the end
  const norm = 1 - Math.exp(-m / tau);
  const dStar = v1 * tau * norm; // slowdown distance that matches the fast speed (no visible jerk)
  let D = need + 360 * Math.max(minTurns, Math.round((dStar - need) / 360));
  if (D < 90) D += 360;
  const out = [];
  for (let k = 0; k < N; k++) {
    out.push(k < fast ? a0 + k * v1 : a0 + A1 + (D * (1 - Math.exp(-(k - fast) / tau))) / norm);
  }
  return { angles: out, end: (((a0 + A1 + D) % 360) + 360) % 360 };
}
const needleOf = (deg) => needleTex(((deg % 360) + 360) % 360);

/** Single wheel (160 frames = 8 s): ~1.5 s fast spin, then a long natural slowdown onto the winning segment. */
function needleFrames(tier) {
  const fast = 24 + Math.floor(Math.random() * 13); // 1.2 .. 1.8 s
  const v1 = rnd(30, 45); // 600 .. 900 deg/s
  return spinAngles(0, tier, L.wheelFrames, fast, v1, 1).angles.map(needleOf);
}

/** Ten-pull wheel: ten short spins in a row; each starts where the last one stopped. */
function multiNeedleFrames(tiers) {
  const out = [];
  let a0 = 0;
  for (const t of tiers) {
    const r = spinAngles(a0, t, L.multi.spin, 4, rnd(28, 42), 0);
    for (const a of r.angles) out.push(needleOf(a));
    a0 = r.end;
  }
  return out;
}

/**
 * o = { style (1..6), results (rarest first), count, caption, decoy(tierKey) -> id, showForm }
 * Resolves when the player presses Skip (or closes the form).
 */
export async function playGachaAnimation(player, o) {
  let style = o.style;
  if (style === 6 && o.count < 10) style = 1; // the grid needs ten results
  if (style < 1 || style > 6) return;
  const best = o.results[0];
  const bt = TIER_IDX[best.tier];
  // x10 with styles 1-5: every pull plays on one screen ("m<style>"); x1: one big animation
  const multi = o.count >= 10 && o.results.length >= 10 && style <= 5;

  const form = new ActionFormData()
    .title(`avaritia:gacha_ui_anim:${multi ? "m" : ""}${style}${o.frame > 0 ? ":f" + o.frame : ""}`)
    .body(multi ? "" : (o.caption ?? ""));
  form.button("Skip"); // index 0
  const slot = (tex) => form.button("", tex);
  const slots = (arr) => arr.forEach(slot);
  const decoy = () => {
    const t = randomTier();
    return { id: o.decoy(TIER_KEYS[t]), t };
  };

  if (multi) {
    const list = [...o.results].reverse(); // rarest last
    if (style === 3) {
      // ten slot reels; the 9th cell of reel r is pull r, the animated icon overlay shows it when the reel stops
      for (let r = 0; r < L.multi.reels; r++) {
        const real = list[r] ?? best;
        for (let k = 0; k < L.multi.reelCells; k++) {
          const c = k === L.multi.reelTarget ? { id: real.id, t: TIER_IDX[real.tier] } : decoy();
          slot(tierTex("tier_cell", c.t));
          slot(iconStatic(c.id));
        }
        slots(iconFrames(real.id));
      }
    } else {
      // per pull: tier cell, card front, ring, spark, 8 icon frames
      for (let i = 0; i < 10; i++) {
        const r = list[i] ?? best;
        const t = TIER_IDX[r.tier];
        slot(tierTex("tier_cell", t));
        slot(tierTex("card_front", t));
        slot(tierTex("ring", t));
        slot(tierTex("spark", t));
        slots(iconFrames(r.id));
      }
      if (style === 2) slots(multiNeedleFrames(list.map((r) => TIER_IDX[r.tier])));
    }
  } else if (style === 3) {
    // slot reel: 30 cells (tier frame + static icon); the 25th is the real result, its animated icon overlays at the end
    for (let k = 0; k < L.cells; k++) {
      const c = k === 24 ? { id: best.id, t: bt } : decoy();
      slot(tierTex("tier_cell", c.t));
      slot(iconStatic(c.id));
    }
    slots(iconFrames(best.id));
  } else if (style === 6) {
    // ten-pull grid: rarest item revealed last; per cell: tier cell + 8 icon frames
    const list = [...o.results].reverse();
    for (let i = 0; i < L.grid; i++) {
      const r = list[i] ?? best;
      slot(tierTex("tier_cell", TIER_IDX[r.tier]));
      slots(iconFrames(r.id));
    }
  } else {
    // drop / wheel / flip / orb: the best item of the pull
    slot(tierTex("tier_cell", bt)); // 1
    slot(tierTex("card_front", bt)); // 2
    slot(tierTex("spark", bt)); // 3
    for (let j = 0; j < 5; j++) slot(j <= bt ? tierTex("ring", bt) : NONE); // 4..8
    slots(iconFrames(best.id)); // 9..16
    if (style === 2) slots(needleFrames(bt)); // 17..
  }
  await o.showForm(player, form);
}
