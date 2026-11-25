import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { isValidPlayer } from "./core/helpers.js";
import { handleKitOp } from "./commands/kitop.js";
import { handleKitN } from "./commands/kitn.js";
import {
  startKitNPreview,
  confirmKitNPreview,
  cancelKitNPreview
} from "./commands/kitn_preview.js";

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
      startKitNPreview(player);
    }
  }).catch(() => {
    if (player.isValid) player.sendMessage("§cKit System could not be opened right now.");
  });
}

system.beforeEvents.startup.subscribe(({ itemComponentRegistry, customCommandRegistry }) => {
  itemComponentRegistry.registerCustomComponent("tc:kit_selector_use", {
    onUse(event) {
      const player = event.source;
      if (!isValidPlayer(player)) return;
      system.run(() => showKitSystem(player));
    }
  });

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
      name: "tc:preview_confirm",
      description: "Confirm the active KitN preview",
      cheatsRequired: false,
      permissionLevel: CommandPermissionLevel.Any
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!isValidPlayer(player)) return { status: CustomCommandStatus.Failure };
      system.run(() => {
        if (player.isValid) confirmKitNPreview(player);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  customCommandRegistry.registerCommand(
    {
      name: "tc:preview_cancel",
      description: "Cancel the active kit preview",
      cheatsRequired: false,
      permissionLevel: CommandPermissionLevel.Any
    },
    (origin) => {
      const player = origin.sourceEntity;
      if (!isValidPlayer(player)) return { status: CustomCommandStatus.Failure };
      system.run(() => {
        if (player.isValid) cancelKitNPreview(player);
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
