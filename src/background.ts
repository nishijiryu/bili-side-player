import { loadState, saveState } from "./storage";
import { nextIndex } from "./queue";
import { isSameVideoEntry } from "./url";
import type { Command } from "./types";
chrome.runtime.onInstalled.addListener(() =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }),
);
// The panel opens a long-lived "panel" port while it is visible; it disconnects
// when the side panel is closed. Only run tab-controlling behavior while open.
let panelPorts = 0;
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "panel") return;
  panelPorts++;
  port.onDisconnect.addListener(() => {
    panelPorts = Math.max(0, panelPorts - 1);
  });
});
const panelOpen = () => panelPorts > 0;
let latestRequest: string = "";
const ended = new Set<string>();
async function play(track: any, requestId: string = crypto.randomUUID()) {
  latestRequest = requestId;
  const state = await loadState();
  let tabId = state.managedTabId;
  const tabs = await chrome.tabs.query({});
  let created = false;
  if (!tabId || !tabs.some((t) => t.id === tabId)) {
    const active = (
      await chrome.tabs.query({ active: true, currentWindow: true })
    )[0];
    if (active?.id && active.url?.startsWith("https://www.bilibili.com/video/"))
      tabId = active.id;
    else {
      tabId = (await chrome.tabs.create({ url: track.url, active: true })).id;
      created = true;
    }
  }
  if (!created) {
    const current = await chrome.tabs.get(tabId!);
    if (isSameVideoEntry(current.url, track.url))
      await chrome.tabs.update(tabId!, { active: true });
    else await chrome.tabs.update(tabId!, { url: track.url, active: true });
  }
  state.managedTabId = tabId;
  state.currentTrackId = track.id;
  await saveState(state);
  chrome.runtime
    .sendMessage({ type: "TRACK_CHANGED", trackId: track.id })
    .catch(() => {});
  await waitReady(tabId!, track.url, requestId);
  if (requestId !== latestRequest) return;
  try {
    const result = await chrome.tabs.sendMessage(tabId!, {
      type: "PLAYER_COMMAND",
      command: "play",
    });
    if (!result?.ok) throw new Error(result?.error || "播放失败");
  } catch (error) {
    chrome.runtime
      .sendMessage({
        type: "PLAYER_STATE",
        status: "failed",
        message: "请在视频页手动播放",
      })
      .catch(() => {});
    throw error;
  }
}
async function waitReady(tabId: number, targetUrl: string, requestId: string) {
  for (let i = 0; i < 80; i++) {
    if (requestId !== latestRequest) return;
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status !== "complete" || !isSameVideoEntry(tab.url, targetUrl))
        throw new Error("目标页面仍在加载");
      await chrome.tabs.sendMessage(tabId, { type: "PING" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("页面播放器连接超时");
}
async function advance(videoId: string, eventId: string) {
  if (!panelOpen()) return;
  if (ended.has(eventId)) return;
  ended.add(eventId);
  if (ended.size > 100) ended.clear();
  const s = await loadState();
  if (!s.settings.autoplay) return;
  const p = s.playlists.find((x) => x.id === s.currentPlaylistId),
    i = p?.tracks.findIndex((x) => x.id === s.currentTrackId) ?? -1;
  if (
    !p ||
    i < 0 ||
    p.tracks[i].bvidOrAid.toLowerCase() !== videoId.toLowerCase()
  )
    return;
  const n = nextIndex(p.tracks, i, s.settings.playMode);
  if (n != null) await play(p.tracks[n]);
}
async function fetchTrackCovers(videoIds: string[]) {
  const ids = [
    ...new Set(
      videoIds.filter((id) => /^(BV[\w]+|av\d+)$/i.test(id)).slice(0, 200),
    ),
  ];
  const covers: Record<string, string> = {};
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const parameter = id.toLowerCase().startsWith("av")
          ? `aid=${id.slice(2)}`
          : `bvid=${encodeURIComponent(id)}`;
        const response = await fetch(
          `https://api.bilibili.com/x/web-interface/view?${parameter}`,
        );
        const body = await response.json();
        if (body?.code === 0 && typeof body.data?.pic === "string")
          covers[id.toLowerCase()] = body.data.pic.replace(/^http:/, "https:");
      } catch {
        // Missing and restricted videos keep the local placeholder.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
  return covers;
}
chrome.runtime.onMessage.addListener((m: Command, _sender, reply) => {
  if (m.type === "FETCH_TRACK_COVERS") {
    fetchTrackCovers(m.videoIds)
      .then((covers) => reply({ ok: true, covers }))
      .catch((error) => reply({ ok: false, error: String(error) }));
    return true;
  }
  if (m.type === "PLAY_TRACK") {
    play(m.track, m.requestId)
      .then(() => reply({ ok: true }))
      .catch((e) => reply({ ok: false, error: String(e) }));
    return true;
  }
  if (m.type === "VIDEO_ENDED") {
    advance(m.videoId, m.eventId);
  }
});
chrome.tabs.onRemoved.addListener(async (id) => {
  const s = await loadState();
  if (s.managedTabId === id) {
    delete s.managedTabId;
    await saveState(s);
    chrome.runtime
      .sendMessage({ type: "PLAYER_STATE", status: "disconnected" })
      .catch(() => {});
  }
});
