/* YAYL UI lab — page behaviors. Classic script, file:// safe. */
(function () {
  "use strict";

  var Y = window.YAYL_MOCK;
  var app = Y.app;
  var pages = (Y.pages = Y.pages || {});

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.textContent = value;
    });
  }

  function setHidden(selector, hidden) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.hidden = hidden;
    });
  }

  function metaVars(game) {
    return {
      game: game.name,
      size: game.updateSize,
      required: game.required,
      drive: game.drive,
      free: game.free,
      code: app.t("home.error.code")
    };
  }

  function stateVars(game, meta) {
    return {
      game: game.name,
      percent: meta.progress || 42,
      size: game.updateSize,
      required: game.required,
      drive: game.drive,
      free: game.free,
      code: app.t("home.error.code")
    };
  }

  function setStatusPill(el, tone, label) {
    if (!el) return;
    el.className = "status-pill is-" + tone;
    var text = el.querySelector("[data-status-label]");
    if (text) text.textContent = label;
  }

  function setButton(button, label, icon, disabled) {
    if (!button) return;
    var labelEl = button.querySelector("[data-button-label]");
    var iconEl = button.querySelector("[data-button-icon]");
    if (labelEl) labelEl.textContent = label;
    if (iconEl) {
      if (icon === "spinner") {
        iconEl.innerHTML = '<span class="spinner"></span>';
      } else {
        iconEl.innerHTML = app.icon(icon);
      }
    }
    button.disabled = !!disabled;
    button.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function updateMetaCards(game, state) {
    var playtimeLabel = document.querySelector('[data-meta-label="playtime"]');
    var playtimeValue = document.querySelector('[data-meta-value="playtime"]');
    var playtimeSub = document.querySelector('[data-meta-sub="playtime"]');
    var pathValue = document.querySelector('[data-meta-value="path"]');
    var pathSub = document.querySelector('[data-meta-sub="path"]');
    var lastValue = document.querySelector('[data-meta-value="last"]');
    var lastSub = document.querySelector('[data-meta-sub="last"]');

    if (state === "install") {
      if (playtimeLabel) playtimeLabel.textContent = app.t("home.meta.required");
      if (playtimeValue) playtimeValue.textContent = game.required;
      if (playtimeSub) {
        playtimeSub.textContent = app.t("home.meta.requiredSub", {
          drive: game.drive,
          free: game.free
        });
      }
      if (pathValue) pathValue.textContent = app.t("home.meta.notChosen");
      if (pathSub) pathSub.textContent = app.t("home.meta.pathSubEmpty");
      if (lastValue) lastValue.textContent = app.t("home.meta.never");
      if (lastSub) lastSub.textContent = "—";
      return;
    }

    if (playtimeLabel) playtimeLabel.textContent = app.t("home.meta.playtime");
    if (playtimeValue) playtimeValue.textContent = game.playtime[app.current.lang];
    if (playtimeSub) playtimeSub.textContent = app.t("home.meta.playtimeSub");
    if (pathValue) pathValue.textContent = game.path;
    if (pathSub) pathSub.textContent = app.t("home.meta.pathSub");
    if (lastValue) lastValue.textContent = game.lastPlayed[app.current.lang];
    if (lastSub) lastSub.textContent = app.t("home.meta.lastSub", { game: game.name });
  }

  function renderHome() {
    var game = app.game();
    var state = app.current.state;
    var meta = app.meta();
    var vars = stateVars(game, meta);

    setStatusPill(byId("statusPill"), meta.tone, app.t(meta.status));

    var primary = byId("primaryAction");
    var secondary = byId("secondaryAction");
    setButton(primary, app.t(meta.primary, vars), meta.primaryIcon, meta.disabled);
    setButton(secondary, app.t(meta.secondary, vars), meta.secondaryIcon, false);

    var versionLabel = byId("versionChipLabel");
    var versionValue = byId("versionChipValue");
    var sizeChip = byId("sizeChipValue");
    var updateChip = byId("updateChip");

    if (meta.versionMode === "update") {
      if (versionLabel) versionLabel.textContent = app.t("home.current");
      if (versionValue) versionValue.textContent = game.version;
    } else if (meta.versionMode === "latest") {
      if (versionLabel) versionLabel.textContent = app.t("home.latest");
      if (versionValue) versionValue.textContent = game.version;
    } else {
      if (versionLabel) versionLabel.textContent = app.t("home.version");
      if (versionValue) versionValue.textContent = game.version;
    }

    if (sizeChip) {
      if (meta.sizeMode === "update") sizeChip.textContent = game.updateSize;
      else if (meta.sizeMode === "required") sizeChip.textContent = game.required;
      else if (meta.sizeMode === "progress") sizeChip.textContent = game.downloaded + " / " + game.total;
      else if (meta.sizeMode === "verifying") sizeChip.textContent = app.t("common.verifying");
      else if (meta.sizeMode === "playing") sizeChip.textContent = app.t("common.running");
      else sizeChip.textContent = game.size;
    }

    if (updateChip) {
      updateChip.hidden = state !== "update";
      if (state === "update") {
        updateChip.textContent = app.t("home.updateChip", { version: game.latest });
      }
    }

    var note = byId("heroNoteText");
    if (note) note.textContent = app.t(meta.note, vars);

    setHidden("[data-offline-banner]", state !== "offline");
    setHidden("[data-error-banner]", state !== "error");
    setHidden("[data-progress-dock]", ["downloading", "paused", "verifying"].indexOf(state) === -1);

    if (state === "offline") {
      var offlineTitle = document.querySelector("[data-offline-title]");
      var offlineText = document.querySelector("[data-offline-text]");
      if (offlineTitle) offlineTitle.textContent = app.t("home.offline.title");
      if (offlineText) offlineText.textContent = app.t("home.offline.text");
    }

    if (state === "error") {
      var errorTitle = document.querySelector("[data-error-title]");
      var errorText = document.querySelector("[data-error-text]");
      if (errorTitle) errorTitle.textContent = app.t("home.error.title");
      if (errorText) errorText.textContent = app.t("home.error.text");
    }

    if (["downloading", "paused", "verifying"].indexOf(state) !== -1) {
      var dockTitle = document.querySelector("[data-dock-title]");
      var dockSub = document.querySelector("[data-dock-sub]");
      var dockPercent = document.querySelector("[data-dock-percent]");
      var dockFill = document.querySelector("[data-dock-fill]");
      var percent = meta.progress || 42;
      if (dockPercent) dockPercent.textContent = percent + "%";
      if (dockFill) dockFill.style.width = percent + "%";
      if (dockTitle && dockSub) {
        if (state === "downloading") {
          dockTitle.textContent = app.t("home.download.title", { game: game.name });
          dockSub.textContent = app.t("home.download.sub", {
            speed: "12.4 MB/s",
            eta: "08:12",
            done: game.downloaded,
            total: game.total
          });
        } else if (state === "paused") {
          dockTitle.textContent = app.t("home.paused.title", { game: game.name });
          dockSub.textContent = app.t("home.paused.sub", {
            done: game.downloaded,
            total: game.total
          });
        } else {
          dockTitle.textContent = app.t("home.verifying.title", { game: game.name });
          dockSub.textContent = app.t("home.verifying.sub", {
            done: "2,912",
            total: game.files
          });
        }
      }
    }

    updateMetaCards(game, state);
  }

  /* ------------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------------ */

  var settingsTabs = ["general", "game", "network", "advanced", "about"];

  function showSettingsTab(tab, updateQuery) {
    if (settingsTabs.indexOf(tab) === -1) tab = "general";
    document.querySelectorAll("[data-settings-tab]").forEach(function (item) {
      item.classList.toggle("is-active", item.getAttribute("data-settings-tab") === tab);
    });
    document.querySelectorAll("[data-settings-panel]").forEach(function (panel) {
      panel.hidden = panel.getAttribute("data-settings-panel") !== tab;
    });
    if (updateQuery !== false) {
      app.updateQuery("tab", tab);
    }
    var scroll = document.querySelector(".main-scroll");
    if (scroll) scroll.scrollTop = 0;
  }

  function updateRange(input, valueEl, formatter) {
    if (!input) return;
    var min = Number(input.min || 0);
    var max = Number(input.max || 100);
    var value = Number(input.value || 0);
    var percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
    input.style.background =
      "linear-gradient(90deg, var(--accent) 0%, var(--accent) " +
      percent +
      "%, rgba(255,255,255,.1) " +
      percent +
      "%, rgba(255,255,255,.1) 100%)";
    if (valueEl) {
      valueEl.textContent = formatter ? formatter(value) : String(value);
    }
  }

  function renderSettings() {
    var game = app.game();
    var langSelect = byId("languageSelect");
    if (langSelect) langSelect.value = app.current.lang;
    var motion = byId("motionToggle");
    if (motion) motion.checked = document.body.dataset.motion === "reduced";
    var path = byId("gamePathInput");
    if (path && document.activeElement !== path) path.value = game.path;
    var disk = document.querySelector("[data-settings-disk]");
    if (disk) {
      disk.textContent = app.t("settings.game.diskValue", {
        drive: game.drive,
        free: game.free,
        required: game.size
      });
    }
    var gameName = document.querySelector("[data-settings-game-name]");
    if (gameName) gameName.textContent = game.name;
    var gameVersion = document.querySelector("[data-settings-game-version]");
    if (gameVersion) gameVersion.textContent = game.version;

    var heroArt = byId("settingsGameArt");
    if (heroArt) app.setArt(heroArt, app.current.game);
    var heroIcon = byId("settingsGameIcon");
    if (heroIcon) app.setArt(heroIcon, app.current.game);
    var heroName = byId("settingsGameName");
    if (heroName) heroName.textContent = game.name;
    var heroVersion = byId("settingsGameVersion");
    if (heroVersion) heroVersion.textContent = "v" + game.version;
    var heroBadge = document.querySelector("[data-settings-update]");
    if (heroBadge) {
      heroBadge.hidden = game.latest === game.version;
      heroBadge.textContent = app.t("home.updateChip", { version: game.latest });
    }

    document.querySelectorAll("[data-settings-game]").forEach(function (tab) {
      tab.classList.toggle("is-active", tab.getAttribute("data-settings-game") === app.current.game);
    });

    var concurrency = byId("concurrencyRange");
    if (concurrency) {
      updateRange(concurrency, byId("concurrencyValue"), function (value) {
        return String(value);
      });
    }
    var bandwidth = byId("bandwidthRange");
    if (bandwidth) {
      updateRange(bandwidth, byId("bandwidthValue"), function (value) {
        return value === 0 ? app.t("settings.network.unlimited") : value + " MB/s";
      });
    }
  }

  pages.settings = function (appRef) {
    var initialTab = appRef.params.get("tab") || "general";
    showSettingsTab(initialTab, false);

    document.querySelectorAll("[data-settings-tab]").forEach(function (item) {
      item.addEventListener("click", function () {
        showSettingsTab(item.getAttribute("data-settings-tab"), true);
      });
    });

    var language = byId("languageSelect");
    if (language) {
      language.addEventListener("change", function () {
        appRef.setLang(language.value);
        appRef.showToast(appRef.t("settings.toast.saved.title"), appRef.t("settings.toast.saved.text"));
      });
    }

    var motion = byId("motionToggle");
    if (motion) {
      motion.addEventListener("change", function () {
        appRef.setMotion(motion.checked);
        appRef.showToast(appRef.t("settings.toast.saved.title"), appRef.t("settings.toast.saved.text"));
      });
    }

    ["backgroundSelect", "autostartToggle", "closeBehavior", "minimizeOnPlay", "startMinimized", "cdnSelect", "logLevel", "timeoutInput", "proxyUrl"].forEach(function (id) {
      var control = byId(id);
      if (!control) return;
      control.addEventListener("change", function () {
        appRef.showToast(appRef.t("settings.toast.saved.title"), appRef.t("settings.toast.saved.text"));
      });
    });

    document.querySelectorAll("[data-settings-game]").forEach(function (tab) {
      tab.addEventListener("click", function () {
        appRef.setGame(tab.getAttribute("data-settings-game"));
        renderSettings();
      });
    });

    var browse = byId("browsePath");
    if (browse) {
      browse.addEventListener("click", function () {
        appRef.showToast(appRef.t("settings.toast.browse.title"), appRef.t("settings.toast.browse.text"));
      });
    }

    var detect = byId("detectGame");
    if (detect) {
      detect.addEventListener("click", function () {
        appRef.showToast(
          appRef.t("settings.toast.detect.title"),
          appRef.t("settings.toast.detect.text", { path: appRef.game().path })
        );
      });
    }

    var openFolder = byId("openGameFolder");
    if (openFolder) {
      openFolder.addEventListener("click", function () {
        appRef.showToast(
          appRef.t("settings.toast.openFolder.title"),
          appRef.t("settings.toast.openFolder.text", { path: appRef.game().path })
        );
      });
    }

    var verify = byId("quickVerify");
    if (verify) {
      verify.addEventListener("click", function () {
        appRef.showToast(appRef.t("settings.toast.verify.title"), appRef.t("settings.toast.verify.text"));
        window.setTimeout(function () {
          appRef.showToast(appRef.t("settings.toast.verifyDone.title"), appRef.t("settings.toast.verifyDone.text"));
        }, 1000);
      });
    }

    var repair = byId("fullRepair");
    if (repair) {
      repair.addEventListener("click", function () {
        appRef.openConfirm({
          title: appRef.t("settings.repair.title", { game: appRef.game().name }),
          text: appRef.t("settings.repair.text"),
          confirmLabel: appRef.t("settings.repair.confirm"),
          icon: "wrench",
          tone: "accent",
          onConfirm: function () {
            appRef.showToast(appRef.t("settings.toast.repair.title"), appRef.t("settings.toast.repair.text"));
          }
        });
      });
    }

    var uninstall = byId("uninstallGame");
    if (uninstall) {
      uninstall.addEventListener("click", function () {
        appRef.openConfirm({
          title: appRef.t("settings.uninstall.title", { game: appRef.game().name }),
          text: appRef.t("settings.uninstall.text"),
          path: appRef.game().path,
          confirmLabel: appRef.t("settings.uninstall.confirm"),
          cancelLabel: appRef.t("settings.uninstall.cancel"),
          checkLabel: appRef.t("settings.uninstall.check"),
          requireCheck: true,
          icon: "trash",
          tone: "danger",
          onConfirm: function () {
            appRef.showToast(
              appRef.t("settings.toast.uninstall.title"),
              appRef.t("settings.toast.uninstall.text", { game: appRef.game().name }),
              "error"
            );
          }
        });
      });
    }

    var importGame = byId("importGame");
    if (importGame) {
      importGame.addEventListener("click", function () {
        appRef.showToast(appRef.t("settings.toast.import.title"), appRef.t("settings.toast.import.text"));
      });
    }

    document.querySelectorAll("[data-proxy-mode]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll("[data-proxy-mode]").forEach(function (item) {
          item.classList.toggle("is-active", item === button);
        });
        var custom = byId("proxyCustom");
        if (custom) custom.hidden = button.getAttribute("data-proxy-mode") !== "custom";
        appRef.showToast(appRef.t("settings.toast.saved.title"), appRef.t("settings.toast.saved.text"));
      });
    });

    var concurrency = byId("concurrencyRange");
    if (concurrency) {
      concurrency.addEventListener("input", function () {
        updateRange(concurrency, byId("concurrencyValue"), function (value) {
          return String(value);
        });
      });
      concurrency.addEventListener("change", function () {
        appRef.showToast(appRef.t("settings.toast.saved.title"), appRef.t("settings.toast.saved.text"));
      });
    }

    var bandwidth = byId("bandwidthRange");
    if (bandwidth) {
      bandwidth.addEventListener("input", function () {
        updateRange(bandwidth, byId("bandwidthValue"), function (value) {
          return value === 0 ? appRef.t("settings.network.unlimited") : value + " MB/s";
        });
      });
      bandwidth.addEventListener("change", function () {
        appRef.showToast(appRef.t("settings.toast.saved.title"), appRef.t("settings.toast.saved.text"));
      });
    }

    var openLogs = byId("openLogs");
    if (openLogs) {
      openLogs.addEventListener("click", function () {
        appRef.showToast(appRef.t("settings.toast.logs.title"), appRef.t("settings.toast.logs.text"));
      });
    }

    var clearCache = byId("clearCache");
    if (clearCache) {
      clearCache.addEventListener("click", function () {
        appRef.showToast(appRef.t("settings.toast.cache.title"), appRef.t("settings.toast.cache.text"));
      });
    }

    var diagnostics = byId("exportDiagnostics");
    if (diagnostics) {
      diagnostics.addEventListener("click", function () {
        appRef.showToast(appRef.t("settings.toast.diagnostics.title"), appRef.t("settings.toast.diagnostics.text"));
      });
    }

    var reset = byId("resetSettings");
    if (reset) {
      reset.addEventListener("click", function () {
        appRef.openConfirm({
          title: appRef.t("settings.reset.title"),
          text: appRef.t("settings.reset.text"),
          confirmLabel: appRef.t("settings.reset.confirm"),
          icon: "refresh",
          tone: "danger",
          onConfirm: function () {
            appRef.setLang("vi");
            appRef.setMotion(false);
            appRef.showToast(appRef.t("settings.toast.reset.title"), appRef.t("settings.toast.reset.text"));
          }
        });
      });
    }

    Y.renderPage = renderSettings;
  };

  /* ------------------------------------------------------------------------
     First run
     ------------------------------------------------------------------------ */

  function selectedGameNames(list) {
    var ids = list && list.length ? list : ["arknights", "stella"];
    return ids
      .map(function (id) {
        return Y.GAMES[id] ? Y.GAMES[id].name : id;
      })
      .join(" · ");
  }

  pages["first-run"] = function (appRef) {
    var selected = ["arknights", "stella"];
    var langButtons = document.querySelectorAll("[data-lang-option]");
    var gameButtons = document.querySelectorAll("[data-first-game]");
    var pathInput = byId("firstRunPath");

    function showStep(step, updateQuery) {
      var next = Math.min(3, Math.max(1, Number(step) || 1));
      appRef.current.step = next;
      document.body.dataset.step = String(next);
      document.querySelectorAll("[data-step-panel]").forEach(function (panel) {
        panel.hidden = Number(panel.getAttribute("data-step-panel")) !== next;
      });
      document.querySelectorAll("[data-step-indicator]").forEach(function (item) {
        var value = Number(item.getAttribute("data-step-indicator"));
        item.classList.toggle("is-active", value === next);
        item.classList.toggle("is-done", value < next);
      });
      if (updateQuery !== false) appRef.updateQuery("step", String(next));
      renderFirstRun();
    }

    function renderFirstRun() {
      var activeGame = appRef.current.game;
      if (selected.indexOf(activeGame) === -1 && selected.length) {
        activeGame = selected[0];
        appRef.current.game = activeGame;
        document.body.dataset.game = activeGame;
      }

      langButtons.forEach(function (button) {
        button.classList.toggle("is-active", button.getAttribute("data-lang-option") === appRef.current.lang);
      });

      gameButtons.forEach(function (button) {
        button.classList.toggle("is-active", selected.indexOf(button.getAttribute("data-first-game")) !== -1);
      });

      if (pathInput) pathInput.value = appRef.game().root;

      var summaryGames = byId("summaryGames");
      if (summaryGames) summaryGames.textContent = selectedGameNames(selected);
      var summaryPath = byId("summaryPath");
      if (summaryPath) summaryPath.textContent = appRef.game().root;
      var summaryLanguage = byId("summaryLanguage");
      if (summaryLanguage) {
        summaryLanguage.textContent = appRef.t(appRef.current.lang === "vi" ? "common.vi" : "common.en");
      }

      document.querySelectorAll("[data-first-game-status]").forEach(function (el) {
        var id = el.getAttribute("data-first-game-status");
        el.textContent = selected.indexOf(id) !== -1 ? appRef.t("firstRun.selected") : appRef.t("firstRun.notDetected");
      });

      document.querySelectorAll(".onboarding-visual .backdrop-art").forEach(function (img) {
        appRef.setArt(img, activeGame);
      });
    }

    Y.renderPage = renderFirstRun;
    Y.setPageStep = function (step) {
      showStep(step, false);
    };

    langButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        appRef.setLang(button.getAttribute("data-lang-option"));
        renderFirstRun();
      });
    });

    gameButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var id = button.getAttribute("data-first-game");
        var index = selected.indexOf(id);
        if (index === -1) {
          selected.push(id);
          appRef.current.game = id;
          document.body.dataset.game = id;
        } else if (selected.length > 1) {
          selected.splice(index, 1);
        } else {
          appRef.showToast(appRef.t("firstRun.toast.minOne"), appRef.t("firstRun.toast.minOneText"), "error");
          return;
        }
        renderFirstRun();
      });
    });

    var browse = byId("browseFirstRunPath");
    if (browse) {
      browse.addEventListener("click", function () {
        appRef.showToast(appRef.t("firstRun.toast.path.title"), appRef.t("firstRun.toast.path.text"));
      });
    }

    var next = byId("firstRunNext");
    if (next) {
      next.addEventListener("click", function () {
        showStep(2, true);
      });
    }

    var back = byId("firstRunBack");
    if (back) {
      back.addEventListener("click", function () {
        showStep(1, true);
      });
    }

    var start = byId("firstRunStart");
    if (start) {
      start.addEventListener("click", function () {
        showStep(3, true);
        appRef.showToast(appRef.t("firstRun.toast.start.title"), appRef.t("firstRun.toast.start.text"));
      });
    }

    var finish = byId("firstRunFinish");
    if (finish) {
      finish.addEventListener("click", function () {
        window.location.href =
          "home-sidebar.html?game=" +
          encodeURIComponent(selected[0] || "arknights") +
          "&lang=" +
          encodeURIComponent(appRef.current.lang);
      });
    }

    showStep(appRef.current.step, false);
  };

  /* ------------------------------------------------------------------------
     UI kit
     ------------------------------------------------------------------------ */

  pages.kit = function (appRef) {
    var toast = byId("kitToastBtn");
    if (toast) {
      toast.addEventListener("click", function () {
        appRef.showToast(appRef.t("kit.toastTitle"), appRef.t("kit.toastText"));
      });
    }

    var modal = byId("kitModalBtn");
    if (modal) {
      modal.addEventListener("click", function () {
        appRef.openConfirm({
          title: appRef.t("kit.modalTitle"),
          text: appRef.t("kit.modalText"),
          confirmLabel: appRef.t("kit.modalConfirm"),
          path: "D:\\Games\\YAYL\\Arknights_EN",
          requireCheck: true,
          checkLabel: appRef.t("settings.uninstall.check"),
          icon: "trash",
          tone: "danger"
        });
      });
    }

    var range = byId("kitRange");
    if (range) {
      var update = function () {
        updateRange(range, byId("kitRangeValue"), function (value) {
          return String(value);
        });
      };
      range.addEventListener("input", update);
      update();
    }

    Y.renderPage = function () {};
  };

  /* ------------------------------------------------------------------------
     Lean home: news, stats, single primary action
     ------------------------------------------------------------------------ */

  var newsIndex = 0;
  var newsTabId = "notice";
  var newsTimer = null;

  function homeSubText(game, state, meta) {
    if (state === "install") return game.size + " · " + app.t("home.meta.required");
    if (state === "update") return app.t("home.current") + " " + game.version + " → " + game.latest;
    if (state === "downloading") return "12.4 MB/s · " + app.t("download.eta") + " 08:12";
    if (state === "paused") return app.t("download.etaPaused");
    if (state === "verifying") return app.t("download.etaVerifying");
    if (state === "error") return app.t("home.error.code");
    if (state === "offline") return app.t("common.offline");
    if (state === "running") return app.t("common.running");
    return app.t("common.ready");
  }

  function homeSecondaryText(game, state) {
    if (state === "update") return { key: "home.action.playAnyway" };
    if (state === "install") return { key: "home.action.useExisting" };
    if (state === "error") return { key: "home.action.errorDetails" };
    if (state === "offline") return { key: "home.action.retry" };
    if (state === "running") return { key: "home.action.minimize" };
    return null;
  }

  function renderNews() {
    var news = Y.NEWS;
    var lang = app.current.lang;
    var banner = byId("newsBanner");
    var tabs = byId("newsTabs");
    var list = byId("newsList");
    if (!news || !banner || !tabs || !list) return;

    function showBanner(index) {
      newsIndex = index;
      banner.querySelectorAll(".banner-slide").forEach(function (slide, i) {
        slide.classList.toggle("is-active", i === index);
      });
      banner.querySelectorAll("[data-banner-dot]").forEach(function (dot, i) {
        dot.classList.toggle("is-active", i === index);
      });
    }

    if (banner.dataset.ready !== "1") {
      banner.innerHTML = news.banners
        .map(function (item, index) {
          return (
            '<div class="banner-slide' + (index === 0 ? " is-active" : "") + '" data-banner-index="' + index + '">' +
            '<img src="' + item.image + '" alt="">' +
            '<div class="banner-copy"><div class="banner-kicker" data-banner-kicker></div><div class="banner-title" data-banner-title></div></div>' +
            "</div>"
          );
        })
        .join("") +
        '<div class="banner-dots">' +
        news.banners
          .map(function (item, index) {
            return '<button class="banner-dot' + (index === 0 ? " is-active" : "") + '" type="button" data-banner-dot="' + index + '" aria-label="Slide ' + (index + 1) + '"></button>';
          })
          .join("") +
        "</div>";
      banner.querySelectorAll("[data-banner-dot]").forEach(function (dot) {
        dot.addEventListener("click", function () {
          showBanner(Number(dot.getAttribute("data-banner-dot")));
        });
      });
      banner.dataset.ready = "1";
      if (newsTimer) window.clearInterval(newsTimer);
      newsTimer = window.setInterval(function () {
        showBanner((newsIndex + 1) % news.banners.length);
      }, 6000);
    }

    banner.querySelectorAll(".banner-slide").forEach(function (slide, index) {
      var item = news.banners[index];
      var kicker = slide.querySelector("[data-banner-kicker]");
      var title = slide.querySelector("[data-banner-title]");
      if (kicker) kicker.textContent = item.kicker[lang];
      if (title) title.textContent = item.title[lang];
    });

    if (tabs.dataset.ready !== "1") {
      tabs.innerHTML = news.tabs
        .map(function (tab) {
          return '<button class="news-tab" type="button" data-news-tab="' + tab.id + '"></button>';
        })
        .join("");
      tabs.querySelectorAll("[data-news-tab]").forEach(function (button) {
        button.addEventListener("click", function () {
          newsTabId = button.getAttribute("data-news-tab");
          renderNews();
        });
      });
      tabs.dataset.ready = "1";
    }

    tabs.querySelectorAll("[data-news-tab]").forEach(function (button) {
      var id = button.getAttribute("data-news-tab");
      var tab = news.tabs.filter(function (item) {
        return item.id === id;
      })[0];
      button.textContent = tab ? tab.label[lang] : id;
      button.classList.toggle("is-active", id === newsTabId);
    });

    var active = news.tabs.filter(function (item) {
      return item.id === newsTabId;
    })[0] || news.tabs[0];
    list.innerHTML = (active.items || [])
      .map(function (item) {
        return (
          '<a class="news-item" href="' + item.link + '">' +
          '<span class="news-title">' + item.title[lang] + "</span>" +
          '<span class="news-date">' + item.date + "</span>" +
          "</a>"
        );
      })
      .join("");
  }

  function renderHome() {
    var game = app.game();
    var state = app.current.state;
    var meta = app.meta();
    var vars = stateVars(game, meta);

    var stats = byId("heroStats");
    if (stats) stats.hidden = state === "install";
    document.querySelectorAll("[data-stat-playtime]").forEach(function (el) {
      el.textContent = game.playtime[app.current.lang];
    });
    document.querySelectorAll("[data-stat-last]").forEach(function (el) {
      el.textContent = game.lastPlayed[app.current.lang];
    });

    var primary = byId("primaryAction");
    if (primary) {
      primary.className = "home-play is-" + state;
      primary.disabled = !!meta.disabled;
      primary.setAttribute("aria-disabled", meta.disabled ? "true" : "false");
      var label = primary.querySelector("[data-button-label]");
      var sub = primary.querySelector("[data-button-sub]");
      var icon = primary.querySelector("[data-button-icon]");
      if (label) label.textContent = app.t(meta.primary, vars);
      if (sub) sub.textContent = homeSubText(game, state, meta);
      if (icon) {
        icon.innerHTML = meta.primaryIcon === "spinner" ? '<span class="spinner"></span>' : app.icon(meta.primaryIcon);
      }
      // Chosen download effect: rising bubbles inside the button.
      var downloadActive = ["downloading", "paused", "verifying"].indexOf(state) !== -1;
      if (downloadActive && window.YAYL_BUBBLES) {
        if (!primary._bubble) primary._bubble = window.YAYL_BUBBLES.create(primary, { progress: 0 });
        if (primary._bubble) primary._bubble.setProgress((meta.progress || 0) / 100);
      } else if (primary._bubble) {
        primary._bubble.destroy();
        primary._bubble = null;
      }
    }

    var secondary = byId("secondaryAction");
    if (secondary) {
      var secondaryText = homeSecondaryText(game, state);
      secondary.hidden = !secondaryText;
      if (secondaryText) secondary.textContent = app.t(secondaryText.key, secondaryText.vars || {});
    }

    var card = byId("gameInfoCard");
    var showCard = ["install", "downloading", "paused", "verifying", "error"].indexOf(state) !== -1;
    if (card) card.hidden = !showCard;
    if (showCard) {
      var name = byId("gameInfoName");
      if (name) name.textContent = game.name;
      var version = byId("gameInfoVersion");
      if (version) version.textContent = "v" + game.version;
      var infoState = byId("gameInfoState");
      if (infoState) infoState.textContent = homeSubText(game, state, meta);
      var badge = byId("gameInfoBadge");
      if (badge) {
        var badgeText =
          state === "install"
            ? app.t("home.status.install")
            : state === "downloading"
            ? app.t("home.status.downloading")
            : state === "paused"
            ? app.t("home.status.paused")
            : state === "verifying"
            ? app.t("home.status.verifying")
            : state === "error"
            ? app.t("home.status.error")
            : "";
        badge.hidden = !badgeText;
        badge.textContent = badgeText;
      }
    }

    var versionEl = byId("homeVersion");
    if (versionEl) versionEl.textContent = "v" + game.version;

    renderNews();
  }

  pages.home = function (appRef) {
    var primary = byId("primaryAction");
    var secondary = byId("secondaryAction");

    if (primary) {
      primary.addEventListener("click", function () {
        var state = appRef.current.state;
        if (state === "update" || state === "install") {
          appRef.setState("downloading");
          appRef.showToast(appRef.t("home.toast.launch.title"), appRef.t("home.toast.launch.text", { game: appRef.game().name }));
          return;
        }
        if (state === "downloading") {
          appRef.setState("paused");
          return;
        }
        if (state === "paused") {
          appRef.setState("downloading");
          return;
        }
        if (state === "verifying") return;
        if (state === "error") {
          appRef.showToast(appRef.t("home.toast.repair.title"), appRef.t("home.toast.repair.text"));
          return;
        }
        if (state === "offline") {
          appRef.showToast(appRef.t("home.toast.offline.title"), appRef.t("home.toast.offline.text"), "error");
          return;
        }
        if (state === "running") return;
        appRef.showToast(appRef.t("home.toast.launch.title"), appRef.t("home.toast.launch.text", { game: appRef.game().name }));
      });
    }

    if (secondary) {
      secondary.addEventListener("click", function () {
        var state = appRef.current.state;
        if (state === "update") {
          appRef.showToast(appRef.t("home.toast.launch.title"), appRef.t("home.toast.launch.text", { game: appRef.game().name }));
          return;
        }
        if (state === "install") {
          appRef.showToast(appRef.t("home.toast.folder.title"), appRef.t("home.toast.folder.text", { path: appRef.game().root }));
          return;
        }
        if (state === "downloading") {
          appRef.setState("paused");
          appRef.showToast(appRef.t("home.toast.pause.title"), appRef.t("home.toast.pause.text"));
          return;
        }
        if (state === "paused") {
          appRef.setState("downloading");
          return;
        }
        if (state === "error") {
          appRef.showToast(appRef.t("home.toast.details.title"), appRef.t("home.toast.details.text"), "error");
          return;
        }
        if (state === "offline") {
          appRef.showToast(appRef.t("home.toast.retry.title"), appRef.t("home.toast.retry.text"));
          return;
        }
        if (state === "running") {
          appRef.showToast(appRef.t("home.toast.minimize.title"), appRef.t("home.toast.minimize.text"));
        }
      });
    }

    var menuBtn = byId("homeMenuBtn");
    var menuPop = byId("homeMenuPop");
    if (menuBtn && menuPop) {
      function closeMenu() {
        menuPop.hidden = true;
        menuBtn.setAttribute("aria-expanded", "false");
      }
      menuBtn.addEventListener("click", function (event) {
        event.stopPropagation();
        var open = menuPop.hidden;
        menuPop.hidden = !open;
        menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
      menuPop.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      menuPop.querySelectorAll(".home-menu-item").forEach(function (item) {
        item.addEventListener("click", function () {
          var label = item.textContent;
          closeMenu();
          appRef.showToast(label, appRef.t("home.menu.stub"));
        });
      });
      document.addEventListener("click", closeMenu);
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeMenu();
      });
    }

    Y.renderPage = renderHome;
  };

  pages["server-switch"] = function (appRef) {
    document.querySelectorAll("[data-server]").forEach(function (item) {
      item.addEventListener("click", function () {
        document.querySelectorAll("[data-server]").forEach(function (other) {
          other.classList.toggle("is-active", other === item);
        });
        var badge = document.querySelector(".server-game.is-active .server-badge");
        if (badge) badge.textContent = item.getAttribute("data-server").toUpperCase();
      });
    });
  };

  pages.animations = function () {
    document.querySelectorAll(".dl-badge[data-auto]").forEach(function (placeholder) {
      if (!window.YAYL_BADGE) return;
      var state = placeholder.getAttribute("data-state") || "idle";
      var corner = placeholder.classList.contains("dl-badge--corner");
      var size = placeholder.getAttribute("data-size") || "";
      var badge = window.YAYL_BADGE.create(state, { corner: corner, size: size });
      placeholder.replaceWith(badge);
    });
  };
})();
