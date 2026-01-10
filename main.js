var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CommandOverviewPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  triggerKey: "Slash",
  modifiers: {
    ctrl: true,
    shift: true,
    alt: false,
    meta: false
  },
  mode: "hold",
  selectedCommands: [],
  groupByPlugin: true
};
var VALID_TRIGGER_KEYS = [
  // Function keys
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
  // Special keys
  "Slash",
  "Backslash",
  "BracketLeft",
  "BracketRight",
  "Comma",
  "Period",
  "Semicolon",
  "Quote",
  "Backquote",
  "Minus",
  "Equal",
  "Space",
  // Letter keys
  "KeyA",
  "KeyB",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyM",
  "KeyN",
  "KeyO",
  "KeyP",
  "KeyQ",
  "KeyR",
  "KeyS",
  "KeyT",
  "KeyU",
  "KeyV",
  "KeyW",
  "KeyX",
  "KeyY",
  "KeyZ",
  // Number keys
  "Digit0",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9"
];
function isValidTriggerKey(key) {
  return VALID_TRIGGER_KEYS.includes(key);
}
var CommandOverviewPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.overlayEl = null;
    this.isOverlayVisible = false;
    this.searchInputEl = null;
    this.listEl = null;
    this.selectedIndex = 0;
    this.filteredCommands = [];
    // For proper cleanup
    this.hideTimeoutId = null;
    this.abortController = null;
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("list", "Command Overview", () => {
      this.toggleOverlay();
    });
    this.addCommand({
      id: "show-command-overview",
      name: "Show Command Overview",
      callback: () => {
        this.toggleOverlay();
      }
    });
    this.registerDomEvent(document, "keydown", this.handleKeyDown.bind(this));
    this.registerDomEvent(document, "keyup", this.handleKeyUp.bind(this));
    this.addSettingTab(new CommandOverviewSettingTab(this.app, this));
    console.log("Command Overview Plugin loaded");
  }
  onunload() {
    var _a, _b;
    if (this.hideTimeoutId !== null) {
      window.clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = null;
    }
    (_a = this.abortController) == null ? void 0 : _a.abort();
    this.abortController = null;
    (_b = this.overlayEl) == null ? void 0 : _b.remove();
    this.overlayEl = null;
    this.listEl = null;
    this.searchInputEl = null;
    this.isOverlayVisible = false;
    console.log("Command Overview Plugin unloaded");
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  handleKeyDown(evt) {
    if (this.isOverlayVisible) {
      this.handleOverlayKeyDown(evt);
      return;
    }
    if (this.matchesTrigger(evt)) {
      evt.preventDefault();
      this.showOverlay();
    }
  }
  handleOverlayKeyDown(evt) {
    const visibleItems = this.getVisibleItems();
    switch (evt.key) {
      case "ArrowDown":
        evt.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, visibleItems.length - 1);
        this.updateSelection();
        break;
      case "ArrowUp":
        evt.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        break;
      case "Enter":
        evt.preventDefault();
        this.executeSelectedCommand();
        break;
      case "Escape":
        evt.preventDefault();
        this.hideOverlay();
        break;
    }
  }
  getVisibleItems() {
    if (!this.listEl) return [];
    return Array.from(this.listEl.querySelectorAll(".command-overview-item:not(.is-hidden)"));
  }
  updateSelection() {
    const items = this.getVisibleItems();
    items.forEach((item, index) => {
      item.toggleClass("is-selected", index === this.selectedIndex);
    });
    const selectedItem = items[this.selectedIndex];
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest" });
    }
  }
  executeSelectedCommand() {
    const items = this.getVisibleItems();
    const selectedItem = items[this.selectedIndex];
    if (selectedItem) {
      const cmdId = selectedItem.dataset.commandId;
      if (cmdId) {
        this.hideOverlay();
        this.app.commands.executeCommandById(cmdId);
      }
    }
  }
  handleKeyUp(evt) {
    if (this.settings.mode === "hold" && this.isOverlayVisible) {
      if (this.isTriggerKey(evt)) {
        this.hideOverlay();
      }
    }
  }
  matchesTrigger(evt) {
    const { modifiers, triggerKey } = this.settings;
    const modifiersMatch = evt.ctrlKey === modifiers.ctrl && evt.shiftKey === modifiers.shift && evt.altKey === modifiers.alt && evt.metaKey === modifiers.meta;
    return modifiersMatch && evt.code === triggerKey;
  }
  isTriggerKey(evt) {
    return evt.code === this.settings.triggerKey;
  }
  toggleOverlay() {
    if (this.isOverlayVisible) {
      this.hideOverlay();
    } else {
      this.showOverlay();
    }
  }
  showOverlay() {
    var _a;
    if (this.isOverlayVisible) return;
    (_a = this.abortController) == null ? void 0 : _a.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.selectedIndex = 0;
    this.filteredCommands = this.getSelectedCommands();
    this.overlayEl = document.createElement("div");
    this.overlayEl.addClass("command-overview-overlay");
    const container = document.createElement("div");
    container.addClass("command-overview-container");
    const header = document.createElement("div");
    header.addClass("command-overview-header");
    const title = document.createElement("span");
    title.addClass("command-overview-title");
    title.textContent = "Command Overview";
    header.appendChild(title);
    this.searchInputEl = document.createElement("input");
    this.searchInputEl.type = "text";
    this.searchInputEl.placeholder = "Suchen...";
    this.searchInputEl.addClass("command-overview-search");
    this.searchInputEl.addEventListener("input", () => this.handleSearch(), { signal });
    header.appendChild(this.searchInputEl);
    container.appendChild(header);
    this.listEl = document.createElement("div");
    this.listEl.addClass("command-overview-list");
    this.listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".command-overview-item");
      if (item) {
        const cmdId = item.dataset.commandId;
        if (cmdId) {
          this.hideOverlay();
          this.app.commands.executeCommandById(cmdId);
        }
      }
    }, { signal });
    this.listEl.addEventListener("mouseenter", (e) => {
      const item = e.target.closest(".command-overview-item");
      if (item) {
        const items = this.getVisibleItems();
        const newIndex = items.indexOf(item);
        if (newIndex !== -1) {
          this.selectedIndex = newIndex;
          this.updateSelection();
        }
      }
    }, { signal, capture: true });
    if (this.filteredCommands.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.addClass("command-overview-empty");
      emptyMsg.textContent = "Keine Commands ausgew\xE4hlt. Gehe zu den Einstellungen.";
      this.listEl.appendChild(emptyMsg);
    } else {
      this.renderCommands();
    }
    container.appendChild(this.listEl);
    this.overlayEl.appendChild(container);
    this.overlayEl.addEventListener("click", (e) => {
      if (e.target === this.overlayEl) {
        this.hideOverlay();
      }
    }, { signal });
    document.body.appendChild(this.overlayEl);
    this.isOverlayVisible = true;
    requestAnimationFrame(() => {
      var _a2, _b;
      (_a2 = this.overlayEl) == null ? void 0 : _a2.addClass("is-visible");
      (_b = this.searchInputEl) == null ? void 0 : _b.focus();
      this.updateSelection();
    });
  }
  renderCommands() {
    if (!this.listEl) return;
    this.listEl.empty();
    if (this.settings.groupByPlugin) {
      this.renderGroupedCommands();
    } else {
      this.renderFlatCommands();
    }
  }
  renderGroupedCommands() {
    if (!this.listEl) return;
    const groups = /* @__PURE__ */ new Map();
    for (const cmd of this.filteredCommands) {
      const existing = groups.get(cmd.pluginName) || [];
      existing.push(cmd);
      groups.set(cmd.pluginName, existing);
    }
    const sortedGroups = Array.from(groups.entries()).sort(
      (a, b) => a[0].localeCompare(b[0])
    );
    let itemIndex = 0;
    for (const [pluginName, commands] of sortedGroups) {
      const groupHeader = document.createElement("div");
      groupHeader.addClass("command-overview-group");
      groupHeader.textContent = pluginName;
      groupHeader.dataset.group = pluginName;
      this.listEl.appendChild(groupHeader);
      for (const cmd of commands) {
        const item = this.createCommandItem(cmd, itemIndex);
        this.listEl.appendChild(item);
        itemIndex++;
      }
    }
  }
  renderFlatCommands() {
    if (!this.listEl) return;
    this.filteredCommands.forEach((cmd, index) => {
      var _a;
      const item = this.createCommandItem(cmd, index);
      (_a = this.listEl) == null ? void 0 : _a.appendChild(item);
    });
  }
  handleSearch() {
    if (!this.searchInputEl || !this.listEl) return;
    const query = this.searchInputEl.value.toLowerCase().trim();
    const items = this.listEl.querySelectorAll(".command-overview-item");
    const groups = this.listEl.querySelectorAll(".command-overview-group");
    items.forEach((item) => {
      var _a, _b, _c, _d;
      const name = ((_b = (_a = item.querySelector(".command-overview-name")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.toLowerCase()) || "";
      const hotkey = ((_d = (_c = item.querySelector(".command-overview-hotkey")) == null ? void 0 : _c.textContent) == null ? void 0 : _d.toLowerCase()) || "";
      const matches = name.includes(query) || hotkey.includes(query);
      item.toggleClass("is-hidden", !matches);
    });
    groups.forEach((group) => {
      const groupName = group.dataset.group;
      let nextSibling = group.nextElementSibling;
      let hasVisibleItems = false;
      while (nextSibling && !nextSibling.hasClass("command-overview-group")) {
        if (!nextSibling.hasClass("is-hidden")) {
          hasVisibleItems = true;
        }
        nextSibling = nextSibling.nextElementSibling;
      }
      group.toggleClass("is-hidden", !hasVisibleItems);
    });
    this.selectedIndex = 0;
    this.updateSelection();
  }
  hideOverlay() {
    var _a;
    if (!this.overlayEl) return;
    (_a = this.abortController) == null ? void 0 : _a.abort();
    this.abortController = null;
    this.overlayEl.removeClass("is-visible");
    if (this.hideTimeoutId !== null) {
      window.clearTimeout(this.hideTimeoutId);
    }
    this.hideTimeoutId = window.setTimeout(() => {
      var _a2;
      (_a2 = this.overlayEl) == null ? void 0 : _a2.remove();
      this.overlayEl = null;
      this.listEl = null;
      this.searchInputEl = null;
      this.isOverlayVisible = false;
      this.hideTimeoutId = null;
    }, 150);
  }
  createCommandItem(cmd, index) {
    const item = document.createElement("div");
    item.addClass("command-overview-item");
    item.dataset.commandId = cmd.command.id;
    if (index === 0) {
      item.addClass("is-selected");
    }
    const info = document.createElement("div");
    info.addClass("command-overview-info");
    const name = document.createElement("span");
    name.addClass("command-overview-name");
    name.textContent = cmd.command.name;
    info.appendChild(name);
    item.appendChild(info);
    const hotkey = document.createElement("span");
    hotkey.addClass("command-overview-hotkey");
    hotkey.textContent = cmd.hotkey || "Kein Shortcut";
    item.appendChild(hotkey);
    return item;
  }
  getSelectedCommands() {
    var _a, _b;
    const allCommands = this.app.commands.commands;
    const hotkeys = ((_a = this.app.hotkeyManager) == null ? void 0 : _a.customKeys) || {};
    const defaultHotkeys = ((_b = this.app.hotkeyManager) == null ? void 0 : _b.defaultKeys) || {};
    const result = [];
    for (const cmdId of this.settings.selectedCommands) {
      const command = allCommands[cmdId];
      if (command) {
        const hotkeyData = hotkeys[cmdId] || defaultHotkeys[cmdId] || [];
        const hotkeyStr = this.formatHotkey(hotkeyData[0]);
        const pluginName = this.getPluginName(cmdId);
        result.push({ command, hotkey: hotkeyStr, pluginName });
      }
    }
    result.sort((a, b) => {
      const pluginCompare = a.pluginName.localeCompare(b.pluginName);
      if (pluginCompare !== 0) return pluginCompare;
      return a.command.name.localeCompare(b.command.name);
    });
    return result;
  }
  getPluginName(commandId) {
    var _a, _b, _c;
    const parts = commandId.split(":");
    if (parts.length >= 2) {
      const pluginId = parts[0];
      const plugin = (_b = (_a = this.app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b[pluginId];
      if ((_c = plugin == null ? void 0 : plugin.manifest) == null ? void 0 : _c.name) {
        return plugin.manifest.name;
      }
      return pluginId.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    }
    return "Obsidian";
  }
  formatHotkey(hotkey) {
    if (!hotkey) return "";
    const parts = [];
    if (hotkey.modifiers) {
      if (hotkey.modifiers.includes("Ctrl") || hotkey.modifiers.includes("Mod")) parts.push("Ctrl");
      if (hotkey.modifiers.includes("Shift")) parts.push("Shift");
      if (hotkey.modifiers.includes("Alt")) parts.push("Alt");
      if (hotkey.modifiers.includes("Meta")) parts.push("Cmd");
    }
    if (hotkey.key) parts.push(hotkey.key);
    return parts.join(" + ");
  }
  getAllCommands() {
    return Object.values(this.app.commands.commands);
  }
};
var CommandOverviewSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.searchQuery = "";
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Command Overview Einstellungen" });
    new import_obsidian.Setting(containerEl).setName("Modus").setDesc("Hold: Overlay sichtbar solange Taste gedr\xFCckt. Toggle: Ein/Aus per Tastendruck.").addDropdown((dropdown) => dropdown.addOption("hold", "Hold (gedr\xFCckt halten)").addOption("toggle", "Toggle (ein/aus)").setValue(this.plugin.settings.mode).onChange(async (value) => {
      this.plugin.settings.mode = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Nach Plugin gruppieren").setDesc("Commands im Overlay nach Plugin gruppieren.").addToggle((toggle) => toggle.setValue(this.plugin.settings.groupByPlugin).onChange(async (value) => {
      this.plugin.settings.groupByPlugin = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Trigger-Taste").setDesc("Die Taste die das Overlay \xF6ffnet (z.B. Slash, F1, KeyK). G\xFCltige Werte: F1-F12, KeyA-KeyZ, Digit0-9, Slash, Space, etc.").addText((text) => text.setPlaceholder("Slash").setValue(this.plugin.settings.triggerKey).onChange(async (value) => {
      const trimmed = value.trim();
      if (isValidTriggerKey(trimmed)) {
        this.plugin.settings.triggerKey = trimmed;
        await this.plugin.saveSettings();
      } else if (trimmed.length > 0) {
        text.setValue(this.plugin.settings.triggerKey);
      }
    }));
    containerEl.createEl("h3", { text: "Modifier-Tasten" });
    new import_obsidian.Setting(containerEl).setName("Ctrl").addToggle((toggle) => toggle.setValue(this.plugin.settings.modifiers.ctrl).onChange(async (value) => {
      this.plugin.settings.modifiers.ctrl = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Shift").addToggle((toggle) => toggle.setValue(this.plugin.settings.modifiers.shift).onChange(async (value) => {
      this.plugin.settings.modifiers.shift = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Alt").addToggle((toggle) => toggle.setValue(this.plugin.settings.modifiers.alt).onChange(async (value) => {
      this.plugin.settings.modifiers.alt = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Meta (Cmd/Win)").addToggle((toggle) => toggle.setValue(this.plugin.settings.modifiers.meta).onChange(async (value) => {
      this.plugin.settings.modifiers.meta = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Commands ausw\xE4hlen" });
    const searchContainer = containerEl.createDiv("command-search-settings");
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      placeholder: "Commands durchsuchen...",
      cls: "command-search-input"
    });
    const commandsContainer = containerEl.createDiv("command-selection-container");
    const allCommands = this.plugin.getAllCommands();
    allCommands.sort((a, b) => a.name.localeCompare(b.name));
    const renderCommands = (filter) => {
      commandsContainer.empty();
      const filtered = filter ? allCommands.filter((cmd) => cmd.name.toLowerCase().includes(filter.toLowerCase()) || cmd.id.toLowerCase().includes(filter.toLowerCase())) : allCommands;
      for (const cmd of filtered) {
        new import_obsidian.Setting(commandsContainer).setName(cmd.name).setDesc(cmd.id).addToggle((toggle) => toggle.setValue(this.plugin.settings.selectedCommands.includes(cmd.id)).onChange(async (value) => {
          if (value) {
            if (!this.plugin.settings.selectedCommands.includes(cmd.id)) {
              this.plugin.settings.selectedCommands.push(cmd.id);
            }
          } else {
            this.plugin.settings.selectedCommands = this.plugin.settings.selectedCommands.filter((id) => id !== cmd.id);
          }
          await this.plugin.saveSettings();
        }));
      }
    };
    searchInput.addEventListener("input", (e) => {
      const target = e.target;
      renderCommands(target.value);
    });
    renderCommands("");
  }
};
