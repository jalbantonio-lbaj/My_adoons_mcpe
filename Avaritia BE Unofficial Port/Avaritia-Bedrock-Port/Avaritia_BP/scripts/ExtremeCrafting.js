import { system, world, ItemStack } from '@minecraft/server'
import { EXTREME_TAG, EXTREME_HOLDER, EXTREME_OUTPUT } from './constants.js';
import { EXTREME_RECIPES } from "./extreme_recipes.js";
import { INFINITY_CATALYST_RECIPE } from "./infinity_catalyst_recipe.js";
import { 
    getHolderContainer, getDP, setDP, cleanupHolderEntity, 
    assignTickGroup, releaseTickGroup 
} from './helperFunctions.js';

function matchRecipeGrid(grid, recipe) {
    if (!recipe || recipe.pattern.length !== 9) return false;
    let matched = 0;
    for (let row = 0; row < 9; row++) {
        const line = recipe.pattern[row];
        if (!line || line.length !== 9) return false;
        for (let col = 0; col < 9; col++) {
            const ch = line[col];
            const idx = row * 9 + col;
            if (ch === " ") {
                if (grid[idx] !== null) return false;
            } else {
                const want = recipe.key[ch];
                if (!want) return false;
                const have = grid[idx];
                if (!have) return false;
                if (typeof want === "string") {
                    if (have.typeId !== want) return false;
                } else if (want.tag && typeof want.tag === "string") {
                    if (!have.hasTag(want.tag)) return false;
                } else {
                    return false;
                }
                matched++;
            }
        }
    }
    return matched > 0;
}

function matchExtremeRecipe(container) {
    const grid = [];
    for (let i = 0; i < 81; i++) {
        const it = container.getItem(i);
        grid.push(it && it.amount > 0 ? it : null);
    }
    for (const r of EXTREME_RECIPES) {
        if (matchRecipeGrid(grid, r)) return r;
    }
    if (INFINITY_CATALYST_RECIPE && matchRecipeGrid(grid, INFINITY_CATALYST_RECIPE)) {
        return INFINITY_CATALYST_RECIPE;
    }
    return null;
}

function consumeExtremeInputs(container, recipe) {
  for (let row = 0; row < 9; row++) {
    const line = recipe.pattern[row];
    if (!line) continue;
    for (let col = 0; col < 9; col++) {
      const ch = line[col];
      if (ch === " ") continue;
      const idx = row * 9 + col;
      const it = container.getItem(idx);
      if (it && it.amount > 0) {
        if (it.amount > 1) {
          it.amount -= 1;
          container.setItem(idx, it);
        } else {
          container.setItem(idx, undefined);
        }
      }
    }
  }
}

