// Shared helpers for the admin tools (Inventory Viewer, Infinity Clock).
import { system } from "@minecraft/server";

/** Operators, owners/hosts and players with the tag "admin" count as admins. */
export const isAdmin = (p) => {
  try { if (p.isOp()) return true; } catch { /* ignore */ }
  try { if (Number(p.commandPermissionLevel) >= 2) return true; } catch { /* ignore */ }
  try { return p.hasTag("admin"); } catch { return false; }
};

export const say = (p, m) => { try { p.sendMessage(m); } catch { /* ignore */ } };

/** form.show() that waits while the chat/another screen is open. */
export async function showForm(form, player) {
  for (let i = 0; i < 12; i++) {
    const res = await form.show(player);
    if (res.cancelationReason !== "UserBusy") return res;
    await new Promise((r) => system.runTimeout(r, 10));
  }
  return undefined;
}
