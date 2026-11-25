import * as MC from "@minecraft/server";
import { showMatterClusterUI} from "./matterCluster.js";

MC.world.afterEvents.itemUse.subscribe((data) => {
  const player = data.source;
  const inventory = player.getComponent("inventory");
  const equipment = player.getComponent("equippable");
  if (!equipment || !inventory) return;
  const item = equipment?.getEquipment("Mainhand");
  if (!item || !player) return;
  if (item.typeId == "avaritia:matter_cluster") return showMatterClusterUI(player, item);
  transform(player, item, inventory);
});

function transform(player, item, inventory) {
  if (player.isSneaking) {
    if (!item.typeId.includes("avaritia:infinity")) return;
    let itemSlot = -1;
    for (let i = 0; i < inventory.container.size; i++) {
      const slot = inventory.container.getItem(i);
      if (slot && slot.typeId == item.typeId) {
        itemSlot = i;
        break;
      }
    };
    if (itemSlot == -1) return;
    if (item.typeId.endsWith("_pickaxe")) {
      inventory.container.setItem(itemSlot, new MC.ItemStack("avaritia:infinity_hammer"));
    }
    if (item.typeId.endsWith("_shovel")) {
      inventory.container.setItem(itemSlot, new MC.ItemStack("avaritia:infinity_destroyer"));
    }
    if (item.typeId.endsWith("_hammer")) {
      inventory.container.setItem(itemSlot, new MC.ItemStack("avaritia:infinity_pickaxe"));
    }
    if (item.typeId.endsWith("_destroyer")) {
      inventory.container.setItem(itemSlot, new MC.ItemStack("avaritia:infinity_shovel"));
    }
  }
}
