import { world, system } from "@minecraft/server";
import { getSingularityMultiplier } from "./multipliers";

export let COMPRESS_MAP_BASE = {
  "minecraft:coal_block":           { out: "avaritia:singularity_coal",           amt: 600, name: "Coal Blocks" },
  "minecraft:copper_block":         { out: "avaritia:singularity_copper",         amt: 600, name: "Copper Blocks" },
  "minecraft:iron_block":           { out: "avaritia:singularity_iron",           amt: 400, name: "Iron Blocks" },
  "minecraft:gold_block":           { out: "avaritia:singularity_gold",           amt: 400, name: "Gold Blocks" },
  "minecraft:lapis_block":          { out: "avaritia:singularity_lapis",          amt: 400, name: "Lapis Lazuli" },
  "minecraft:redstone_block":       { out: "avaritia:singularity_redstone",       amt: 700, name: "Redstone Blocks" },
  "minecraft:diamond_block":        { out: "avaritia:singularity_diamond",        amt: 500, name: "Diamond Blocks" },
  "minecraft:emerald_block":        { out: "avaritia:singularity_emerald",        amt: 400, name: "Emerald Blocks" },
  "minecraft:quartz_block":         { out: "avaritia:singularity_quartz",         amt: 400, name: "Quartz Blocks" },
  "minecraft:netherite_block":      { out: "avaritia:singularity_netherite",      amt: 100, name: "Netherite Blocks" },
  "utilitycraft:steel_block":       { out: "avaritia:singularity_steel",          amt: 400, name: "Steel Blocks" },
  "utilitycraft:energized_iron_block": { out: "avaritia:singularity_energized_iron", amt: 600, name: "Energized Iron Blocks" },
  "utilitycraft:silicon_block":     { out: "avaritia:singularity_silicon",        amt: 400, name: "Silicon Blocks" },
  "utilitycraft:lead_block":        { out: "avaritia:singularity_lead",           amt: 400, name: "Lead Blocks" },
  "utilitycraft:uranium_block":     { out: "avaritia:singularity_uranium",        amt: 400, name: "Uranium Blocks" },
  "utilitycraft:tin_block":         { out: "avaritia:singularity_tin",            amt: 600, name: "Tin Blocks" },
  "utilitycraft:bronze_block":      { out: "avaritia:singularity_bronze",         amt: 400, name: "Bronze Blocks" },
  "utilitycraft:titanium_block":    { out: "avaritia:singularity_titanium",       amt: 300, name: "Titanium Blocks" },
  "utilitycraft:tungsten_block":    { out: "avaritia:singularity_tungsten",       amt: 400, name: "Tungsten Blocks" },
  "utilitycraft:aetherium_block":   { out: "avaritia:singularity_aetherium",      amt: 300, name: "Aetherium Blocks" },
  "utilitycraft:fluxite_block":    { out: "avaritia:singularity_fluxite",        amt: 300, name: "Fluxite Blocks"}
};

export function getEffectiveCompressMap() {
    const multiplier = getSingularityMultiplier();
    if (multiplier === 1.0) return COMPRESS_MAP_BASE;

    const effectiveMap = {};
    for (const [input, data] of Object.entries(COMPRESS_MAP_BASE)) {
        effectiveMap[input] = {
            out: data.out,
            amt: Math.ceil(data.amt * multiplier),
            name: data.name
        };
    }
    return effectiveMap;
}

export const COMPRESS_MAP = getEffectiveCompressMap();

system.afterEvents.scriptEventReceive.subscribe((event) => {
  const id = event.id
  const message = event.message

  if(id === "avaritia:register_compressor_recipe") {
    try {
      const data = JSON.parse(message);
      if (!data.input || !data.output || !data.amt || !data.name) {
        throw new Error("Invalid structure: requires input, output, amt, name");
      }
      COMPRESS_MAP_BASE[data.input] = {
        out: data.output,
        amt: data.amt,
        name: data.name
      };
      console.log(`[Compressor] Registered recipe: ${data.input} -> ${data.output} (${data.amt})`);
    } catch (error) {
      console.error(`[Compressor] Registration failed: ${error}`);
    }
  }
}, { "namespaces": ["avaritia"] });

/*
to register a custom compressor recipe:

import { system } from '@minecraft/server'

function registerCompressorRecipe(input, output, amt, name) { //iput and output are self-explanatory, amt is the amount of input items needed for the output, name is the name displayed in the compressor (e.g. 356/400 input items, "input items" is the name)
  const recipe = JSON.stringify({
    input: input,
    output: output,
    amt: amt,
    name: name
  });

  system.sendScriptEvent("avaritia:register_compressor_recipe", recipe)
}

system.runTimeout(() => {
  registerCompressorRecipe("myaddon:inputitem", "namespace:outputitem", 1000, "Custom Blocks")
}, 20);

keep in mind that the amount will be affected by the multiplier.

*/