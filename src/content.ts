function parsePageUrl(raw: string) {
  try {
    const u = new URL(raw);
    const match = u.pathname.match(/^\/video\/(BV[\w]+|av\d+)\/?$/i);
    if (u.hostname !== "www.bilibili.com" || !match) return null;
    const id = match[1];
    const normalized = new URL(`https://www.bilibili.com/video/${id}`);
    const p = u.searchParams.get("p");
    if (p && /^\d+$/.test(p) && Number(p) > 0)
      normalized.searchParams.set("p", String(Number(p)));
    return { id, url: normalized.toString() };
  } catch {
    return null;
  }
}
const findVideo = () => document.querySelector<HTMLVideoElement>("video");
const findWebFullscreenButton = () =>
  document.querySelector<HTMLElement>(
    '.bpx-player-ctrl-web,[aria-label="网页全屏"]',
  );
const isWebFullscreen = () =>
  document.body.classList.contains("webscreen-fix") ||
  findWebFullscreenButton()?.classList.contains("bpx-state-entered") === true;

async function enterWebFullscreen() {
  if (isWebFullscreen()) return { ok: true };
  for (let i = 0; i < 50; i++) {
    const button = findWebFullscreenButton();
    if (button) {
      button.click();
      return isWebFullscreen()
        ? { ok: true }
        : { ok: false, error: "网页全屏未能开启" };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { ok: false, error: "未找到网页全屏按钮" };
}
const boundVideos = new WeakSet<HTMLVideoElement>();
function playerSnapshot(v: HTMLVideoElement) {
  return {
    status: v.ended ? "ended" : v.paused ? "paused" : "playing",
    currentTime: v.currentTime,
    duration: Number.isFinite(v.duration) ? v.duration : 0,
    volume: v.volume,
    muted: v.muted,
    playbackRate: v.playbackRate,
  };
}
function metadata() {
  const parsed = parsePageUrl(location.href);
  const coverUrl = [
    'meta[property="og:image"]',
    'meta[itemprop="image"]',
    'meta[name="twitter:image"]',
  ]
    .map(
      (selector) =>
        document.querySelector<HTMLMetaElement>(selector)?.content,
    )
    .find(Boolean);
  return (
    parsed && {
      ...parsed,
      title:
        document.querySelector("h1")?.textContent?.trim() ||
        document.title.replace(/_哔哩哔哩.*$/, ""),
      uploader:
        document.querySelector<HTMLElement>(".up-name,.username")?.innerText,
      coverUrl: coverUrl
        ? new URL(coverUrl, location.href).href.replace(/^http:/, "https:")
        : undefined,
    }
  );
}

function collectionMetadata() {
  const uploader =
    document.querySelector<HTMLElement>(".up-name,.username")?.innerText;
  const selectors = [
    ".video-sections-content-list",
    ".video-pod__list",
    ".video-pod__body",
    "#multi_page .cur-list",
    ".base-video-sections-v1",
  ];
  const container = selectors
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((element) =>
      element?.querySelector(
        'a[href*="/video/"],a[href*="?p="],.video-pod__item[data-key]',
      ),
    );
  if (!container) return null;

  const tracks = new Map<string, ReturnType<typeof metadata>>();
  for (const anchor of container.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/video/"],a[href*="?p="]',
  )) {
    const parsed = parsePageUrl(anchor.href);
    if (!parsed || tracks.has(parsed.url)) continue;
    const item = anchor.closest<HTMLElement>(
      ".video-section-list-item,.video-pod__item,.list-box li,li",
    );
    const title =
      anchor.getAttribute("title")?.trim() ||
      item
        ?.querySelector<HTMLElement>(".title,.name,.part")
        ?.innerText.trim() ||
      anchor.innerText.trim() ||
      parsed.id;
    tracks.set(parsed.url, { ...parsed, title, uploader, coverUrl: undefined });
  }
  for (const item of container.querySelectorAll<HTMLElement>(
    ".video-pod__item[data-key]",
  )) {
    const key = item.dataset.key?.trim();
    if (!key) continue;
    const parsed = parsePageUrl(`https://www.bilibili.com/video/${key}`);
    if (!parsed || tracks.has(parsed.url)) continue;
    const titleElement = item.querySelector<HTMLElement>(".title");
    const title =
      titleElement?.getAttribute("title")?.trim() ||
      item.querySelector<HTMLElement>(".title-txt")?.innerText.trim() ||
      parsed.id;
    tracks.set(parsed.url, { ...parsed, title, uploader, coverUrl: undefined });
  }
  const current = metadata();
  if (current && !tracks.has(current.url)) tracks.set(current.url, current);
  if (tracks.size < 2) return null;
  const root = container.closest<HTMLElement>(
    ".video-sections,.video-pod,.multi-page",
  );
  const heading =
    root
      ?.querySelector<HTMLElement>(
        ".video-pod__header a,.video-sections-head,.multi-page .head-con .title",
      )
      ?.innerText.trim() || "当前视频合集";
  return { title: heading, tracks: [...tracks.values()] };
}
function report(v: HTMLVideoElement, status?: string) {
  chrome.runtime
    .sendMessage({
      type: "CONTENT_PLAYER_STATE",
      ...playerSnapshot(v),
      metadata: metadata(),
      ...(status ? { status } : {}),
    })
    .catch(() => {});
}
function bind() {
  const v = findVideo();
  if (!v || boundVideos.has(v)) return;
  boundVideos.add(v);
  for (const e of [
    "play",
    "pause",
    "timeupdate",
    "durationchange",
    "volumechange",
    "ratechange",
  ] as const)
    v.addEventListener(e, () => report(v));
  report(v);
  v.addEventListener(
    "ended",
    () => {
      report(v, "ended");
      const id = parsePageUrl(location.href)?.id;
      if (id)
        chrome.runtime.sendMessage({
          type: "VIDEO_ENDED",
          videoId: id,
          eventId: `${id}:${Date.now()}`,
        });
    },
    { once: true },
  );
}
new MutationObserver(bind).observe(document.documentElement, {
  childList: true,
  subtree: true,
});
bind();
chrome.runtime.onMessage.addListener((m: any, _s, reply) => {
  if (m.type === "PING") {
    reply(true);
    return;
  }
  if (m.type === "GET_METADATA") {
    reply(metadata());
    return;
  }
  if (m.type === "GET_COLLECTION_METADATA") {
    reply(collectionMetadata());
    return;
  }
  if (m.type === "GET_PLAYER_SNAPSHOT") {
    const v = findVideo();
    reply(v ? playerSnapshot(v) : null);
    return;
  }
  if (m.type === "GET_WEB_FULLSCREEN") {
    reply({ active: isWebFullscreen() });
    return;
  }
  if (m.type === "ENTER_WEB_FULLSCREEN") {
    enterWebFullscreen().then(reply);
    return true;
  }
  if (m.type === "PLAYER_COMMAND") {
    const v = findVideo();
    if (!v) {
      reply({ ok: false, error: "未找到 HTML5 播放器" });
      return;
    }
    if (m.command === "play")
      v.play()
        .then(() => reply({ ok: true }))
        .catch(() => reply({ ok: false, error: "自动播放被阻止，请手动播放" }));
    else {
      if (m.command === "pause") v.pause();
      if (m.command === "seek")
        v.currentTime = Math.max(0, Math.min(v.duration, m.value));
      if (m.command === "volume") {
        v.volume = m.value;
        v.muted = m.muted;
      }
      if (m.command === "rate")
        v.playbackRate = Math.max(0.1, Math.min(16, Number(m.value) || 1));
      reply({ ok: true });
    }
    return m.command === "play";
  }
});
