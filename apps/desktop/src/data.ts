/* Real game/profile metadata and UI state table. Browser-lab samples live in
   `fixtures.ts` and are loaded only in mock mode. */
export const GAMES = {
  "arknights": {
    "id": "arknights",
    "name": "Arknights",
    "title": "ARKNIGHTS",
    "region": "EN",
    "tag": "Arknights_EN",
    "exe": "Arknights.exe"
  },
  "stella": {
    "id": "stella",
    "name": "Stella Sora",
    "title": "STELLA SORA",
    "region": "EN",
    "tag": "StellaSora_EN",
    "exe": "StellaSora.exe"
  }
} as const;

export type GameId = keyof typeof GAMES;

export type Region = "EN" | "JP" | "KR";

/* One install profile per server. The EN profile keeps the short game id so
   existing settings and playtime files stay valid. */
export interface ServerInfo {
  id: string;
  gameId: GameId;
  region: Region;
  installDir: string;
}

export const SERVERS = {
  arknights: [
    {
      id: "arknights",
      gameId: "arknights",
      region: "EN",
      installDir: "Arknights_EN",
    },
    {
      id: "arknights-jp",
      gameId: "arknights",
      region: "JP",
      installDir: "Arknights_JP",
    },
    {
      id: "arknights-kr",
      gameId: "arknights",
      region: "KR",
      installDir: "Arknights_KR",
    },
  ],
  stella: [
    {
      id: "stella",
      gameId: "stella",
      region: "EN",
      installDir: "StellaSora_EN",
    },
    {
      id: "stella-jp",
      gameId: "stella",
      region: "JP",
      installDir: "StellaSora_JP",
    },
    {
      id: "stella-kr",
      gameId: "stella",
      region: "KR",
      installDir: "StellaSora_KR",
    },
  ],
} as const satisfies Record<GameId, readonly ServerInfo[]>;

export const SERVER_LIST: readonly ServerInfo[] = [
  ...SERVERS.arknights,
  ...SERVERS.stella,
];

const SERVER_BY_ID: Record<string, ServerInfo> = Object.fromEntries(
  SERVER_LIST.map((server) => [server.id, server])
);

export function serverOf(id: string): ServerInfo | undefined {
  return SERVER_BY_ID[id];
}

export function gameOfServer(id: string): GameId {
  return SERVER_BY_ID[id]?.gameId ?? "arknights";
}

export function defaultServerId(gameId: GameId): string {
  return SERVERS[gameId][0].id;
}

export function isServerId(id: string): boolean {
  return id in SERVER_BY_ID;
}

export const STATE_META = {
  "ready": {
    "tone": "ready",
    "status": "home.status.ready",
    "primary": "home.action.play",
    "primaryIcon": "play",
    "secondary": "home.action.verify",
    "secondaryIcon": "shield",
    "note": "home.note.ready",
    "versionMode": "current",
    "sizeMode": "installed",
    "progress": 0
  },
  "update": {
    "tone": "update",
    "status": "home.status.update",
    "primary": "home.action.update",
    "primaryIcon": "download",
    "secondary": "home.action.playAnyway",
    "secondaryIcon": "play",
    "note": "home.note.update",
    "versionMode": "update",
    "sizeMode": "update",
    "progress": 0
  },
  "install": {
    "tone": "neutral",
    "status": "home.status.install",
    "primary": "home.action.install",
    "primaryIcon": "download",
    "secondary": "home.action.chooseFolder",
    "secondaryIcon": "folder",
    "note": "home.note.install",
    "versionMode": "latest",
    "sizeMode": "required",
    "progress": 0
  },
  "downloading": {
    "tone": "info",
    "status": "home.status.downloading",
    "primary": "home.action.pauseProgress",
    "primaryIcon": "pause",
    "note": "home.note.downloading",
    "versionMode": "update",
    "sizeMode": "progress",
    "progress": 42
  },
  "paused": {
    "tone": "warning",
    "status": "home.status.paused",
    "primary": "home.action.resume",
    "primaryIcon": "play",
    "secondary": "home.action.cancel",
    "secondaryIcon": "x",
    "note": "home.note.paused",
    "versionMode": "update",
    "sizeMode": "progress",
    "progress": 42
  },
  "verifying": {
    "tone": "info",
    "status": "home.status.verifying",
    "primary": "home.action.verifying",
    "primaryIcon": "spinner",
    "secondary": "home.action.details",
    "secondaryIcon": "list",
    "note": "home.note.verifying",
    "versionMode": "update",
    "sizeMode": "verifying",
    "progress": 86,
    "disabled": true
  },
  "running": {
    "tone": "ready",
    "status": "home.status.running",
    "primary": "home.action.running",
    "primaryIcon": "gamepad",
    "secondary": "home.action.minimize",
    "secondaryIcon": "minimize",
    "note": "home.note.running",
    "versionMode": "current",
    "sizeMode": "playing",
    "progress": 0,
    "disabled": true
  },
  "error": {
    "tone": "error",
    "status": "home.status.error",
    "primary": "home.action.repair",
    "primaryIcon": "wrench",
    "secondary": "home.action.errorDetails",
    "secondaryIcon": "alert",
    "note": "home.note.error",
    "versionMode": "current",
    "sizeMode": "installed",
    "progress": 0
  },
  "offline": {
    "tone": "warning",
    "status": "home.status.offline",
    "primary": "home.action.play",
    "primaryIcon": "play",
    "secondary": "home.action.retry",
    "secondaryIcon": "refresh",
    "note": "home.note.offline",
    "versionMode": "current",
    "sizeMode": "installed",
    "progress": 0
  },
  "complete": {
    "tone": "ready",
    "status": "download.status.complete",
    "primary": "home.action.play",
    "primaryIcon": "play",
    "secondary": "home.action.details",
    "secondaryIcon": "list",
    "note": "home.note.ready",
    "versionMode": "current",
    "sizeMode": "installed",
    "progress": 100
  }
} as const;
export type GameState = keyof typeof STATE_META;
