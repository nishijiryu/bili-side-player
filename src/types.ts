export type PlayMode = "sequential" | "loop-list" | "loop-one" | "shuffle";
export type Track = {
  id: string;
  bvidOrAid: string;
  url: string;
  title: string;
  uploader?: string;
  coverUrl?: string;
  createdAt: string;
};
export type Playlist = {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
};
export type Settings = {
  playMode: PlayMode;
  autoplay: boolean;
  volume: number;
  muted: boolean;
};
export type AppState = {
  schemaVersion: 1;
  playlists: Playlist[];
  currentPlaylistId: string;
  currentTrackId?: string;
  settings: Settings;
};
export type PlayerState = {
  status:
    "loading" | "playing" | "paused" | "ended" | "disconnected" | "failed";
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  message?: string;
};
export type Command =
  | {
      type: "PLAYER_COMMAND";
      command: "play" | "pause" | "seek" | "volume";
      value?: number;
      muted?: boolean;
    }
  | { type: "GET_METADATA" }
  | { type: "GET_COLLECTION_METADATA" }
  | { type: "GET_PLAYER_SNAPSHOT" }
  | { type: "CONTENT_PLAYER_STATE" }
  | { type: "PLAYER_STATE" }
  | { type: "TRACK_CHANGED"; trackId: string }
  | { type: "FETCH_TRACK_COVERS"; videoIds: string[] }
  | { type: "PLAY_TRACK"; track: Track; requestId: string }
  | {
      type: "CONTROL_PLAYER";
      command: "play" | "pause" | "seek" | "volume";
      value?: number;
      muted?: boolean;
    }
  | { type: "GET_BOUND_METADATA"; collection?: boolean }
  | { type: "GET_BOUND_SNAPSHOT" }
  | { type: "VIDEO_ENDED"; videoId: string; eventId: string };
