import { world } from "@minecraft/server";
import { resolveStructure } from "./helpers.js";

const PREVIEW_NAMESPACE = "tc_preview";
const previewCache = new Map();

function previewId(sourceId) {
  const safe = sourceId.toLowerCase().replace(/[^a-z0-9_./-]/g, "_").replace(/[./-]+/g, "_");
  return `${PREVIEW_NAMESPACE}:${safe}`;
}

/**
 * Creates an in-memory copy of a pack structure containing block permutations
 * only. Structure entities and block-entity inventories are intentionally
 * excluded, so preview copies cannot grant kit contents or equipped entities.
 */
export function getInventoryFreePreviewStructure(sourceId) {
  const cached = previewCache.get(sourceId);
  if (cached?.isValid) return cached;

  const source = resolveStructure(sourceId);
  if (!source) throw new Error(`Missing source structure: ${sourceId}`);

  const manager = world.structureManager;
  const size = source.size;
  const id = previewId(sourceId);
  const existing = manager.get(id);
  if (existing?.isValid) {
    previewCache.set(sourceId, existing);
    return existing;
  }

  const copy = manager.createEmpty(id, { x: size.x, y: size.y, z: size.z });
  try {
    for (let x = 0; x < size.x; x++) {
      for (let y = 0; y < size.y; y++) {
        for (let z = 0; z < size.z; z++) {
          const location = { x, y, z };
          const permutation = source.getBlockPermutation(location);
          if (!permutation) continue;
          copy.setBlockPermutation(
            location,
            permutation,
            source.getIsWaterlogged(location)
          );
        }
      }
    }
  } catch (error) {
    manager.delete(copy);
    throw error;
  }

  previewCache.set(sourceId, copy);
  return copy;
}

/** Places a sanitized visual copy. Callers must validate the full footprint first. */
export function placeInventoryFreePreview(sourceId, dimension, location, rotation) {
  const structure = getInventoryFreePreviewStructure(sourceId);
  world.structureManager.place(structure, dimension, location, {
    includeBlocks: true,
    includeEntities: false,
    rotation
  });
  return structure;
}

/** Deletes only the cached in-memory copy; it never edits blocks in the world. */
export function clearPreviewStructureCache(sourceId) {
  const structure = previewCache.get(sourceId);
  if (!structure) return false;
  previewCache.delete(sourceId);
  if (structure.isValid) return world.structureManager.delete(structure);
  return false;
}