function updateExtremeOutput(entity) {
  const c = getHolderContainer(entity);
  if (!c) return;
  const recipe = matchExtremeRecipe(c);
  const cur = c.getItem(EXTREME_OUTPUT);
  const curId = (cur && cur.amount > 0) ? cur.typeId : "";
  const curAmt = (cur && cur.amount > 0) ? cur.amount : 0;
  const last = getDP(entity, "extremeLastOutput", "") || "";
  const lastCount = getDP(entity, "extremeOutputCount", 0) || 0;
  const ours = !!getDP(entity, "extremeOutputOurs", false);

  if (recipe) {
    const resId = recipe.result.item;
    const resCount = recipe.result.count || 1;
    if (curId === "") {
      if (last === "" || !ours) {
        try {
          const want = new ItemStack(resId, resCount);
          c.setItem(EXTREME_OUTPUT, want);
          setDP(entity, "extremeLastOutput", resId);
          setDP(entity, "extremeOutputCount", resCount);
          setDP(entity, "extremeOutputOurs", true);
        } catch (err) {
          console.error("[EXTREME] bad recipe result item: " + resId + " -> " + err);
        }
      } else {
        consumeExtremeInputs(c, recipe);
        setDP(entity, "extremeOutputOurs", false);
        setDP(entity, "extremeLastOutput", "");
        setDP(entity, "extremeOutputCount", 0);
      }
    } else if (ours && curId === resId) {
      if (curAmt < lastCount) {
        const taken = lastCount - curAmt;
        for (let k = 0; k < taken; k++) consumeExtremeInputs(c, recipe);
        setDP(entity, "extremeOutputCount", curAmt);
        if (curAmt === 0) { setDP(entity, "extremeOutputOurs", false); setDP(entity, "extremeLastOutput", ""); }
      } else if (curAmt > lastCount) {
        setDP(entity, "extremeOutputCount", curAmt);
      }
    } else if (ours && curId !== resId) {
      consumeExtremeInputs(c, recipe);
      setDP(entity, "extremeOutputOurs", false);
      setDP(entity, "extremeLastOutput", "");
      setDP(entity, "extremeOutputCount", 0);
    }
  } else {
    if (ours && curId !== "" && curId === last) {
      if (curAmt > 1) {
        cur.amount = curAmt - 1;
        c.setItem(EXTREME_OUTPUT, cur);
      } else {
        c.setItem(EXTREME_OUTPUT, undefined);
      }
      setDP(entity, "extremeOutputOurs", false);
      setDP(entity, "extremeLastOutput", "");
      setDP(entity, "extremeOutputCount", 0);
    }
  }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("avaritia:dire_craft_trigger", {
    onPlace({ block }) {
      try {
        const loc = block.location;
        const dim = block.dimension;
        cleanupHolderEntity(dim, loc, EXTREME_TAG);
        const e = dim.spawnEntity(EXTREME_HOLDER, { x: loc.x + 0.5, y: loc.y, z: loc.z + 0.5 });
        e.addTag(EXTREME_TAG);
        e.nameTag = "entity.avaritia:extreme_craft.name";
        setDP(e, "blockLoc", { x: loc.x, y: loc.y, z: loc.z });
        setDP(e, "dimId", dim.id);
        assignTickGroup(e);
      } catch (err) {
        try { block.dimension.runCommand(`tellraw @a {"rawtext":[{"text":"[EXTREME] spawn ERR: ${err}"}]}`); } catch (_) {}
      }
    },
    onPlayerBreak({ block }) {
      try {
        const dim = block.dimension;
        const loc = block.location;
        const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
        for (const e of dim.getEntities({ tags: [EXTREME_TAG] })) {
          const bl = getDP(e, "blockLoc");
          if (bl && bl.x === fx && bl.y === fy && bl.z === fz) {
            const c = getHolderContainer(e);
            if (c) {
              const recipe = matchExtremeRecipe(c);
              const resId = recipe ? recipe.result.item : "";
              const resCount = (recipe && recipe.result.count) ? recipe.result.count : 1;

              for (let i = 0; i < EXTREME_OUTPUT; i++) {
                const it = c.getItem(i);
                if (it && it.amount > 0) dim.spawnItem(it, block.center());
                try { c.setItem(i, undefined); } catch (_) {}
              }
              const outputItem = c.getItem(EXTREME_OUTPUT);
              if (outputItem && outputItem.amount > 0) {
                const ours = !!getDP(e, "extremeOutputOurs", false);

                let dropAmt = 0;
                if (ours && outputItem.typeId === resId) {
                  dropAmt = Math.max(0, outputItem.amount - resCount);
                } else if (!ours) {
                  dropAmt = outputItem.amount;
                }
                else if (ours && outputItem.typeId !== resId) {
                  dropAmt = outputItem.amount;
                }

                if (dropAmt > 0) {
                  const dropStack = new ItemStack(outputItem.typeId, dropAmt);
                  dim.spawnItem(dropStack, block.center());
                }
              }
              try { c.setItem(EXTREME_OUTPUT, undefined); } catch (_) {}
            }
            releaseTickGroup(e);
            e.remove();
          }
        }
      } catch (err) {
          console.error("[Avaritia Debug Error]: " + err);
      }
    },
    onTick({ block }) {
          try {
            const dim = block.dimension;
            const loc = block.location;
            const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
            for (const e of dim.getEntities({ tags: [EXTREME_TAG] })) {
              const bl = getDP(e, "blockLoc");
              if (!bl) continue;
              if (bl && bl.x === fx && bl.y === fy && bl.z === fz) {
                updateExtremeOutput(e);
              }
            }
          } catch (err) {}
        }
  });
  });