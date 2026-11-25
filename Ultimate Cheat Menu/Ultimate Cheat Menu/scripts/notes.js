import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const MAX_NOTES = 20;

function loadNotes(player) {
    try {
        const raw = player.getDynamicProperty("playerNotes");
        return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
}

function saveNotes(player, notes) {
    try { player.setDynamicProperty("playerNotes", JSON.stringify(notes)); } catch (_) {}
}

export function showNotesMenu(player, backToMain) {
    system.run(() => {
        const notes = loadNotes(player);
        const gui = new ActionFormData();
        gui.title("§lNotes");
        if (notes.length === 0) {
            gui.body("§7No notes saved yet.\n§eTap '+ New Note' to write something.");
        } else {
            gui.body("§aSaved Notes: §f" + notes.length + " §7/ " + MAX_NOTES);
        }
        gui.button("§8+ New Note", "textures/ui/color_plus");
        gui.button("§8- Delete a Note", "textures/ui/cancel");
        for (const note of notes) {
            const preview = note.text.length > 30 ? note.text.substring(0, 30) + "..." : note.text;
            gui.button("§8" + note.title + "\n§7" + preview, "textures/items/book_writable");
        }
        gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === notes.length + 2) { system.run(() => backToMain(player)); return; }
            if (res.selection === 0) { system.run(() => showNewNote(player, backToMain)); return; }
            if (res.selection === 1) {
                if (notes.length === 0) {
                    player.sendMessage("§cNo notes to delete!");
                    system.run(() => showNotesMenu(player, backToMain));
                    return;
                }
                system.run(() => showDeleteNote(player, backToMain));
                return;
            }
            const selected = notes[res.selection - 2];
            system.run(() => showNoteDetail(player, selected, backToMain));
        });
    });
}

function showNewNote(player, backToMain) {
    const form = new ModalFormData();
    form.title("§lNew Note");
    form.textField("§eTitle:", "My Note");
    form.textField("§fContent:\n§7(Write anything you want)", "Note content here...");
    form.show(player).then((res) => {
        if (res.canceled) { system.run(() => showNotesMenu(player, backToMain)); return; }
        const title = res.formValues[0]?.trim();
        const text = res.formValues[1]?.trim();
        if (!title || title === "") {
            player.sendMessage("§cTitle cannot be empty!");
            system.run(() => showNotesMenu(player, backToMain));
            return;
        }
        system.run(() => {
            const notes = loadNotes(player);
            if (notes.length >= MAX_NOTES) {
                player.sendMessage("§cMax " + MAX_NOTES + " notes! Delete one first.");
                showNotesMenu(player, backToMain);
                return;
            }
            const exists = notes.find(n => n.title.toLowerCase() === title.toLowerCase());
            if (exists) {
                player.sendMessage("§cA note with that title already exists!");
                showNotesMenu(player, backToMain);
                return;
            }
            notes.push({ title, text: text || "" });
            saveNotes(player, notes);
            player.sendMessage("§a[Notes] §fNote \"§e" + title + "§f\" saved!");
            showNotesMenu(player, backToMain);
        });
    });
}

function showNoteDetail(player, note, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§l" + note.title);
        gui.body("§f" + note.text + "\n\n§8(Tap Edit to change this note)");
        gui.button("§8edit", "textures/items/book_writable");
        gui.button("§8« Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) { system.run(() => showNotesMenu(player, backToMain)); return; }
            if (res.selection === 0) system.run(() => showEditNote(player, note, backToMain));
        });
    });
}

function showEditNote(player, note, backToMain) {
    const form = new ModalFormData();
    form.title("§lEdit Note");
    form.textField("§eTitle:", note.title);
    form.textField("§fContent:", note.text);
    form.show(player).then((res) => {
        if (res.canceled) { system.run(() => showNotesMenu(player, backToMain)); return; }
        const newTitle = res.formValues[0]?.trim();
        const newText = res.formValues[1]?.trim();
        if (!newTitle || newTitle === "") {
            player.sendMessage("§cTitle cannot be empty!");
            system.run(() => showNotesMenu(player, backToMain));
            return;
        }
        system.run(() => {
            const notes = loadNotes(player);
            const idx = notes.findIndex(n => n.title === note.title);
            if (idx === -1) {
                player.sendMessage("§cNote not found!");
                showNotesMenu(player, backToMain);
                return;
            }
            notes[idx] = { title: newTitle, text: newText || "" };
            saveNotes(player, notes);
            player.sendMessage("§a[Notes] §fNote updated!");
            showNotesMenu(player, backToMain);
        });
    });
}

function showDeleteNote(player, backToMain) {
    system.run(() => {
        const notes = loadNotes(player);
        const gui = new ActionFormData();
        gui.title("§lDelete Note");
        gui.body("§cSelect a note to delete:");
        for (const note of notes) {
            gui.button("§8" + note.title, "textures/ui/cancel");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === notes.length) { system.run(() => showNotesMenu(player, backToMain)); return; }
            const toDelete = notes[res.selection];
            system.run(() => showDeleteConfirm(player, toDelete, backToMain));
        });
    });
}

function showDeleteConfirm(player, note, backToMain) {
    const gui = new ActionFormData();
    gui.title("§cConfirm Delete");
    gui.body("§fDelete note:\n\n§e\"" + note.title + "\"\n\n§7This cannot be undone!");
    gui.button("§8YES - Delete", "textures/ui/cancel");
    gui.button("§8No - Go Back", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 1) { system.run(() => showNotesMenu(player, backToMain)); return; }
        system.run(() => {
            const notes = loadNotes(player);
            const filtered = notes.filter(n => n.title !== note.title);
            saveNotes(player, filtered);
            player.sendMessage("§c[Notes] §fNote \"§e" + note.title + "§f\" deleted!");
            showNotesMenu(player, backToMain);
        });
    });
}