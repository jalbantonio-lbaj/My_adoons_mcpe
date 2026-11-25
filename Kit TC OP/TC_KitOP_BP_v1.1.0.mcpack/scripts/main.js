import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { isValidPlayer } from "./core/helpers.js";
import { handleKitOp } from "./commands/kitop.js";
import { handleKitN } from "./commands/kitn.js";

// -- Register: /tc:kitop and /tc:kitN commands, usable without cheats.
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
