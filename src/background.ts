import { loadState, saveState } from "./storage";
import { nextIndex } from "./queue";
import { isSameVideoEntry } from "./url";
import type { Command } from "./types";
import { getBoundTabId, setBoundTabId } from "./binding";

chrome.runtime.onInstalled.addListener(() =>
  chrome.sidePanel.setOptions({ enabled: false }),
);

// Clicking the extension action explicitly binds the panel to that tab. The
// per-tab side panel disappears on other tabs and reappears when returning.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const previous = await getBoundTabId();
  if (previous !== undefined && previous !== tab.id)
    await chrome.sidePanel.setOptions({ tabId: previous, enabled: false });
  await setBoundTabId(tab.id);
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "index.html",
    enabled: true,
  });
  await chrome.sidePanel.open({ tabId: tab.id });
});
let latestRequest: string = "";
const ended = new Set<string>();
async function play(track: any, requestId: string = crypto.randomUUID()) {
  latestRequest = requestId;
  const state = await loadState();
  const tabId = await getBoundTabId();
  if (tabId === undefined) throw new Error("请先点击扩展图标绑定当前标签页");
  let restoreWebFullscreen = false;
  try {
    const current = await chrome.tabs.get(tabId);
    if (!isSameVideoEntry(current.url, track.url)) {
      try {
        const displayMode = await chrome.tabs.sendMessage(tabId, {
          type: "GET_WEB_FULLSCREEN",
        });
        restoreWebFullscreen = displayMode?.active === true;
      } catch {
        // The previous page may not have a connected content script.
      }
      await chrome.tabs.update(tabId, { url: track.url });
    }
  } catch {
    await setBoundTabId();
    throw new Error("绑定的标签页已关闭，请重新点击扩展图标绑定");
  }
  state.currentTrackId = track.id;
  await saveState(state);
  chrome.runtime
    .sendMessage({ type: "TRACK_CHANGED", trackId: track.id })
    .catch(() => {});
  await waitReady(tabId, track.url, requestId);
  if (requestId !== latestRequest) return;
  try {
    if (restoreWebFullscreen) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "ENTER_WEB_FULLSCREEN",
        });
      } catch {
        // Display-mode restoration should not prevent the next video playing.
      }
    }
    const result = await chrome.tabs.sendMessage(tabId, {
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
chrome.runtime.onMessage.addListener((m: Command, sender, reply) => {
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
  if (m.type === "CONTROL_PLAYER") {
    getBoundTabId()
      .then((tabId) => {
        if (tabId === undefined) throw new Error("尚未绑定标签页");
        return chrome.tabs.sendMessage(tabId, {
          type: "PLAYER_COMMAND",
          command: m.command,
          value: m.value,
          muted: m.muted,
        });
      })
      .then(reply)
      .catch((error) => reply({ ok: false, error: String(error) }));
    return true;
  }
  if (m.type === "GET_BOUND_METADATA") {
    getBoundTabId()
      .then((tabId) => {
        if (tabId === undefined) throw new Error("尚未绑定标签页");
        return chrome.tabs.sendMessage(tabId, {
          type: m.collection ? "GET_COLLECTION_METADATA" : "GET_METADATA",
        });
      })
      .then((data) => reply({ ok: true, data }))
      .catch((error) => reply({ ok: false, error: String(error) }));
    return true;
  }
  if (m.type === "GET_BOUND_SNAPSHOT") {
    getBoundTabId()
      .then(async (tabId) => {
        if (tabId === undefined) throw new Error("尚未绑定标签页");
        const [rawMetadata, player] = await Promise.all([
          chrome.tabs.sendMessage(tabId, { type: "GET_METADATA" }),
          chrome.tabs.sendMessage(tabId, { type: "GET_PLAYER_SNAPSHOT" }),
        ]);
        let metadata = rawMetadata;
        if (metadata && !metadata.coverUrl && metadata.id) {
          const covers = await fetchTrackCovers([metadata.id]);
          metadata = {
            ...metadata,
            coverUrl: covers[String(metadata.id).toLowerCase()],
          };
        }
        return { metadata, player };
      })
      .then((data) => reply({ ok: true, ...data }))
      .catch((error) => reply({ ok: false, error: String(error) }));
    return true;
  }
  if (m.type === "VIDEO_ENDED") {
    getBoundTabId().then((tabId) => {
      if (tabId !== undefined && sender.tab?.id === tabId)
        advance(m.videoId, m.eventId);
    });
  }
  if (m.type === "CONTENT_PLAYER_STATE") {
    getBoundTabId().then((tabId) => {
      if (tabId !== undefined && sender.tab?.id === tabId)
        chrome.runtime
          .sendMessage({ ...m, type: "PLAYER_STATE" })
          .catch(() => {});
    });
  }
});
chrome.tabs.onRemoved.addListener(async (id) => {
  if ((await getBoundTabId()) === id) {
    await setBoundTabId();
    chrome.runtime
      .sendMessage({ type: "PLAYER_STATE", status: "disconnected" })
      .catch(() => {});
  }
});
