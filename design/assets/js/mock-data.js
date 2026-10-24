/* YAYL UI lab — mock data. Classic script, file:// safe. */
(function () {
  "use strict";

  var YAYL = (window.YAYL_MOCK = window.YAYL_MOCK || {});

  YAYL.GAMES = {
    arknights: {
      id: "arknights",
      name: "Arknights",
      title: "ARKNIGHTS",
      region: "EN",
      tag: "Arknights_EN",
      version: "042.0.0",
      latest: "042.1.0",
      size: "24.8 GB",
      required: "27.2 GB",
      updateSize: "1.8 GB",
      free: "182 GB",
      drive: "D:",
      path: "D:\\Games\\YAYL\\Arknights_EN",
      root: "D:\\Games\\YAYL",
      exe: "Arknights.exe",
      playtime: { vi: "126 giờ 42 phút", en: "126h 42m" },
      lastPlayed: { vi: "Hôm nay, 09:41", en: "Today, 09:41" },
      subtitle: {
        vi: "Chào mừng trở lại, Bác sĩ. Hệ thống đã sẵn sàng cho ca trực tiếp theo.",
        en: "Welcome back, Doctor. The system is ready for your next shift."
      },
      cdn: "launcher-pkg-ark-en.yo-star.com",
      files: "3,402",
      downloaded: "8.4 GB",
      total: "20.1 GB",
      art: "assets/img/arknights.png",
      thumb: "assets/img/arknights.png"
    },
    stella: {
      id: "stella",
      name: "Stella Sora",
      title: "STELLA SORA",
      region: "EN",
      tag: "StellaSora_EN",
      version: "2.0.0",
      latest: "2.1.0",
      size: "18.6 GB",
      required: "20.4 GB",
      updateSize: "2.4 GB",
      free: "182 GB",
      drive: "D:",
      path: "D:\\Games\\YAYL\\StellaSora_EN",
      root: "D:\\Games\\YAYL",
      exe: "StellaSora.exe",
      playtime: { vi: "48 giờ 12 phút", en: "48h 12m" },
      lastPlayed: { vi: "Hôm qua, 21:18", en: "Yesterday, 21:18" },
      subtitle: {
        vi: "Chào mừng trở lại, Nhà thám hiểm. Bầu trời đang chờ bạn.",
        en: "Welcome back, Explorer. The sky is waiting for you."
      },
      cdn: "launcher-pkg-ss-en.yo-star.com",
      files: "2,118",
      downloaded: "6.2 GB",
      total: "14.8 GB",
      art: "assets/img/stella.png",
      thumb: "assets/img/stella.png"
    }
  };

  YAYL.STATE_META = {
    ready: {
      tone: "ready",
      status: "home.status.ready",
      primary: "home.action.play",
      primaryIcon: "play",
      secondary: "home.action.verify",
      secondaryIcon: "shield",
      note: "home.note.ready",
      versionMode: "current",
      sizeMode: "installed",
      progress: 0
    },
    update: {
      tone: "update",
      status: "home.status.update",
      primary: "home.action.update",
      primaryIcon: "download",
      secondary: "home.action.playAnyway",
      secondaryIcon: "play",
      note: "home.note.update",
      versionMode: "update",
      sizeMode: "update",
      progress: 0
    },
    install: {
      tone: "neutral",
      status: "home.status.install",
      primary: "home.action.install",
      primaryIcon: "download",
      secondary: "home.action.chooseFolder",
      secondaryIcon: "folder",
      note: "home.note.install",
      versionMode: "latest",
      sizeMode: "required",
      progress: 0
    },
    downloading: {
      tone: "info",
      status: "home.status.downloading",
      primary: "home.action.downloading",
      primaryIcon: "download",
      secondary: "home.action.pause",
      secondaryIcon: "pause",
      note: "home.note.downloading",
      versionMode: "update",
      sizeMode: "progress",
      progress: 42
    },
    paused: {
      tone: "warning",
      status: "home.status.paused",
      primary: "home.action.resume",
      primaryIcon: "play",
      secondary: "home.action.cancel",
      secondaryIcon: "x",
      note: "home.note.paused",
      versionMode: "update",
      sizeMode: "progress",
      progress: 42
    },
    verifying: {
      tone: "info",
      status: "home.status.verifying",
      primary: "home.action.verifying",
      primaryIcon: "spinner",
      secondary: "home.action.details",
      secondaryIcon: "list",
      note: "home.note.verifying",
      versionMode: "update",
      sizeMode: "verifying",
      progress: 86,
      disabled: true
    },
    running: {
      tone: "ready",
      status: "home.status.running",
      primary: "home.action.running",
      primaryIcon: "gamepad",
      secondary: "home.action.minimize",
      secondaryIcon: "minimize",
      note: "home.note.running",
      versionMode: "current",
      sizeMode: "playing",
      progress: 0,
      disabled: true
    },
    error: {
      tone: "error",
      status: "home.status.error",
      primary: "home.action.repair",
      primaryIcon: "wrench",
      secondary: "home.action.errorDetails",
      secondaryIcon: "alert",
      note: "home.note.error",
      versionMode: "current",
      sizeMode: "installed",
      progress: 0
    },
    offline: {
      tone: "warning",
      status: "home.status.offline",
      primary: "home.action.play",
      primaryIcon: "play",
      secondary: "home.action.retry",
      secondaryIcon: "refresh",
      note: "home.note.offline",
      versionMode: "current",
      sizeMode: "installed",
      progress: 0
    },
    complete: {
      tone: "ready",
      status: "download.status.complete",
      primary: "home.action.play",
      primaryIcon: "play",
      secondary: "home.action.details",
      secondaryIcon: "list",
      note: "home.note.ready",
      versionMode: "current",
      sizeMode: "installed",
      progress: 100
    }
  };

  YAYL.HOME_STATES = [
    "ready",
    "update",
    "install",
    "downloading",
    "paused",
    "verifying",
    "running",
    "error",
    "offline"
  ];

  YAYL.DOWNLOAD_STATES = ["downloading", "paused", "verifying", "error", "complete"];

  YAYL.NEWS = {
    banners: [
      {
        id: "summer",
        image: "assets/img/news/banner-event.svg",
        kicker: { vi: "SỰ KIỆN", en: "EVENT" },
        title: { vi: "Mùa hè rực rỡ", en: "Radiant Summer" },
        link: "#"
      },
      {
        id: "update",
        image: "assets/img/news/banner-update.svg",
        kicker: { vi: "CẬP NHẬT", en: "UPDATE" },
        title: { vi: "042.1.0 đã sẵn sàng", en: "042.1.0 is ready" },
        link: "#"
      },
      {
        id: "login",
        image: "assets/img/news/banner-login.svg",
        kicker: { vi: "SỰ KIỆN", en: "EVENT" },
        title: { vi: "Đăng nhập nhận quà", en: "Login rewards" },
        link: "#"
      }
    ],
    tabs: [
      {
        id: "notice",
        label: { vi: "Thông báo", en: "Notices" },
        items: [
          { title: { vi: "Bảo trì máy chủ định kỳ 25/10", en: "Scheduled maintenance on Oct 25" }, date: "2026/10/24", link: "#" },
          { title: { vi: "Cập nhật chính sách bảo mật", en: "Privacy policy update" }, date: "2026/10/22", link: "#" },
          { title: { vi: "Sửa lỗi hiển thị trang chủ", en: "Home screen display fix" }, date: "2026/10/20", link: "#" }
        ]
      },
      {
        id: "events",
        label: { vi: "Sự kiện", en: "Events" },
        items: [
          { title: { vi: "Mùa hè rực rỡ — giai đoạn 2", en: "Radiant Summer — phase 2" }, date: "2026/10/23", link: "#" },
          { title: { vi: "Truy tìm kho báu cùng Stella Sora", en: "Treasure hunt with Stella Sora" }, date: "2026/10/18", link: "#" },
          { title: { vi: "Đăng nhập 7 ngày nhận quà", en: "7-day login rewards" }, date: "2026/10/15", link: "#" }
        ]
      },
      {
        id: "updates",
        label: { vi: "Cập nhật", en: "Updates" },
        items: [
          { title: { vi: "Ghi chú bản cập nhật 042.1.0", en: "Patch notes 042.1.0" }, date: "2026/10/24", link: "#" },
          { title: { vi: "Cân bằng nhân vật và kỹ năng", en: "Character and skill balance" }, date: "2026/10/21", link: "#" },
          { title: { vi: "Tối ưu hiệu năng trên PC", en: "PC performance improvements" }, date: "2026/10/17", link: "#" }
        ]
      }
    ]
  };

  YAYL.ICONS = {
    play:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.4 5.2a1 1 0 0 1 1.52-.86l9.1 6.8a1 1 0 0 1 0 1.72l-9.1 6.8A1 1 0 0 1 8.4 18.8V5.2Z"/></svg>',
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    folder:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-10Z"/></svg>',
    shield:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
    pause:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
    x:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    list:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    wrench:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6.5a4.5 4.5 0 0 0-6 6L4 17l3 3 4.5-4.5a4.5 4.5 0 0 0 6-6l-3 3-3-3 3-3Z"/></svg>',
    alert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.2 2.8 17.3A1.7 1.7 0 0 0 4.3 20h15.4a1.7 1.7 0 0 0 1.5-2.7L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 16h.01"/></svg>',
    refresh:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 6.1"/><path d="M20 4v7h-7"/></svg>',
    gamepad:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.9 4.9l-1 4.1a2.4 2.4 0 0 1-4.2 1.2L14 16h-4l-1.7 2.2a2.4 2.4 0 0 1-4.2-1.2l-1-4.1A4 4 0 0 1 7 8Z"/><path d="M8 12h2M9 11v2M15.5 11.5h.01M17.5 13.5h.01"/></svg>',
    minimize:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    check:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 10h17"/></svg>',
    cloud:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18.2 9 4 4 0 0 1 17.5 17"/><path d="M12 12v7M9.5 16.5 12 19l2.5-2.5"/></svg>',
    arrowRight:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>',
    arrowLeft:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M10 7l-5 5 5 5"/></svg>',
    chevronRight:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    flask:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6M10 3v6l-5.2 9a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21h-4v-.08a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3v-4h.08a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3h4v.08a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.4.45.74.85.92H21v4h-.08a1.7 1.7 0 0 0-1.52 1.08Z"/></svg>',
    home:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    downloadNav:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    sliders:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
    info:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>',
    file:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h7l5 5v13H6V3Z"/><path d="M13 3v5h5"/></svg>',
    wifiOff:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M5 12a10 10 0 0 1 3-2.1M19 12a10 10 0 0 0-7.8-2.9"/><path d="M12 19h.01"/></svg>',
    external:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/></svg>'
  };
})();
