// Pure placement planning shared by live generators and the preview system.
// Rotation is clockwise in 90-degree steps when viewed from above.

export const KITOP_UNIT_DEFINITIONS = [
  { id: "kitop:kitop_chest_s", dx: -1, dy: 0, dz: -3, kit: true },
  { id: "kitop:chest_armor_s", dx: 1, dy: 0, dz: -3 },
  { id: "kitop:chest_weapons_w", dx: 3, dy: 0, dz: -1 },
  { id: "kitop:chest_combat_w", dx: 3, dy: 0, dz: 1 },
  { id: "kitop:chest_mine_n", dx: -1, dy: 0, dz: 3 },
  { id: "kitop:chest_build_n", dx: 1, dy: 0, dz: 3 },
  { id: "kitop:chest_food_e", dx: -3, dy: 0, dz: -1 },
  { id: "kitop:chest_tools_e", dx: -3, dy: 0, dz: 1 },
  { id: "kitop:chest_red_s", dx: -1, dy: 3, dz: -3 },
  { id: "kitop:chest_nether_s", dx: 1, dy: 3, dz: -3 },
  { id: "kitop:chest_rare_w", dx: 3, dy: 3, dz: -1 }
];

export const KITOP_STAND_DEFINITIONS = [
  { id: "kitop:stand_netherite_315", dx: -2, dy: 0, dz: -2 },
  { id: "kitop:stand_diamond_45", dx: 3, dy: 0, dz: -2 },
  { id: "kitop:stand_gold_225", dx: -2, dy: 0, dz: 3 },
  { id: "kitop:stand_elytra_135", dx: 3, dy: 0, dz: 3 }
];

const KITOP_KIT_ANCHOR = { dx: -1, dy: 0, dz: -3 };
export const KITN_FOOTPRINT = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
const CARDINALS = ["n", "e", "s", "w"];

function normalizeQuarterTurns(value) {
  if (!Number.isInteger(value)) throw new TypeError("Rotation must be an integer number of quarter-turns.");
  return ((value % 4) + 4) % 4;
}

export function rotateOffset(dx, dz, quarterTurns = 0) {
  let x = dx;
  let z = dz;
  for (let i = 0; i < normalizeQuarterTurns(quarterTurns); i++) {
    [x, z] = [-z, x];
  }
  return { x, z };
}

function rotateStructureId(id, quarterTurns) {
  const turns = normalizeQuarterTurns(quarterTurns);
  if (turns === 0) return id;

  return id.replace(/_([nesw])$/, (_, facing) => {
    const index = CARDINALS.indexOf(facing);
    return "_" + CARDINALS[(index + turns) % 4];
  }).replace(/_(\d{1,3})$/, (match, angle) => {
    const next = (Number(angle) + turns * 90) % 360;
    return "_" + next;
  });
}

function atAnchor(anchor, dx, dy, dz, quarterTurns) {
  const offset = rotateOffset(dx, dz, quarterTurns);
  return {
    x: Math.floor(anchor.x) + offset.x,
    y: Math.floor(anchor.y) + dy,
    z: Math.floor(anchor.z) + offset.z
  };
}

export function createKitOpPlan(anchor, quarterTurns = 0) {
  const turns = normalizeQuarterTurns(quarterTurns);
  const units = KITOP_UNIT_DEFINITIONS.map((unit) => ({
    id: rotateStructureId(unit.id, turns),
    kit: unit.kit === true,
    location: atAnchor(anchor, unit.dx, unit.dy, unit.dz, turns)
  }));
  const stands = KITOP_STAND_DEFINITIONS.map((stand) => ({
    id: rotateStructureId(stand.id, turns),
    location: atAnchor(anchor, stand.dx, stand.dy, stand.dz, turns)
  }));

  return {
    rotation: turns,
    units,
    stands,
    kitAnchor: atAnchor(
      anchor,
      KITOP_KIT_ANCHOR.dx,
      KITOP_KIT_ANCHOR.dy,
      KITOP_KIT_ANCHOR.dz,
      turns
    )
  };
}

export function createKitNPlan(anchor, quarterTurns = 0) {
  const turns = normalizeQuarterTurns(quarterTurns);
  const cells = KITN_FOOTPRINT.map(({ x, z }) => {
    const offset = rotateOffset(x, z, turns);
    return {
      x: Math.floor(anchor.x) + offset.x,
      y: Math.floor(anchor.y),
      z: Math.floor(anchor.z) + offset.z
    };
  });

  return { rotation: turns, anchor: { x: Math.floor(anchor.x), y: Math.floor(anchor.y), z: Math.floor(anchor.z) }, cells };
}
