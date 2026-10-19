import { App, Command, Notice, Platform, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Extended type definitions for undocumented Obsidian APIs
interface HotkeyInfo {
	modifiers: string[];
	key: string;
}

interface CommandManager {
	commands: Record<string, Command>;
	executeCommandById(id: string): boolean;
}

interface HotkeyManager {
	customKeys: Record<string, HotkeyInfo[]>;
	defaultKeys: Record<string, HotkeyInfo[]>;
}

interface PluginManifest {
	name: string;
	id: string;
	version: string;
}

interface LoadedPlugin {
	manifest: PluginManifest;
}

interface PluginManager {
	plugins: Record<string, LoadedPlugin>;
}

interface ExtendedApp extends App {
	commands: CommandManager;
	hotkeyManager?: HotkeyManager;
	plugins?: PluginManager;
}

interface CommandOverviewSettings {
	triggerKey: string;
	modifiers: {
		ctrl: boolean;
		shift: boolean;
		alt: boolean;
		meta: boolean;
	};
	mode: 'hold' | 'toggle';
	selectedCommands: string[];
	groupByPlugin: boolean;
}

interface CommandWithHotkey {
	command: Command;
	hotkey: string;
	pluginName: string;
}

const DEFAULT_SETTINGS: CommandOverviewSettings = {
	triggerKey: 'Slash',
	modifiers: {
		ctrl: true,
		shift: true,
		alt: false,
		meta: false
	},
	mode: 'hold',
	selectedCommands: [],
	groupByPlugin: true
};

// Valid trigger keys whitelist for security
const VALID_TRIGGER_KEYS = [
	// Function keys
	'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
	// Special keys
	'Slash', 'Backslash', 'BracketLeft', 'BracketRight', 'Comma', 'Period',
	'Semicolon', 'Quote', 'Backquote', 'Minus', 'Equal', 'Space',
	// Letter keys
	'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyE', 'KeyF', 'KeyG', 'KeyH', 'KeyI',
	'KeyJ', 'KeyK', 'KeyL', 'KeyM', 'KeyN', 'KeyO', 'KeyP', 'KeyQ', 'KeyR',
	'KeyS', 'KeyT', 'KeyU', 'KeyV', 'KeyW', 'KeyX', 'KeyY', 'KeyZ',
	// Number keys
	'Digit0', 'Digit1', 'Digit2', 'Digit3', 'Digit4',
	'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9',
];

/**
 * Validates if a trigger key is in the allowed whitelist
 */
function isValidTriggerKey(key: string): boolean {
	return VALID_TRIGGER_KEYS.includes(key);
}

export default class CommandOverviewPlugin extends Plugin {
	settings: CommandOverviewSettings;
	overlayEl: HTMLElement | null = null;
	isOverlayVisible: boolean = false;
	searchInputEl: HTMLInputElement | null = null;
	listEl: HTMLElement | null = null;
	selectedIndex: number = 0;
	filteredCommands: CommandWithHotkey[] = [];
	// For proper cleanup
	private hideTimeoutId: number | null = null;
	private closingOverlayEl: HTMLElement | null = null;
	private abortController: AbortController | null = null;
	// Im Hold-Modus per Trigger geöffnet: Loslassen der Trigger-Taste schließt das Overlay
	private isHeldOpen = false;

	/**
	 * Get the app with extended type information for undocumented APIs
	 */
	private get extendedApp(): ExtendedApp {
		return this.app as ExtendedApp;
	}

	async onload() {
		await this.loadSettings();

		// Ribbon Icon hinzufügen
		this.addRibbonIcon('list', 'Command overview', () => {
			this.toggleOverlay();
		});

		// Command registrieren
		this.addCommand({
			id: 'show-command-overview',
			name: 'Show command overview',
			callback: () => {
				this.toggleOverlay();
			}
		});

		// Keyboard Event Listener
		this.registerDomEvent(document, 'keydown', this.handleKeyDown.bind(this));
		this.registerDomEvent(document, 'keyup', this.handleKeyUp.bind(this));

		// Settings Tab
		this.addSettingTab(new CommandOverviewSettingTab(this.app, this));

	}

	onunload() {
		// Clean up pending hide timeout and a fading-out overlay
		this.removeClosingOverlay();
		// Abort any pending event listeners
		this.abortController?.abort();
		this.abortController = null;
		// Remove overlay immediately
		this.overlayEl?.remove();
		this.overlayEl = null;
		this.listEl = null;
		this.searchInputEl = null;
		this.isOverlayVisible = false;
		this.isHeldOpen = false;
	}

	async loadSettings() {
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// Verschachtelte Werte kopieren, damit DEFAULT_SETTINGS nicht mitverändert wird
		this.settings.modifiers = Object.assign({}, DEFAULT_SETTINGS.modifiers, data?.modifiers);
		this.settings.selectedCommands = Array.isArray(data?.selectedCommands) ? [...data.selectedCommands] : [];
		// Manuell bearbeitete oder beschädigte data.json abfangen
		if (!isValidTriggerKey(this.settings.triggerKey)) {
			this.settings.triggerKey = DEFAULT_SETTINGS.triggerKey;
		}
		if (this.settings.mode !== 'hold' && this.settings.mode !== 'toggle') {
			this.settings.mode = DEFAULT_SETTINGS.mode;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	handleKeyDown(evt: KeyboardEvent) {
		const isTrigger = this.matchesTrigger(evt);

		// Wenn Overlay offen ist, Keyboard-Navigation
		if (this.isOverlayVisible) {
			if (isTrigger) {
				// Trigger erneut gedrückt: Toggle schließt, Hold schließt beim Loslassen.
				// Auto-Repeat (gehaltene Taste) wird ignoriert.
				evt.preventDefault();
				if (!evt.repeat) {
					if (this.settings.mode === 'toggle') {
						this.hideOverlay();
					} else {
						this.isHeldOpen = true;
					}
				}
				return;
			}
			this.handleOverlayKeyDown(evt);
			return;
		}

		if (isTrigger) {
			evt.preventDefault();
			// Auto-Repeat öffnet nicht erneut (z. B. nach Escape bei gehaltener Taste)
			if (!evt.repeat) {
				this.showOverlay();
				this.isHeldOpen = this.settings.mode === 'hold';
			}
		}
	}

	handleOverlayKeyDown(evt: KeyboardEvent) {
		// Enter bestätigt während einer IME-Eingabe nur die Komposition
		if (evt.isComposing) return;

		const visibleItems = this.getVisibleItems();

		switch (evt.key) {
			case 'ArrowDown':
				evt.preventDefault();
				this.selectedIndex = Math.min(this.selectedIndex + 1, visibleItems.length - 1);
				this.updateSelection();
				break;
			case 'ArrowUp':
				evt.preventDefault();
				this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
				this.updateSelection();
				break;
			case 'Enter':
				evt.preventDefault();
				this.executeSelectedCommand();
				break;
			case 'Escape':
				evt.preventDefault();
				this.hideOverlay();
				break;
		}
	}

	getVisibleItems(): HTMLElement[] {
		if (!this.listEl) return [];
		return Array.from(this.listEl.querySelectorAll('.command-overview-item:not(.is-hidden)'));
	}

	updateSelection() {
		const items = this.getVisibleItems();
		items.forEach((item, index) => {
			item.toggleClass('is-selected', index === this.selectedIndex);
		});

		// Scroll into view
		const selectedItem = items[this.selectedIndex];
		if (selectedItem) {
			selectedItem.scrollIntoView({ block: 'nearest' });
		}
	}

	executeSelectedCommand() {
		const items = this.getVisibleItems();
		const selectedItem = items[this.selectedIndex];
		if (selectedItem) {
			const cmdId = selectedItem.dataset.commandId;
			if (cmdId) {
				this.runCommand(cmdId);
			}
		}
	}

	/**
	 * Schließt das Overlay und führt den Command aus.
	 * Obsidian liefert false, wenn der Command fehlt oder beim Ausführen einen Fehler wirft.
	 */
	private runCommand(cmdId: string) {
		this.hideOverlay();
		const commands = this.extendedApp.commands;
		if (!commands.executeCommandById(cmdId)) {
			const name = commands.commands[cmdId]?.name ?? cmdId;
			new Notice(`Command "${name}" konnte nicht ausgeführt werden.`);
		}
	}

	handleKeyUp(evt: KeyboardEvent) {
		// Nur schließen, wenn das Overlay per gehaltenem Trigger offen ist, nicht beim
		// Tippen der Trigger-Taste in die Suche (Öffnen per Ribbon oder Command)
		if (this.isHeldOpen && this.isOverlayVisible && this.isTriggerKey(evt)) {
			this.hideOverlay();
		}
	}

	matchesTrigger(evt: KeyboardEvent): boolean {
		const { modifiers, triggerKey } = this.settings;

		const modifiersMatch =
			evt.ctrlKey === modifiers.ctrl &&
			evt.shiftKey === modifiers.shift &&
			evt.altKey === modifiers.alt &&
			evt.metaKey === modifiers.meta;

		return modifiersMatch && evt.code === triggerKey;
	}

	isTriggerKey(evt: KeyboardEvent): boolean {
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
		if (this.isOverlayVisible) return;

		// Ein noch ausblendendes Overlay sofort entfernen
		this.removeClosingOverlay();
		this.isHeldOpen = false;

		// Create new AbortController for this overlay instance
		this.abortController?.abort();
		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		this.selectedIndex = 0;
		this.filteredCommands = this.getSelectedCommands();

		const overlayEl = document.createElement('div');
		overlayEl.addClass('command-overview-overlay');
		this.overlayEl = overlayEl;

		const container = document.createElement('div');
		container.addClass('command-overview-container');

		// Header mit Suche
		const header = document.createElement('div');
		header.addClass('command-overview-header');

		const title = document.createElement('span');
		title.addClass('command-overview-title');
		title.textContent = 'Command overview';
		header.appendChild(title);

		// Suchfeld
		this.searchInputEl = document.createElement('input');
		this.searchInputEl.type = 'text';
		this.searchInputEl.placeholder = 'Suchen...';
		this.searchInputEl.addClass('command-overview-search');
		this.searchInputEl.addEventListener('input', () => this.handleSearch(), { signal });
		header.appendChild(this.searchInputEl);

		container.appendChild(header);

		// Liste
		this.listEl = document.createElement('div');
		this.listEl.addClass('command-overview-list');

		// Event delegation for click and mouseenter on list items
		this.listEl.addEventListener('click', (e) => {
			const item = (e.target as HTMLElement).closest('.command-overview-item') as HTMLElement;
			if (item) {
				const cmdId = item.dataset.commandId;
				if (cmdId) {
					this.runCommand(cmdId);
				}
			}
		}, { signal });

		this.listEl.addEventListener('mouseenter', (e) => {
			const item = (e.target as HTMLElement).closest('.command-overview-item') as HTMLElement;
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
			const emptyMsg = document.createElement('div');
			emptyMsg.addClass('command-overview-empty');
			emptyMsg.textContent = 'Keine Commands ausgewählt. Gehe zu den Einstellungen.';
			this.listEl.appendChild(emptyMsg);
		} else {
			this.renderCommands();
		}

		container.appendChild(this.listEl);
		overlayEl.appendChild(container);

		// Click außerhalb schließt Overlay
		overlayEl.addEventListener('click', (e) => {
			if (e.target === overlayEl) {
				this.hideOverlay();
			}
		}, { signal });

		document.body.appendChild(overlayEl);
		this.isOverlayVisible = true;

		// Animation und Focus
		requestAnimationFrame(() => {
			// Vor dem ersten Frame wieder geschlossen (z. B. kurzer Tastendruck im Hold-Modus)
			if (this.overlayEl !== overlayEl) return;
			overlayEl.addClass('is-visible');
			this.searchInputEl?.focus();
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

		// Gruppiere nach Plugin
		const groups = new Map<string, CommandWithHotkey[]>();

		for (const cmd of this.filteredCommands) {
			const existing = groups.get(cmd.pluginName) || [];
			existing.push(cmd);
			groups.set(cmd.pluginName, existing);
		}

		// Sortiere Gruppen alphabetisch
		const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
			a[0].localeCompare(b[0])
		);

		let itemIndex = 0;
		for (const [pluginName, commands] of sortedGroups) {
			// Gruppe Header
			const groupHeader = document.createElement('div');
			groupHeader.addClass('command-overview-group');
			groupHeader.textContent = pluginName;
			groupHeader.dataset.group = pluginName;
			this.listEl.appendChild(groupHeader);

			// Commands in der Gruppe
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
			const item = this.createCommandItem(cmd, index);
			this.listEl?.appendChild(item);
		});
	}

	handleSearch() {
		if (!this.searchInputEl || !this.listEl) return;

		const query = this.searchInputEl.value.toLowerCase().trim();
		const items = this.listEl.querySelectorAll('.command-overview-item');
		const groups = this.listEl.querySelectorAll('.command-overview-group');

		// Verstecke/zeige Items basierend auf Suche
		items.forEach((item) => {
			const name = item.querySelector('.command-overview-name')?.textContent?.toLowerCase() || '';
			const hotkey = item.querySelector('.command-overview-hotkey')?.textContent?.toLowerCase() || '';
			const matches = name.includes(query) || hotkey.includes(query);
			(item as HTMLElement).toggleClass('is-hidden', !matches);
		});

		// Verstecke leere Gruppen
		groups.forEach((group) => {
			let nextSibling = group.nextElementSibling;
			let hasVisibleItems = false;

			while (nextSibling && !nextSibling.hasClass('command-overview-group')) {
				if (!nextSibling.hasClass('is-hidden')) {
					hasVisibleItems = true;
				}
				nextSibling = nextSibling.nextElementSibling;
			}

			(group as HTMLElement).toggleClass('is-hidden', !hasVisibleItems);
		});

		// Reset Selection
		this.selectedIndex = 0;
		this.updateSelection();
	}

	hideOverlay() {
		const overlayEl = this.overlayEl;
		if (!overlayEl) return;

		// Abort all event listeners attached to overlay elements
		this.abortController?.abort();
		this.abortController = null;

		// Zustand sofort zurücksetzen: Während der Ausblend-Animation darf das Overlay
		// keine Tasten mehr abfangen (sonst z. B. doppelte Ausführung per Enter) und
		// muss sich sofort wieder öffnen lassen.
		this.overlayEl = null;
		this.listEl = null;
		this.searchInputEl = null;
		this.isOverlayVisible = false;
		this.isHeldOpen = false;

		this.removeClosingOverlay();
		overlayEl.removeClass('is-visible');
		this.closingOverlayEl = overlayEl;
		this.hideTimeoutId = window.setTimeout(() => {
			overlayEl.remove();
			this.closingOverlayEl = null;
			this.hideTimeoutId = null;
		}, 150);
	}

	/**
	 * Entfernt ein noch ausblendendes Overlay sofort und bricht dessen Timer ab.
	 */
	private removeClosingOverlay() {
		if (this.hideTimeoutId !== null) {
			window.clearTimeout(this.hideTimeoutId);
			this.hideTimeoutId = null;
		}
		this.closingOverlayEl?.remove();
		this.closingOverlayEl = null;
	}

	createCommandItem(cmd: CommandWithHotkey, index: number): HTMLElement {
		const item = document.createElement('div');
		item.addClass('command-overview-item');
		item.dataset.commandId = cmd.command.id;

		if (index === 0) {
			item.addClass('is-selected');
		}

		const info = document.createElement('div');
		info.addClass('command-overview-info');

		const name = document.createElement('span');
		name.addClass('command-overview-name');
		name.textContent = cmd.command.name;
		info.appendChild(name);

		item.appendChild(info);

		const hotkey = document.createElement('span');
		hotkey.addClass('command-overview-hotkey');
		hotkey.textContent = cmd.hotkey || 'Kein Shortcut';
		item.appendChild(hotkey);

		// Note: Click and mouseenter events are handled via event delegation on listEl
		// This prevents memory leaks from individual event listeners on each item

		return item;
	}

	getSelectedCommands(): CommandWithHotkey[] {
		const allCommands = this.extendedApp.commands.commands;
		const hotkeys = this.extendedApp.hotkeyManager?.customKeys || {};
		const defaultHotkeys = this.extendedApp.hotkeyManager?.defaultKeys || {};

		const result: CommandWithHotkey[] = [];

		for (const cmdId of this.settings.selectedCommands) {
			const command = allCommands[cmdId];
			if (command) {
				const hotkeyData = hotkeys[cmdId] || defaultHotkeys[cmdId] || [];
				const hotkeyStr = this.formatHotkey(hotkeyData[0]);
				const pluginName = this.getPluginName(cmdId);
				result.push({ command, hotkey: hotkeyStr, pluginName });
			}
		}

		// Sortiere nach Plugin-Name, dann Command-Name
		result.sort((a, b) => {
			const pluginCompare = a.pluginName.localeCompare(b.pluginName);
			if (pluginCompare !== 0) return pluginCompare;
			return a.command.name.localeCompare(b.command.name);
		});

		return result;
	}

	getPluginName(commandId: string): string {
		// Command IDs sind oft "plugin-id:command-name"
		const parts = commandId.split(':');
		if (parts.length >= 2) {
			const pluginId = parts[0];
			// Versuche Plugin-Name zu finden
			const plugin = this.extendedApp.plugins?.plugins?.[pluginId];
			if (plugin?.manifest?.name) {
				return plugin.manifest.name;
			}
			// Fallback: Formatiere Plugin-ID
			return pluginId
				.split('-')
				.map(word => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ');
		}
		return 'Obsidian';
	}

	formatHotkey(hotkey: HotkeyInfo | undefined): string {
		if (!hotkey) return '';

		const parts: string[] = [];
		const modifiers = hotkey.modifiers ?? [];
		// "Mod" ist unter macOS die Cmd-Taste, sonst Ctrl
		const isMac = Platform.isMacOS;
		const hasMod = modifiers.includes('Mod');
		if (modifiers.includes('Ctrl') || (hasMod && !isMac)) parts.push('Ctrl');
		if (modifiers.includes('Shift')) parts.push('Shift');
		if (modifiers.includes('Alt')) parts.push('Alt');
		if (modifiers.includes('Meta') || (hasMod && isMac)) parts.push(isMac ? 'Cmd' : 'Win');
		if (hotkey.key) parts.push(hotkey.key);

		return parts.join(' + ');
	}

	getAllCommands(): Command[] {
		return Object.values(this.extendedApp.commands.commands);
	}
}

class CommandOverviewSettingTab extends PluginSettingTab {
	plugin: CommandOverviewPlugin;
	searchQuery: string = '';

	constructor(app: App, plugin: CommandOverviewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Modus Auswahl
		new Setting(containerEl)
			.setName('Modus')
			.setDesc('Hold: Overlay sichtbar solange Taste gedrückt. Toggle: Ein/Aus per Tastendruck.')
			.addDropdown(dropdown => dropdown
				.addOption('hold', 'Hold (gedrückt halten)')
				.addOption('toggle', 'Toggle (ein/aus)')
				.setValue(this.plugin.settings.mode)
				.onChange(async (value: 'hold' | 'toggle') => {
					this.plugin.settings.mode = value;
					await this.plugin.saveSettings();
				}));

		// Gruppierung
		new Setting(containerEl)
			.setName('Nach Plugin gruppieren')
			.setDesc('Commands im Overlay nach Plugin gruppieren.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.groupByPlugin)
				.onChange(async (value) => {
					this.plugin.settings.groupByPlugin = value;
					await this.plugin.saveSettings();
				}));

		// Trigger Key
		new Setting(containerEl)
			.setName('Trigger-Taste')
			.setDesc('Die Taste die das Overlay öffnet (z.B. Slash, F1, KeyK). Gültige Werte: F1-F12, KeyA-KeyZ, Digit0-9, Slash, Space, etc.')
			.addText(text => {
				text
					.setPlaceholder('Slash')
					.setValue(this.plugin.settings.triggerKey)
					.onChange(async (value) => {
						const trimmed = value.trim();
						const isValid = isValidTriggerKey(trimmed);
						// Ungültige Zwischenstände beim Tippen (z. B. "Ke" auf dem Weg zu "KeyK")
						// nur markieren; gespeichert werden ausschließlich gültige Werte
						text.inputEl.toggleClass('is-invalid', !isValid && trimmed.length > 0);
						if (isValid) {
							this.plugin.settings.triggerKey = trimmed;
							await this.plugin.saveSettings();
						}
					});
				text.inputEl.addClass('command-overview-settings-trigger-input');
				// Beim Verlassen des Feldes einen ungültigen Wert auf den gespeicherten zurücksetzen
				text.inputEl.addEventListener('blur', () => {
					const trimmed = text.getValue().trim();
					if (isValidTriggerKey(trimmed)) return;
					if (trimmed.length > 0) {
						new Notice(`Ungültige Trigger-Taste "${trimmed}". Der bisherige Wert bleibt aktiv.`);
					}
					text.setValue(this.plugin.settings.triggerKey);
					text.inputEl.removeClass('is-invalid');
				});
			});

		// Modifiers
		new Setting(containerEl).setName('Modifier-Tasten').setHeading();

		new Setting(containerEl)
			.setName('Ctrl')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modifiers.ctrl)
				.onChange(async (value) => {
					this.plugin.settings.modifiers.ctrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Shift')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modifiers.shift)
				.onChange(async (value) => {
					this.plugin.settings.modifiers.shift = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Alt')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modifiers.alt)
				.onChange(async (value) => {
					this.plugin.settings.modifiers.alt = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Meta (Cmd/Win)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.modifiers.meta)
				.onChange(async (value) => {
					this.plugin.settings.modifiers.meta = value;
					await this.plugin.saveSettings();
				}));

		// Command Auswahl
		new Setting(containerEl).setName('Commands auswählen').setHeading();

		// Suchfeld für Settings
		const searchContainer = containerEl.createDiv('command-overview-settings-search');
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Commands durchsuchen...',
			cls: 'command-overview-settings-search-input'
		});

		const commandsContainer = containerEl.createDiv('command-overview-settings-list');

		const allCommands = this.plugin.getAllCommands();
		allCommands.sort((a, b) => a.name.localeCompare(b.name));

		const renderCommands = (filter: string) => {
			commandsContainer.empty();
			const filtered = filter
				? allCommands.filter(cmd =>
					cmd.name.toLowerCase().includes(filter.toLowerCase()) ||
					cmd.id.toLowerCase().includes(filter.toLowerCase()))
				: allCommands;

			for (const cmd of filtered) {
				new Setting(commandsContainer)
					.setName(cmd.name)
					.setDesc(cmd.id)
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.selectedCommands.includes(cmd.id))
						.onChange(async (value) => {
							if (value) {
								if (!this.plugin.settings.selectedCommands.includes(cmd.id)) {
									this.plugin.settings.selectedCommands.push(cmd.id);
								}
							} else {
								this.plugin.settings.selectedCommands =
									this.plugin.settings.selectedCommands.filter(id => id !== cmd.id);
							}
							await this.plugin.saveSettings();
						}));
			}
		};

		searchInput.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			renderCommands(target.value);
		});

		renderCommands('');
	}
}
