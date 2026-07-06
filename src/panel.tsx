import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { defaults, importPlaylists, loadState, saveState } from "./storage";
import { parseBilibiliUrl } from "./url";
import { nextIndex } from "./queue";
import type { AppState, PlayerState, Track } from "./types";
type TrackDraft = Omit<Track, "id" | "createdAt">;
const uid = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
  fmt = (n: number) =>
    `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
function App() {
  const [s, setS] = useState<AppState>(defaults()),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [player, setPlayer] = useState<PlayerState>({
      status: "disconnected",
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      playbackRate: 1,
    });
  const [pendingAdd, setPendingAdd] = useState<{
    label: string;
    tracks: TrackDraft[];
  } | null>(null);
  const [targetPlaylistIds, setTargetPlaylistIds] = useState<string[]>([]);
  const [pageTrack, setPageTrack] = useState<{
    title: string;
    uploader?: string;
    coverUrl?: string;
  } | null>(null);
  const trackListRef = useRef<HTMLOListElement>(null);
  const requestedCovers = useRef(new Set<string>());
  const p =
      s.playlists.find((x) => x.id === s.currentPlaylistId) ?? s.playlists[0],
    track = p.tracks.find((x) => x.id === s.currentTrackId);
  useEffect(() => {
    loadState().then((x) => {
      setS(x);
      setReady(true);
    });
    chrome.runtime
      .sendMessage({ type: "GET_BOUND_SNAPSHOT" })
      .then((response: any) => {
        if (!response?.ok) return;
        if (response.metadata) setPageTrack(response.metadata);
        if (response.player)
          setPlayer((current) => ({ ...current, ...response.player }));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (ready) saveState(s).catch((e) => setNotice(String(e)));
  }, [s, ready]);
  useEffect(() => {
    const f = (m: any) => {
      if (m.type === "PLAYER_STATE") {
        setPlayer((x) => ({ ...x, ...m }));
        if (typeof m.volume === "number" && typeof m.muted === "boolean")
          setS((state) => ({
            ...state,
            settings: {
              ...state.settings,
              volume: m.volume,
              muted: m.muted,
            },
          }));
      }
      if (m.type === "TRACK_CHANGED") {
        setPageTrack(null);
        setS((state) => ({ ...state, currentTrackId: m.trackId }));
      }
    };
    chrome.runtime.onMessage.addListener(f);
    return () => chrome.runtime.onMessage.removeListener(f);
  }, []);
  useEffect(() => {
    if (!s.currentTrackId) return;
    trackListRef.current
      ?.querySelector<HTMLElement>(`[data-track-id="${s.currentTrackId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [s.currentTrackId, search, p.id]);
  useEffect(() => {
    if (!ready) return;
    const missing = p.tracks
      .filter(
        (item) =>
          !item.coverUrl && !requestedCovers.current.has(item.bvidOrAid),
      )
      .map((item) => item.bvidOrAid);
    if (!missing.length) return;
    missing.forEach((id) => requestedCovers.current.add(id));
    chrome.runtime
      .sendMessage({ type: "FETCH_TRACK_COVERS", videoIds: missing })
      .then((response: any) => {
        if (!response?.ok) return;
        setS((state) => ({
          ...state,
          playlists: state.playlists.map((playlist) =>
            playlist.id !== p.id
              ? playlist
              : {
                  ...playlist,
                  tracks: playlist.tracks.map((item) => ({
                    ...item,
                    coverUrl:
                      item.coverUrl ||
                      response.covers?.[item.bvidOrAid.toLowerCase()],
                  })),
                },
          ),
        }));
      });
  }, [ready, p.id, p.tracks]);
  const update = (fn: (x: AppState) => void) =>
    setS((old) => {
      const x = structuredClone(old);
      fn(x);
      return x;
    });
  const prepareAdd = (items: any[], label: string) => {
    const drafts: TrackDraft[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      const parsed = parseBilibiliUrl(item?.url || "");
      if (!parsed || seen.has(parsed.url)) continue;
      seen.add(parsed.url);
      drafts.push({
        bvidOrAid: parsed.id,
        url: parsed.url,
        title: item.title || parsed.id,
        uploader: item.uploader,
        coverUrl: item.coverUrl,
      });
    }
    if (!drafts.length) return setNotice("没有可添加的有效视频");
    setPendingAdd({ label, tracks: drafts });
    setTargetPlaylistIds([p.id]);
  };
  const add = (u: string, title?: string, meta?: any) => {
    const parsed = parseBilibiliUrl(u);
    if (!parsed)
      return setNotice("请输入标准 Bilibili /video/BV… 或 /video/av… 链接");
    prepareAdd(
      [{ ...meta, url: parsed.url, title: title || parsed.id }],
      title || parsed.id,
    );
  };
  const commitPendingAdd = () => {
    if (!pendingAdd || !targetPlaylistIds.length) return;
    let added = 0;
    let skipped = 0;
    for (const playlist of s.playlists) {
      if (!targetPlaylistIds.includes(playlist.id)) continue;
      const existing = new Set(playlist.tracks.map((track) => track.url));
      for (const draft of pendingAdd.tracks) {
        if (existing.has(draft.url)) skipped++;
        else {
          existing.add(draft.url);
          added++;
        }
      }
    }
    update((state) => {
      for (const playlist of state.playlists) {
        if (!targetPlaylistIds.includes(playlist.id)) continue;
        const existing = new Set(playlist.tracks.map((track) => track.url));
        for (const draft of pendingAdd.tracks) {
          if (existing.has(draft.url)) {
            continue;
          }
          existing.add(draft.url);
          playlist.tracks.push({ ...draft, id: uid(), createdAt: now() });
        }
        playlist.updatedAt = now();
      }
    });
    setPendingAdd(null);
    setNotice(
      `已添加 ${added} 项${skipped ? `，跳过 ${skipped} 个重复项` : ""}`,
    );
  };
  const play = (t: Track) => {
    setPageTrack(null);
    update((x) => (x.currentTrackId = t.id));
    chrome.runtime
      .sendMessage({ type: "PLAY_TRACK", track: t, requestId: uid() })
      .then((r: any) => {
        if (!r?.ok) setNotice(r?.error || "播放失败");
      });
  };
  const skip = (d: 1 | -1) => {
    const i = p.tracks.findIndex((t) => t.id === s.currentTrackId),
      n = nextIndex(p.tracks, i < 0 ? 0 : i, s.settings.playMode, d);
    if (n != null) play(p.tracks[n]);
  };
  const cmd = (command: string, value?: number, muted?: boolean) =>
    chrome.runtime
      .sendMessage({ type: "CONTROL_PLAYER", command, value, muted })
      .then((r: any) => {
        if (!r?.ok) setNotice(r?.error || "页面未连接");
      });
  const filtered = useMemo(
    () =>
      p.tracks.filter((t) =>
        (t.title + " " + (t.uploader || ""))
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [p, search],
  );
  if (!ready) return <main>正在恢复本地歌单…</main>;
  const displayedTrack = pageTrack ?? track;
  return (
    <main>
      <header>
        <h1>BiliSide Player</h1>
        <span className={`status ${player.status}`}>{player.status}</span>
      </header>
      <section className="now">
        {displayedTrack?.coverUrl ? (
          <img src={displayedTrack.coverUrl} referrerPolicy="no-referrer" />
        ) : (
          <div className="cover">♪</div>
        )}
        <div>
          <strong>{displayedTrack?.title || "尚未选择曲目"}</strong>
          <small>{displayedTrack?.uploader || "从下方添加视频"}</small>
        </div>
      </section>
      <section className="controls">
        <div className="transport">
          <button aria-label="上一首" onClick={() => skip(-1)}>
            ⏮
          </button>
          <button
            aria-label={player.status === "playing" ? "暂停" : "播放"}
            onClick={() => cmd(player.status === "playing" ? "pause" : "play")}
          >
            {player.status === "playing" ? "⏸" : "▶"}
          </button>
          <button aria-label="下一首" onClick={() => skip(1)}>
            ⏭
          </button>
        </div>
        <label className="progress-control">
          <input
            type="range"
            min="0"
            max={player.duration || 0}
            value={Math.min(player.currentTime, player.duration || 0)}
            onChange={(e) => cmd("seek", +e.target.value)}
          />
          <span>
            {fmt(player.currentTime)}/{fmt(player.duration)}
          </span>
        </label>
        <details className="foldout">
          <summary>
            播放设置
            <span>{player.playbackRate.toFixed(1)}×</span>
          </summary>
          <div className="settings-grid">
            <label className="volume-control">
              <span>音量</span>
              <input
                type="range"
                min="0"
                max="1"
                step=".01"
                value={s.settings.volume}
                onChange={(e) => {
                  const v = +e.target.value;
                  update((x) => (x.settings.volume = v));
                  cmd("volume", v, s.settings.muted);
                }}
              />
              <button
                aria-label="静音"
                onClick={() => {
                  update((x) => (x.settings.muted = !x.settings.muted));
                  cmd("volume", s.settings.volume, !s.settings.muted);
                }}
              >
                {s.settings.muted ? "🔇" : "🔊"}
              </button>
            </label>
            <div className="speed-control" aria-label="播放速度">
              <span>倍速</span>
              <button
                aria-label="降低播放速度"
                disabled={player.playbackRate <= 0.1}
                onClick={() =>
                  cmd(
                    "rate",
                    Math.max(0.1, +(player.playbackRate - 0.1).toFixed(1)),
                  )
                }
              >
                −
              </button>
              <output>{player.playbackRate.toFixed(1)}×</output>
              <button
                aria-label="提高播放速度"
                disabled={player.playbackRate >= 16}
                onClick={() =>
                  cmd(
                    "rate",
                    Math.min(16, +(player.playbackRate + 0.1).toFixed(1)),
                  )
                }
              >
                +
              </button>
            </div>
            <div className="play-options">
              <select
                aria-label="播放模式"
                value={s.settings.playMode}
                onChange={(e) =>
                  update((x) => (x.settings.playMode = e.target.value as any))
                }
              >
                <option value="sequential">顺序播放</option>
                <option value="loop-list">列表循环</option>
                <option value="loop-one">单曲循环</option>
                <option value="shuffle">随机播放</option>
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={s.settings.autoplay}
                  onChange={(e) =>
                    update((x) => (x.settings.autoplay = e.target.checked))
                  }
                />
                连续播放
              </label>
            </div>
          </div>
        </details>
      </section>
      <section className="playlist-section">
        <div className="playlist-heading">
          <span>歌单</span>
          <select
            aria-label="当前歌单"
            value={p.id}
            onChange={(e) =>
              update((x) => (x.currentPlaylistId = e.target.value))
            }
          >
            {s.playlists.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <details className="foldout playlist-tools">
          <summary>
            歌单工具
            <span>{p.tracks.length} 首</span>
          </summary>
          <div className="tool-group">
            <button
              onClick={() => {
                const n = prompt("新歌单名称");
                if (n)
                  update((x) =>
                    x.playlists.push({
                      id: uid(),
                      name: n,
                      tracks: [],
                      createdAt: now(),
                      updatedAt: now(),
                    }),
                  );
              }}
            >
              新建
            </button>
            <button
              onClick={() => {
                const n = prompt("重命名", p.name);
                if (n)
                  update(
                    (x) => (x.playlists.find((y) => y.id === p.id)!.name = n),
                  );
              }}
            >
              改名
            </button>
            <button
              disabled={s.playlists.length === 1}
              onClick={() =>
                confirm(`删除“${p.name}”？`) &&
                update((x) => {
                  x.playlists = x.playlists.filter((y) => y.id !== p.id);
                  x.currentPlaylistId = x.playlists[0].id;
                })
              }
            >
              删除
            </button>
          </div>
          <div className="tool-group">
            <button
              onClick={async () => {
                try {
                  const response = await chrome.runtime.sendMessage({
                    type: "GET_BOUND_METADATA",
                  });
                  const m = response?.data;
                  m
                    ? add(m.url, m.title, m)
                    : setNotice("当前页不是支持的视频页");
                } catch {
                  setNotice("请先打开 Bilibili 视频页");
                }
              }}
            >
              添加当前视频
            </button>
            <button
              onClick={async () => {
                try {
                  const response = await chrome.runtime.sendMessage({
                    type: "GET_BOUND_METADATA",
                    collection: true,
                  });
                  const collection = response?.data;
                  if (!collection?.tracks?.length)
                    return setNotice("当前页面未检测到视频合集或多 P 列表");
                  prepareAdd(collection.tracks, collection.title);
                } catch {
                  setNotice("请先打开包含合集的 Bilibili 视频页");
                }
              }}
            >
              添加当前合集
            </button>
            <button
              onClick={() => {
                const u = prompt("粘贴 Bilibili 视频 URL");
                if (u) add(u);
              }}
            >
              粘贴 URL
            </button>
          </div>
          <div className="tool-group">
            <button
              onClick={() => {
                const b = new Blob([JSON.stringify(s.playlists, null, 2)], {
                    type: "application/json",
                  }),
                  a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "bili-side-player-playlists.json";
                a.click();
                URL.revokeObjectURL(a.href);
              }}
            >
              导出歌单
            </button>
            <label className="button">
              导入歌单
              <input
                hidden
                type="file"
                accept="application/json"
                onChange={async (e) => {
                  try {
                    const f = e.target.files?.[0];
                    if (f) {
                      const imported = importPlaylists(await f.text());
                      update((x) => x.playlists.push(...imported));
                    }
                  } catch (err) {
                    setNotice(String(err));
                  }
                }}
              />
            </label>
          </div>
        </details>
        <input
          className="search"
          placeholder="按标题或 UP 主搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!p.tracks.length ? (
          <p className="empty">歌单还是空的。添加当前视频或粘贴链接吧。</p>
        ) : !filtered.length ? (
          <p className="empty">没有匹配的曲目</p>
        ) : (
          <ol className="track-list" ref={trackListRef}>
            {filtered.map((t) => (
              <li
                key={t.id}
                data-track-id={t.id}
                className={t.id === s.currentTrackId ? "active" : ""}
              >
                <button className="title" onClick={() => play(t)}>
                  {t.coverUrl ? (
                    <img
                      className="track-cover"
                      src={t.coverUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span
                      className="track-cover placeholder"
                      aria-hidden="true"
                    >
                      ♪
                    </span>
                  )}
                  <span className="track-copy">
                    <b>{t.title}</b>
                    <small>{t.uploader || t.bvidOrAid}</small>
                  </span>
                </button>
                <button
                  aria-label="上移"
                  onClick={() =>
                    update((x) => {
                      const a = x.playlists.find((y) => y.id === p.id)!.tracks,
                        i = a.findIndex((y) => y.id === t.id);
                      if (i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]];
                    })
                  }
                >
                  ↑
                </button>
                <button
                  aria-label="下移"
                  onClick={() =>
                    update((x) => {
                      const a = x.playlists.find((y) => y.id === p.id)!.tracks,
                        i = a.findIndex((y) => y.id === t.id);
                      if (i < a.length - 1) [a[i], a[i + 1]] = [a[i + 1], a[i]];
                    })
                  }
                >
                  ↓
                </button>
                <button
                  aria-label="编辑标题"
                  onClick={() => {
                    const n = prompt("显示标题", t.title);
                    if (n)
                      update(
                        (x) =>
                          (x.playlists
                            .flatMap((y) => y.tracks)
                            .find((y) => y.id === t.id)!.title = n),
                      );
                  }}
                >
                  ✎
                </button>
                <button
                  aria-label="删除曲目"
                  onClick={() =>
                    confirm("删除这首曲目？") &&
                    update((x) => {
                      const q = x.playlists.find((y) => y.id === p.id)!;
                      q.tracks = q.tracks.filter((y) => y.id !== t.id);
                    })
                  }
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {pendingAdd && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="add-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-modal-title"
          >
            <h2 id="add-modal-title">选择目标歌单</h2>
            <p>
              “{pendingAdd.label}”包含 {pendingAdd.tracks.length} 个视频
            </p>
            <div className="playlist-options">
              {s.playlists.map((playlist) => (
                <label key={playlist.id}>
                  <input
                    type="checkbox"
                    checked={targetPlaylistIds.includes(playlist.id)}
                    onChange={(event) =>
                      setTargetPlaylistIds((ids) =>
                        event.target.checked
                          ? [...ids, playlist.id]
                          : ids.filter((id) => id !== playlist.id),
                      )
                    }
                  />
                  <span>{playlist.name}</span>
                  <small>{playlist.tracks.length} 首</small>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setPendingAdd(null)}>取消</button>
              <button
                disabled={!targetPlaylistIds.length}
                onClick={commitPendingAdd}
              >
                添加到 {targetPlaylistIds.length} 个歌单
              </button>
            </div>
          </section>
        </div>
      )}
      {notice && (
        <div className="notice" role="status" onClick={() => setNotice("")}>
          {notice}
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
