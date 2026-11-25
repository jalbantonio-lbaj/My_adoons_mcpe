export function getProp(entity, key) {
    try {
        const raw = entity.getDynamicProperty(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}
export function setProp(entity, key, value) {
    try {
        entity.setDynamicProperty(key, JSON.stringify(value));
    } catch (e) {}
}

export function parseCoords(text, origin) {
    if (typeof text !== "string" || !origin) return null;

    let parts = text.trim().split(/[\s,]+/).filter(t => t.length > 0);
    if (parts.length === 2) parts = [parts[0], "~", parts[1]];
    if (parts.length !== 3) return null;

    const base = [origin.x, origin.y, origin.z];
    const out = [];

    for (let i = 0; i < 3; i++) {
        const token = parts[i];
        if (token === "~") {
            out.push(base[i]);
            continue;
        }
        if (token.charAt(0) === "~") {
            const offset = Number(token.slice(1));
            if (!isFinite(offset)) return null;
            out.push(base[i] + offset);
            continue;
        }
        const value = Number(token);
        if (!isFinite(value)) return null;
        out.push(value);
    }

    return { x: out[0], y: out[1], z: out[2] };
}