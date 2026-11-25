import * as MC from "@minecraft/server";

// Native minecraft:throwable / minecraft:projectile / minecraft:cooldown
// were removed from avaritia:endest_pearl (conflicted with minecraft:durability,
// needed for the hotbar icon animation). This manually spawns the projectile
// entity with the same power/direction the native component would have used.
// The entity avaritia:endest_pearl already has its own minecraft:projectile
// component (gravity, power, on-hit -> spawns avaritia:black_hole), so flight
// physics and impact behavior are unaffected - this script only replaces the
// "throw it from the player's hand" part.

const COOLDOWN_TICKS = 16; // matches original cooldown category "ender_pearl", 0.8s
const THROW_POWER = 2.5;   // matches the entity's own minecraft:projectile "power"

// Self-contained cooldown tracking (the item no longer declares its own
// minecraft:cooldown category, so player.startItemCooldown wouldn't have
// anything to attach a visual cooldown to - this just prevents spamming).
const lastThrowTick = new Map();

MC.world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const item = event.itemStack;
  if (!(player instanceof MC.Player)) return;
  if (item.typeId !== "avaritia:endest_pearl") return;

  const now = MC.system.currentTick;
  const last = lastThrowTick.get(player.id) ?? -Infinity;
  if (now - last < COOLDOWN_TICKS) return;
  lastThrowTick.set(player.id, now);

  const dir = player.getViewDirection();
  const head = player.getHeadLocation();
  const spawnLoc = {
    x: head.x + dir.x * 0.5,
    y: head.y + dir.y * 0.5,
    z: head.z + dir.z * 0.5,
  };

  const proj = player.dimension.spawnEntity("avaritia:endest_pearl_projectile", spawnLoc);
  proj.applyImpulse({
    x: dir.x * THROW_POWER,
    y: dir.y * THROW_POWER,
    z: dir.z * THROW_POWER,
  });
  const projComp = proj.getComponent("minecraft:projectile");
  if (projComp) projComp.owner = player;

  player.playSound("random.bow", { location: player.location, pitch: 1.3 });

  // Consume 1 from the stack (native minecraft:throwable normally does this).
  MC.system.run(() => {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv || !inv.container) return;
    const slot = player.selectedSlotIndex;
    const current = inv.container.getItem(slot);
    if (!current || current.typeId !== "avaritia:endest_pearl") return;
    if (current.amount <= 1) {
      inv.container.setItem(slot, undefined);
    } else {
      current.amount -= 1;
      inv.container.setItem(slot, current);
    }
  });
});
