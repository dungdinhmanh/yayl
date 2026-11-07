import { createHash } from "node:crypto";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/*
 * Dev-only news bridge.
 *
 * The browser lab has no Rust side, so it cannot call the signed launcher API.
 * This middleware performs the same GET + Authorization envelope as
 * `yayl_core::api` and normalizes the response exactly like
 * `OperationsResource::feed`. It is registered with `apply: "serve"`, so it
 * never exists in a production build.
 */
const API_BASE = "https://api-launcher-en.yo-star.com";
/* Keep in sync with EN_AUTH_SALT in crates/yayl-core/src/profile.rs. */
const AUTH_SALT = "DE7108E9B2842FD460F4777702727869";
const LAUNCHER_VERSION = "0.1.0";
const CACHE_MS = 60_000;

const GAME_TAGS: Record<string, string> = {
  arknights: "Arknights_EN",
  stella: "StellaSora_EN",
};

type JsonObject = Record<string, unknown>;

interface NewsFeed {
  banners: { image: string; url: string; remark: string }[];
  sections: {
    label: string;
    items: { title: string; url: string; date: string; image: string }[];
  }[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => typeof item === "object" && item !== null)
    : [];
}

function formatTimestampMs(value: number): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function authHeader(gameTag: string): string {
  const head = {
    game_tag: gameTag,
    time: Math.floor(Date.now() / 1000),
    version: LAUNCHER_VERSION,
  };
  const sign = createHash("md5")
    .update(JSON.stringify(head))
    .update("")
    .update(AUTH_SALT)
    .digest("hex");
  return JSON.stringify({ head, sign });
}

/* Mirrors `OperationsResource::feed`: Arknights uses news_list rows, Stella
   Sora uses notice_list entries. */
function normalizeFeed(payload: JsonObject): NewsFeed {
  const data =
    typeof payload.data === "object" && payload.data !== null
      ? (payload.data as JsonObject)
      : {};

  const banners = objects(data.operations_banner_list)
    .filter((item) => text(item.banner_img))
    .map((item) => ({
      image: text(item.banner_img),
      url: text(item.jump_url),
      remark: text(item.remark),
    }));

  const sections: NewsFeed["sections"] = [];
  const newsList =
    typeof data.news_list === "object" && data.news_list !== null
      ? (data.news_list as JsonObject)
      : {};
  const newsData =
    typeof newsList.data === "object" && newsList.data !== null
      ? (newsList.data as JsonObject)
      : {};

  for (const section of objects(newsData.news)) {
    const rows = objects(section.rows);
    if (rows.length === 0) continue;
    sections.push({
      label: text(section.typeLabel),
      items: rows.map((row) => ({
        title: text(row.title),
        url: text(row.link),
        date: formatTimestampMs(number(row.publishTime)),
        image: text(row.thumbnail),
      })),
    });
  }

  if (sections.length === 0) {
    for (const section of objects(data.notice_list)) {
      const rows = objects(section.notice_detail_list);
      if (rows.length === 0) continue;
      sections.push({
        label: text(section.notice_type),
        items: rows.map((row) => ({
          title: text(row.notice_title),
          url: text(row.jump_url),
          date: text(row.notice_time),
          image: "",
        })),
      });
    }
  }

  return { banners, sections };
}

function devNewsPlugin(): Plugin {
  const cache = new Map<string, { at: number; feed: NewsFeed }>();

  return {
    name: "yayl-dev-news",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/news", (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        };

        void (async () => {
          const url = new URL(req.url ?? "/", "http://localhost");
          const game = url.searchParams.get("game") ?? "";
          const tag = GAME_TAGS[game];
          if (!tag) {
            send(400, { error: `unknown game: ${game}` });
            return;
          }

          const hit = cache.get(game);
          if (hit && Date.now() - hit.at < CACHE_MS) {
            send(200, hit.feed);
            return;
          }

          try {
            const response = await fetch(`${API_BASE}/api/launcher/operations/resource`, {
              headers: {
                Authorization: authHeader(tag),
                Accept: "application/json",
              },
              signal: AbortSignal.timeout(15_000),
            });
            const body = (await response.json()) as JsonObject;
            if (!response.ok) {
              send(502, { error: `API returned HTTP ${response.status}` });
              return;
            }
            const code = number(body.code);
            if (code !== 0 && code !== 200) {
              send(502, { error: `API returned code ${code}` });
              return;
            }
            const feed = normalizeFeed(body);
            cache.set(game, { at: Date.now(), feed });
            send(200, feed);
          } catch (error) {
            const message = error instanceof Error ? error.message : "request failed";
            server.config.logger.error(`[yayl-dev-news] ${game}: ${message}`);
            send(502, { error: message });
          }
        })();
      });
    },
  };
}

interface SocialLink {
  channel: string;
  url: string;
  qr: string;
}

/* Mirrors `SocialResource::links`: only HTTPS links and QR images survive. */
function normalizeSocial(payload: JsonObject): SocialLink[] {
  const data =
    typeof payload.data === "object" && payload.data !== null
      ? (payload.data as JsonObject)
      : {};
  if (data.social_media_resource_open !== true) return [];

  return objects(data.social_media_resource_list).flatMap((item) => {
    const url = text(item.jump_url).trim();
    if (!url.startsWith("https://")) return [];
    const channel = text(item.social_media_channel).trim() || "Website";
    const qr = text(item.qr_img).trim();
    return [{ channel, url, qr: qr.startsWith("https://") ? qr : "" }];
  });
}

/*
 * Dev-only social and background bridge. The browser lab cannot call the
 * signed API, so this mirrors the same requests the Rust commands make. It is
 * serve-only and never part of a production build.
 */
function devLauncherPlugin(): Plugin {
  return {
    name: "yayl-dev-launcher",
    apply: "serve",
    configureServer(server) {
      const send = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify(body));
      };

      const request = async (
        req: import("node:http").IncomingMessage,
        res: import("node:http").ServerResponse,
        endpoint: string,
        handle: (body: JsonObject) => unknown,
      ) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const game = url.searchParams.get("game") ?? "";
        const tag = GAME_TAGS[game];
        if (!tag) {
          send(res, 400, { error: `unknown game: ${game}` });
          return;
        }
        try {
          const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
              Authorization: authHeader(tag),
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(15_000),
          });
          const body = (await response.json()) as JsonObject;
          if (!response.ok) {
            send(res, 502, { error: `API returned HTTP ${response.status}` });
            return;
          }
          const code = number(body.code);
          if (code !== 0 && code !== 200) {
            send(res, 502, { error: `API returned code ${code}` });
            return;
          }
          send(res, 200, handle(body));
        } catch (error) {
          const message = error instanceof Error ? error.message : "request failed";
          server.config.logger.error(`[yayl-dev-launcher] ${endpoint}: ${message}`);
          send(res, 502, { error: message });
        }
      };

      server.middlewares.use("/__dev/social", (req, res) => {
        void request(req, res, "/api/launcher/social/media/resource", normalizeSocial);
      });

      server.middlewares.use("/__dev/background", (req, res) => {
        void request(req, res, "/api/launcher/base/config", (body) => {
          const data =
            typeof body.data === "object" && body.data !== null
              ? (body.data as JsonObject)
              : {};
          const image = text(data.launcher_background_img).trim();
          const checksum = text(data.launcher_background_img_crc64).trim();
          if (!image.startsWith("https://") || !/^\d+$/.test(checksum)) {
            return { url: "" };
          }
          return { url: image };
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devNewsPlugin(), devLauncherPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
});
