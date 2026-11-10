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

  var settingsSaveTimer = null;

  /* Short confirmation after a setting changes, mirroring the React app. */
  function flashSettingsSaved(appRef) {
    var note = byId("settingsSaveNote");
    var text = byId("settingsSaveText");
    if (!note || !text) return;
    text.textContent = appRef.t("settings.saved");
    note.hidden = false;
    if (settingsSaveTimer) window.clearTimeout(settingsSaveTimer);
    settingsSaveTimer = window.setTimeout(function () {
      settingsSaveTimer = null;
      note.hidden = true;
    }, 1800);
  }

  var labBackground = { mode: "art", url: null, video: false, name: "", blur: 0, noise: 0 };

  function applyLabBackground() {
    var app = document.querySelector(".app");
    if (!app) return;
    app.style.setProperty("--bg-blur", labBackground.mode === "custom" ? labBackground.blur + "px" : "0px");
    app.style.setProperty("--bg-noise", labBackground.mode === "custom" ? String(labBackground.noise / 100) : "0");
    document.body.dataset.background = labBackground.mode;

    var backdrop = app.querySelector(".backdrop");
    if (!backdrop) return;
    var custom = backdrop.querySelector(".backdrop-media");
    if (custom) custom.remove();
    var art = backdrop.querySelector(".backdrop-art:not(.backdrop-media)");
    if (art) art.style.display = labBackground.mode === "custom" && labBackground.url ? "none" : "";
    if (labBackground.mode !== "custom" || !labBackground.url) return;

    var media;
    if (labBackground.video) {
      media = document.createElement("video");
      media.src = labBackground.url;
      media.autoplay = true;
      media.muted = true;
      media.loop = true;
      media.playsInline = true;
    } else {
      media = document.createElement("img");
      media.src = labBackground.url;
      media.alt = "";
    }
    media.className = "backdrop-art backdrop-media";
    backdrop.insertBefore(media, backdrop.querySelector(".backdrop-scrim"));
  }

  function syncBackgroundRows(appRef) {
    var select = byId("backgroundSelect");
    if (!select) return;
    select.value = labBackground.mode;
    var custom = labBackground.mode === "custom";
    ["backgroundFileRow", "backgroundBlurRow", "backgroundNoiseRow"].forEach(function (id) {
      var row = byId(id);
      if (row) row.hidden = !custom;
    });
    var name = byId("backgroundFileName");
    if (name) {
      name.textContent = labBackground.url
        ? labBackground.name || appRef.t("settings.background.custom.chosen")
        : appRef.t("settings.background.file.desc");
    }
    var remove = byId("backgroundRemove");
    if (remove) remove.hidden = !labBackground.url;
    var blur = byId("backgroundBlurRange");
    if (blur) {
      blur.value = String(labBackground.blur);
      updateRange(blur, byId("backgroundBlurValue"), function (value) {
        return value + "px";
      });
    }
    var noise = byId("backgroundNoiseRange");
    if (noise) {
      noise.value = String(labBackground.noise);
      updateRange(noise, byId("backgroundNoiseValue"), function (value) {
        return value + "%";
      });
    }
    applyLabBackground();
  }

  function pickLabBackground(appRef) {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm";
    input.style.display = "none";
    document.body.appendChild(input);
    function finish() {
      if (input.parentNode) input.parentNode.removeChild(input);
    }
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      if (!file) {
        finish();
        syncBackgroundRows(appRef);
        return;
      }
      if (labBackground.url) URL.revokeObjectURL(labBackground.url);
      labBackground.url = URL.createObjectURL(file);
      labBackground.video = file.type.indexOf("video/") === 0;
      labBackground.name = file.name;
      labBackground.mode = "custom";
      finish();
      syncBackgroundRows(appRef);
      flashSettingsSaved(appRef);
    });
    input.addEventListener("cancel", function () {
      finish();
      syncBackgroundRows(appRef);
    });
    input.click();
  }

  function updateRange(input, valueEl, formatter) {    if (!input) return;
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

    syncBackgroundRows(app);
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
        flashSettingsSaved(appRef);
      });
    }

    var motion = byId("motionToggle");
    if (motion) {
      motion.addEventListener("change", function () {
        appRef.setMotion(motion.checked);
        flashSettingsSaved(appRef);
      });
    }

    var background = byId("backgroundSelect");
    if (background) {
      background.addEventListener("change", function () {
        if (background.value === "custom") {
          pickLabBackground(appRef);
          return;
        }
        labBackground.mode = background.value;
        syncBackgroundRows(appRef);
        flashSettingsSaved(appRef);
      });
    }

    var chooseBackground = byId("backgroundChoose");
    if (chooseBackground) {
      chooseBackground.addEventListener("click", function () {
        pickLabBackground(appRef);
      });
    }

    var removeBackground = byId("backgroundRemove");
    if (removeBackground) {
      removeBackground.addEventListener("click", function () {
        if (labBackground.url) URL.revokeObjectURL(labBackground.url);
        labBackground.url = null;
        labBackground.video = false;
        labBackground.name = "";
        labBackground.mode = "art";
        syncBackgroundRows(appRef);
        flashSettingsSaved(appRef);
      });
    }

    var blurRange = byId("backgroundBlurRange");
    if (blurRange) {
      blurRange.addEventListener("input", function () {
        labBackground.blur = Number(blurRange.value);
        updateRange(blurRange, byId("backgroundBlurValue"), function (value) {
          return value + "px";
        });
        applyLabBackground();
      });
      blurRange.addEventListener("change", function () {
        flashSettingsSaved(appRef);
      });
    }

    var noiseRange = byId("backgroundNoiseRange");
    if (noiseRange) {
      noiseRange.addEventListener("input", function () {
        labBackground.noise = Number(noiseRange.value);
        updateRange(noiseRange, byId("backgroundNoiseValue"), function (value) {
          return value + "%";
        });
        applyLabBackground();
      });
      noiseRange.addEventListener("change", function () {
        flashSettingsSaved(appRef);
      });
    }

    ["autostartToggle", "closeBehavior", "minimizeOnPlay", "startMinimized", "cdnSelect", "logLevel", "timeoutInput", "proxyUrl"].forEach(function (id) {
      var control = byId(id);
      if (!control) return;
      control.addEventListener("change", function () {
        flashSettingsSaved(appRef);
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
        flashSettingsSaved(appRef);
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
        flashSettingsSaved(appRef);
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
        flashSettingsSaved(appRef);
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

  function homeSecondaryText(game, state) {
    if (state === "install") return { key: "home.action.locateGame", locate: true };
    return null;
  }

  function fileUrl(path) {
    return "file:///" + String(path).replace(/\\/g, "/");
  }

  function formatBytes(bytes) {
    var units = ["B", "KB", "MB", "GB", "TB"];
    if (!isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return Math.round(bytes) + " B";
    var value = bytes;
    var unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return value.toFixed(2) + " " + units[unit];
  }

  function driveOf(path) {
    var match = /^([A-Za-z]):/.exec(String(path).trim());
    return match ? match[1].toUpperCase() + ":" : "D:";
  }

  function mockDisk(path) {
    var gib = 1024 * 1024 * 1024;
    var presets = {
      "C:": { free: 24 * gib, total: 256 * gib },
      "D:": { free: 182 * gib, total: 512 * gib },
      "E:": { free: 720 * gib, total: 1024 * gib }
    };
    return presets[driveOf(path)] || presets["D:"];
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }

  function openInstallDialog(appRef) {
    var game = appRef.game();
    var t = appRef.t;
    var backdrop = document.createElement("div");
    backdrop.className = "install-backdrop";
    backdrop.innerHTML =
      '<div class="install-dialog" role="dialog" aria-modal="true" aria-labelledby="installTitle" tabindex="-1">' +
        '<div class="install-head">' +
          '<div class="install-head-icon">' + appRef.icon("download") + "</div>" +
          '<div class="install-head-copy">' +
            '<div class="install-title" id="installTitle"></div>' +
            '<div class="install-sub"></div>' +
          "</div>" +
          '<button class="install-close" type="button" data-install-close aria-label="' + escapeText(t("common.close")) + '">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>' +
          "</button>" +
        "</div>" +
        '<div class="install-body">' +
          '<section class="install-location">' +
            '<div class="install-label" data-install-location-label></div>' +
            '<div class="install-path-row">' +
              '<span class="install-path-icon">' + appRef.icon("folder") + "</span>" +
              '<input class="install-path-input" data-install-path spellcheck="false">' +
              '<button class="install-change" type="button" data-install-change></button>' +
            "</div>" +
          "</section>" +
          '<section class="install-storage">' +
            '<div class="install-storage-head"><span data-install-storage-label></span><span class="is-total" data-install-total></span></div>' +
            '<div class="install-storage-body">' +
              '<div class="install-bar" data-install-bar role="img">' +
                '<span class="install-bar-used" data-install-bar-used></span>' +
                '<span class="install-bar-game" data-install-bar-game></span>' +
              "</div>" +
              '<div class="install-bar-skeleton" data-install-bar-skeleton aria-hidden="true"></div>' +
              '<div class="install-legend" data-install-legend>' +
                '<span class="is-used"><i></i>' + escapeText(t("install.used")) + '<b data-install-used></b></span>' +
                '<span class="is-game"><i></i>' + escapeText(t("install.game")) + '<b data-install-game></b></span>' +
                '<span class="is-free"><i></i>' + escapeText(t("install.freeAfter")) + '<b data-install-free-after></b></span>' +
              "</div>" +
              '<div class="install-size-row">' +
                "<div><span>" + escapeText(t("install.download")) + '</span><b data-install-download></b></div>' +
                "<div><span>" + escapeText(t("install.free")) + '</span><b data-install-free></b></div>' +
              "</div>" +
            "</div>" +
          "</section>" +
          '<div class="install-warning" data-install-warning hidden>' +
            '<span data-install-warning-icon></span><span data-install-warning-text></span>' +
          "</div>" +
        "</div>" +
        '<div class="install-foot">' +
          '<a class="install-locate" href="#" data-install-locate></a>' +
          '<div class="install-actions">' +
            '<button class="install-confirm" type="button" data-install-confirm></button>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(backdrop);

    var dialog = backdrop.querySelector(".install-dialog");
    var pathInput = backdrop.querySelector("[data-install-path]");
    var bar = backdrop.querySelector("[data-install-bar]");
    var barSkeleton = backdrop.querySelector("[data-install-bar-skeleton]");
    var barUsed = backdrop.querySelector("[data-install-bar-used]");
    var barGame = backdrop.querySelector("[data-install-bar-game]");
    var legend = backdrop.querySelector("[data-install-legend]");
    var totalEl = backdrop.querySelector("[data-install-total]");
    var usedEl = backdrop.querySelector("[data-install-used]");
    var gameEl = backdrop.querySelector("[data-install-game]");
    var freeAfterEl = backdrop.querySelector("[data-install-free-after]");
    var downloadEl = backdrop.querySelector("[data-install-download]");
    var freeEl = backdrop.querySelector("[data-install-free]");
    var warning = backdrop.querySelector("[data-install-warning]");
    var warningText = backdrop.querySelector("[data-install-warning-text]");
    var confirmBtn = backdrop.querySelector("[data-install-confirm]");
    var closeBtn = backdrop.querySelector("[data-install-close]");
    var changeBtn = backdrop.querySelector("[data-install-change]");
    var locateLink = backdrop.querySelector("[data-install-locate]");

    backdrop.querySelector(".install-title").textContent = t("install.title", { game: game.name });
    backdrop.querySelector(".install-sub").textContent = t("install.subtitle");
    backdrop.querySelector("[data-install-location-label]").textContent = t("install.location");
    backdrop.querySelector("[data-install-storage-label]").textContent = t("install.storage");
    backdrop.querySelector("[data-install-warning-icon]").innerHTML = appRef.icon("alert");
    confirmBtn.textContent = t("install.confirm");
    changeBtn.textContent = t("install.change");
    locateLink.textContent = t("home.action.locateGame");
    pathInput.value = game.path;

    var state = {
      downloadBytes: null,
      disk: null,
      sizeLoading: true,
      diskLoading: true,
      error: false
    };
    var sizeTimer = null;
    var diskTimer = null;
    var closed = false;

    function setValue(element, loading, value) {
      element.innerHTML = loading ? '<span class="install-skeleton"></span>' : escapeText(value);
    }

    function render() {
      var required = state.downloadBytes === null ? game.downloadBytes : state.downloadBytes;
      var disk = state.disk;
      var used = disk ? disk.total - disk.free : 0;
      var usedPercent = disk ? (used / disk.total) * 100 : 0;
      var gamePercent = disk
        ? Math.min((required / disk.total) * 100, Math.max(0, 100 - usedPercent))
        : 0;
      var freeAfter = disk ? Math.max(0, disk.free - required) : 0;
      var missing = disk ? Math.max(0, required - disk.free) : 0;
      var ready = !state.sizeLoading && !state.diskLoading && state.downloadBytes !== null && disk !== null && !state.error;
      var enough = disk !== null && missing === 0;

      bar.className = "install-bar" + (ready && !enough ? " is-short" : "");
      bar.hidden = !ready || state.error;
      barSkeleton.hidden = ready || state.error;
      legend.hidden = state.error;
      bar.setAttribute("aria-label", t("install.storage"));
      barUsed.style.width = Math.max(0, Math.min(100, usedPercent)) + "%";
      barGame.style.left = Math.max(0, Math.min(100, usedPercent)) + "%";
      barGame.style.width = Math.max(0, Math.min(100, gamePercent)) + "%";

      if (state.diskLoading || !disk) {
        totalEl.innerHTML = '<span class="install-skeleton"></span>';
      } else {
        totalEl.textContent = t("install.drive", {
          drive: driveOf(pathInput.value),
          total: formatBytes(disk.total)
        });
      }

      setValue(usedEl, state.diskLoading, formatBytes(used));
      setValue(gameEl, state.sizeLoading, formatBytes(required));
      setValue(freeAfterEl, state.diskLoading, formatBytes(freeAfter));
      setValue(downloadEl, state.sizeLoading, formatBytes(required));
      setValue(freeEl, state.diskLoading, disk ? formatBytes(disk.free) : "—");

      warning.hidden = !state.error && !(ready && !enough);
      if (state.error) {
        warningText.textContent = t("install.spaceError");
      } else if (ready && !enough) {
        warningText.textContent =
          t("install.notEnough", { drive: driveOf(pathInput.value) }) +
          " " +
          t("install.needMore", { size: formatBytes(missing) });
      }

      confirmBtn.disabled = !(ready && enough);
      locateLink.setAttribute("href", fileUrl(pathInput.value));
    }

    function loadSize() {
      state.sizeLoading = true;
      render();
      sizeTimer = window.setTimeout(function () {
        if (closed) return;
        state.downloadBytes = game.downloadBytes;
        state.sizeLoading = false;
        render();
      }, 650);
    }

    function loadDisk() {
      state.diskLoading = true;
      state.error = false;
      render();
      if (diskTimer) window.clearTimeout(diskTimer);
      diskTimer = window.setTimeout(function () {
        if (closed) return;
        state.disk = mockDisk(pathInput.value);
        state.diskLoading = false;
        render();
      }, 420);
    }

    function close() {
      closed = true;
      if (sizeTimer) window.clearTimeout(sizeTimer);
      if (diskTimer) window.clearTimeout(diskTimer);
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    }

    function onKey(event) {
      if (event.key === "Escape") close();
    }

    pathInput.addEventListener("input", function () {
      state.diskLoading = true;
      render();
      if (diskTimer) window.clearTimeout(diskTimer);
      diskTimer = window.setTimeout(loadDisk, 240);
    });

    changeBtn.addEventListener("click", function () {
      var drives = ["D:", "E:", "C:"];
      var current = driveOf(pathInput.value);
      var index = drives.indexOf(current);
      pathInput.value = pathInput.value.replace(/^[A-Za-z]:/, drives[(index + 1) % drives.length]);
      loadDisk();
    });

    locateLink.addEventListener("click", function (event) {
      event.preventDefault();
      appRef.showToast(
        t("home.toast.folder.title"),
        t("home.toast.folder.text", { path: pathInput.value })
      );
    });

    closeBtn.addEventListener("click", close);
    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) close();
    });
    confirmBtn.addEventListener("click", function () {
      close();
      appRef.setState("downloading");
    });
    document.addEventListener("keydown", onKey);

    loadSize();
    loadDisk();
    render();
    window.setTimeout(function () {
      dialog.focus();
    }, 20);
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

    function startTimer() {
      if (newsTimer) window.clearInterval(newsTimer);
      newsTimer = window.setInterval(function () {
        showBanner((newsIndex + 1) % news.banners.length);
      }, 6000);
    }

    function step(delta) {
      showBanner((newsIndex + delta + news.banners.length) % news.banners.length);
      startTimer();
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
        '<button class="banner-nav banner-nav-prev" type="button" data-banner-prev aria-label="">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>' +
        "</button>" +
        '<button class="banner-nav banner-nav-next" type="button" data-banner-next aria-label="">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' +
        "</button>" +
        '<div class="banner-dots">' +
        news.banners
          .map(function (item, index) {
            return '<button class="banner-dot' + (index === 0 ? " is-active" : "") + '" type="button" data-banner-dot="' + index + '"></button>';
          })
          .join("") +
        "</div>";
      var prevBtn = banner.querySelector("[data-banner-prev]");
      var nextBtn = banner.querySelector("[data-banner-next]");
      if (prevBtn) prevBtn.addEventListener("click", function () {
        step(-1);
      });
      if (nextBtn) nextBtn.addEventListener("click", function () {
        step(1);
      });
      banner.querySelectorAll("[data-banner-dot]").forEach(function (dot) {
        dot.addEventListener("click", function () {
          showBanner(Number(dot.getAttribute("data-banner-dot")));
          startTimer();
        });
      });
      banner.dataset.ready = "1";
      startTimer();
    }

    var bannerPrev = banner.querySelector("[data-banner-prev]");
    var bannerNext = banner.querySelector("[data-banner-next]");
    if (bannerPrev) bannerPrev.setAttribute("aria-label", app.t("news.prev"));
    if (bannerNext) bannerNext.setAttribute("aria-label", app.t("news.next"));

    banner.querySelectorAll(".banner-slide").forEach(function (slide, index) {
      var item = news.banners[index];
      var kicker = slide.querySelector("[data-banner-kicker]");
      var title = slide.querySelector("[data-banner-title]");
      if (kicker) kicker.textContent = item.kicker[lang];
      if (title) title.textContent = item.title[lang];
    });

    banner.querySelectorAll("[data-banner-dot]").forEach(function (dot, index) {
      dot.setAttribute("aria-label", app.t("news.slide", { n: index + 1 }));
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
      var icon = primary.querySelector("[data-button-icon]");
      if (label) label.textContent = app.t(meta.primary, vars);
      if (icon) {
        if (state === "install" && window.YAYL_BADGE) {
          icon.innerHTML = "";
          icon.appendChild(window.YAYL_BADGE.create("downloading", { size: "30px" }));
        } else {
          icon.innerHTML = meta.primaryIcon === "spinner" ? '<span class="spinner"></span>' : app.icon(meta.primaryIcon);
        }
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
      if (secondaryText) {
        secondary.textContent = app.t(secondaryText.key, secondaryText.vars || {});
        secondary.setAttribute("href", secondaryText.locate ? fileUrl(game.path) : "#");
        if (secondaryText.locate) {
          secondary.setAttribute("data-locate", "1");
        } else {
          secondary.removeAttribute("data-locate");
        }
      }
    }

    var stateMenuActions = { update: "play", paused: "cancel", running: "minimize", offline: "retry" };
    document.querySelectorAll("[data-home-action]").forEach(function (item) {
      item.hidden = stateMenuActions[state] !== item.getAttribute("data-home-action");
    });

    renderNews();
  }

  pages.home = function (appRef) {
    var primary = byId("primaryAction");
    var secondary = byId("secondaryAction");

    if (primary) {
      primary.addEventListener("click", function () {
        var state = appRef.current.state;
        if (state === "install") {
          openInstallDialog(appRef);
          return;
        }
        if (state === "update") {
          appRef.setState("downloading");
          appRef.showToast(appRef.t("home.toast.launch.title"), appRef.t("home.toast.launch.text", { game: appRef.game().name }));
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
      secondary.addEventListener("click", function (event) {
        event.preventDefault();
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
          closeMenu();
          var action = item.getAttribute("data-home-action");
          if (action === "play") {
            appRef.showToast(appRef.t("home.toast.launch.title"), appRef.t("home.toast.launch.text", { game: appRef.game().name }));
            return;
          }
          if (action === "cancel") {
            appRef.setState("install");
            return;
          }
          if (action === "minimize") {
            appRef.showToast(appRef.t("home.toast.minimize.title"), appRef.t("home.toast.minimize.text"));
            return;
          }
          if (action === "retry") {
            appRef.showToast(appRef.t("home.toast.retry.title"), appRef.t("home.toast.retry.text"));
            return;
          }
          var label = item.textContent;
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
