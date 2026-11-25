import { world, system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { isValidPlayer } from "./core/helpers.js";
import { handleKitOp } from "./commands/kitop.js";
import { handleKitN } from "./commands/kitn.js";

const KIT_SELECTOR_ID = "tc:kit_selector";

function showKitSystem(player) {
  if (!isValidPlayer(player)) return;

  const form = new ActionFormData()
    .title("Kit System")
    .body("Select the kit you want to prepare.")
    .button("KitOP")
    .button("KitN");

  form.show(player).then((response) => {
    if (response.canceled || !player.isValid) return;

    if (response.selection === 0) {
      if (player.commandPermissionLevel < CommandPermissionLevel.GameDirectors) {
        player.sendMessage("§cKitOP is available to operators only.");
        return;
      }
      handleKitOp({ sourceEntity: player });
      return;
    }

    if (response.selection === 1) {
      handleKitN({ sourceEntity: player });
    }
  }).catch(() => {
    if (player.isValid) player.sendMessage("§cKit System could not be opened right now.");
  });
}

// The Kit Selector opens Kit System with one right-click/use action.
world.afterEvents.itemUse.subscribe((event) => {
  if (event.itemStack.typeId !== KIT_SELECTOR_ID) return;
  const player = event.source;
  if (!isValidPlayer(player)) return;
  system.run(() => showKitSystem(player));
});

// Alternative commands remain available.
system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
  customCommandRegistry.registerCommand(
    {
      name: "tc:kitop",
      description: "Spawn the OP kit room around you and auto-equip gear (Operators only)",
      cheatsRequired: false,
      permissionLevel: CommandPermissionLevel.GameDirectors
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!isValidPlayer(player)) return { status: CustomCommandStatus.Failure };
      system.run(() => {
        if (!player.isValid) return;
        handleKitOp(origin);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "tc:kitn",
      description: "Spawn a normal gear chest (vanilla survival-max enchants) in front of you",
      cheatsRequired: false,
      permissionLevel: CommandPermissionLevel.Any
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!isValidPlayer(player)) return { status: CustomCommandStatus.Failure };
      system.run(() => {
        if (!player.isValid) return;
        handleKitN(origin);
      });
      return { status: CustomCommandStatus.Success };
    }
  );
});
