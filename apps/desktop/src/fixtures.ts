/* Browser-lab samples. Production reads install data and news from the Rust
   backend; these values only appear when `isTauri()` is false. */
import type { GameId } from "./data";

export const MOCK_BASE = "D:\\Games\\YAYL";

export interface MockGame {
  downloadBytes: number;
  playtime: Record<"vi" | "en", string>;
  lastPlayed: Record<"vi" | "en", string>;
}

export const MOCK_GAMES: Record<GameId, MockGame> = {
  arknights: {
    downloadBytes: 26628797235,
    playtime: { vi: "126 giờ 42 phút", en: "126h 42m" },
    lastPlayed: { vi: "Hôm nay, 09:41", en: "Today, 09:41" },
  },
  stella: {
    downloadBytes: 20086893425,
    playtime: { vi: "48 giờ 12 phút", en: "48h 12m" },
    lastPlayed: { vi: "Hôm qua, 21:18", en: "Yesterday, 21:18" },
  },
};

interface MockServer {
  path: string;
  size: number;
  version: string;
}

export const MOCK_SERVERS: Record<string, MockServer> = {
  arknights: {
    path: "D:\\Games\\YAYL\\Arknights_EN",
    size: 26628797235,
    version: "042.0.0",
  },
  "arknights-jp": {
    path: "D:\\Games\\YAYL\\Arknights_JP",
    size: 25904332800,
    version: "37.7.41",
  },
  "arknights-kr": {
    path: "D:\\Games\\YAYL\\Arknights_KR",
    size: 26100000000,
    version: "42.0.0",
  },
  stella: {
    path: "D:\\Games\\YAYL\\StellaSora_EN",
    size: 20086893425,
    version: "2.0.0",
  },
  "stella-jp": {
    path: "D:\\Games\\YAYL\\StellaSora_JP",
    size: 20300000000,
    version: "2.0.0",
  },
  "stella-kr": {
    path: "D:\\Games\\YAYL\\StellaSora_KR",
    size: 20300000000,
    version: "2.0.0",
  },
};

export const NEWS = {
  banners: [
    {
      id: "summer",
      kicker: { vi: "SỰ KIỆN", en: "EVENT" },
      title: { vi: "Mùa hè rực rỡ", en: "Radiant Summer" },
      link: "#",
    },
    {
      id: "update",
      kicker: { vi: "CẬP NHẬT", en: "UPDATE" },
      title: { vi: "042.1.0 đã sẵn sàng", en: "042.1.0 is ready" },
      link: "#",
    },
    {
      id: "login",
      kicker: { vi: "SỰ KIỆN", en: "EVENT" },
      title: { vi: "Đăng nhập nhận quà", en: "Login rewards" },
      link: "#",
    },
  ],
  tabs: [
    {
      id: "notice",
      label: { vi: "Thông báo", en: "Notices" },
      items: [
        {
          title: { vi: "Bảo trì máy chủ định kỳ 25/10", en: "Scheduled maintenance on Oct 25" },
          date: "2026/10/24",
          link: "#",
        },
        {
          title: { vi: "Cập nhật chính sách bảo mật", en: "Privacy policy update" },
          date: "2026/10/22",
          link: "#",
        },
        {
          title: { vi: "Sửa lỗi hiển thị trang chủ", en: "Home screen display fix" },
          date: "2026/10/20",
          link: "#",
        },
      ],
    },
    {
      id: "events",
      label: { vi: "Sự kiện", en: "Events" },
      items: [
        {
          title: { vi: "Mùa hè rực rỡ — giai đoạn 2", en: "Radiant Summer — phase 2" },
          date: "2026/10/23",
          link: "#",
        },
        {
          title: { vi: "Truy tìm kho báu cùng Stella Sora", en: "Treasure hunt with Stella Sora" },
          date: "2026/10/18",
          link: "#",
        },
        {
          title: { vi: "Đăng nhập 7 ngày nhận quà", en: "7-day login rewards" },
          date: "2026/10/15",
          link: "#",
        },
      ],
    },
    {
      id: "updates",
      label: { vi: "Cập nhật", en: "Updates" },
      items: [
        {
          title: { vi: "Ghi chú bản cập nhật 042.1.0", en: "Patch notes 042.1.0" },
          date: "2026/10/24",
          link: "#",
        },
        {
          title: { vi: "Cân bằng nhân vật và kỹ năng", en: "Character and skill balance" },
          date: "2026/10/21",
          link: "#",
        },
        {
          title: { vi: "Tối ưu hiệu năng trên PC", en: "PC performance improvements" },
          date: "2026/10/17",
          link: "#",
        },
      ],
    },
  ],
} as const;
