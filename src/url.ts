const HOSTS = new Set(["www.bilibili.com", "bilibili.com"]);
export function parseBilibiliUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !HOSTS.has(u.hostname)) return null;
    const m = u.pathname.match(/^\/video\/(BV[\w]+|av\d+)\/?$/i);
    if (!m) return null;
    const id = m[1];
    const out = new URL(`https://www.bilibili.com/video/${id}`);
    const p = u.searchParams.get("p");
    if (p && /^\d+$/.test(p) && Number(p) > 0)
      out.searchParams.set("p", String(Number(p)));
    return { id, url: out.toString() };
  } catch {
    return null;
  }
}

export function isSameVideoEntry(actual: string | undefined, target: string) {
  if (!actual) return false;
  const a = parseBilibiliUrl(actual),
    b = parseBilibiliUrl(target);
  return !!a && !!b && a.url === b.url;
}
