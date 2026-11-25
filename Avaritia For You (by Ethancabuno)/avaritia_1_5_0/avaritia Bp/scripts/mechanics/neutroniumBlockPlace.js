import { world, system } from "@minecraft/server";

// Block-placing animation item (the icon spins). Before the block is placed, force the state placed=true
// so the block shows up statically (no spinning) right away, then switch to the real block as before.
system.beforeEvents.startup.subscribe((init) => {
  init.blockComponentRegistry.registerCustomComponent("avaritia:neutron_block_place", {
    beforeOnPlayerPlace(event) {
      try {
        event.permutationToPlace = event.permutationToPlace.withState("avaritia:placed", true);
      } catch (e) {}
    },
  });
});

world.afterEvents.playerPlaceBlock.subscribe((event) => {
  try {
    if (event.block.typeId === "avaritia:anim_neutronium_block") {
      event.block.setType("avaritia:neutronium_block");
    }
  } catch (e) {}
});
