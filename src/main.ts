import { App, Plugin, PluginSettingTab, Setting, Command } from 'obsidian';

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
	private abortController: AbortController | null = null;

	async onload() {
		await this.loadSettings();

		// Ribbon Icon hinzufügen
		this.addRibbonIcon('list', 'Command Overview', () => {
			this.toggleOverlay();
		});

		// Command registrieren
		this.addCommand({
			id: 'show-command-overview',
			name: 'Show Command Overview',
			callback: () => {
				this.toggleOverlay();
			}
		});

		// Keyboard Event Listener
		this.registerDomEvent(document, 'keydown', this.handleKeyDown.bind(this));
		this.registerDomEvent(document, 'keyup', this.handleKeyUp.bind(this));

		// Settings Tab
		this.addSettingTab(new CommandOverviewSettingTab(this.app, this));

		console.log('Command Overview Plugin loaded');
	}

	onunload() {
		// Clean up any pending timeouts
		if (this.hideTimeoutId !== null) {
			window.clearTimeout(this.hideTimeoutId);
			this.hideTimeoutId = null;
		}
		// Abort any pending event listeners
		this.abortController?.abort();
		this.abortController = null;
		// Remove overlay immediately
		this.overlayEl?.remove();
		this.overlayEl = null;
		this.listEl = null;
		this.searchInputEl = null;
		this.isOverlayVisible = false;
		console.log('Command Overview Plugin unloaded');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	handleKeyDown(evt: KeyboardEvent) {
		// Wenn Overlay offen ist, Keyboard-Navigation
		if (this.isOverlayVisible) {
			this.handleOverlayKeyDown(evt);
			return;
		}

		if (this.matchesTrigger(evt)) {
			evt.preventDefault();
			this.showOverlay();
		}
	}

	handleOverlayKeyDown(evt: KeyboardEvent) {
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
				this.hideOverlay();
				// @ts-ignore
				this.app.commands.executeCommandById(cmdId);
			}
		}
	}

	handleKeyUp(evt: KeyboardEvent) {
		if (this.settings.mode === 'hold' && this.isOverlayVisible) {
			if (this.isTriggerKey(evt)) {
				this.hideOverlay();
			}
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

		// Create new AbortController for this overlay instance
		this.abortController?.abort();
		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		this.selectedIndex = 0;
		this.filteredCommands = this.getSelectedCommands();

		this.overlayEl = document.createElement('div');
		this.overlayEl.addClass('command-overview-overlay');

		const container = document.createElement('div');
		container.addClass('command-overview-container');

		// Header mit Suche
		const header = document.createElement('div');
		header.addClass('command-overview-header');

		const title = document.createElement('span');
		title.addClass('command-overview-title');
		title.textContent = 'Command Overview';
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
					this.hideOverlay();
					// @ts-ignore
					this.app.commands.executeCommandById(cmdId);
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
		this.overlayEl.appendChild(container);

		// Click außerhalb schließt Overlay
		this.overlayEl.addEventListener('click', (e) => {
			if (e.target === this.overlayEl) {
				this.hideOverlay();
			}
		}, { signal });

		document.body.appendChild(this.overlayEl);
		this.isOverlayVisible = true;

		// Animation und Focus
		requestAnimationFrame(() => {
			this.overlayEl?.addClass('is-visible');
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
			const groupName = (group as HTMLElement).dataset.group;
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
		if (!this.overlayEl) return;

		// Abort all event listeners attached to overlay elements
		this.abortController?.abort();
		this.abortController = null;

		this.overlayEl.removeClass('is-visible');

		// Clear any pending hide timeout
		if (this.hideTimeoutId !== null) {
			window.clearTimeout(this.hideTimeoutId);
		}

		this.hideTimeoutId = window.setTimeout(() => {
			this.overlayEl?.remove();
			this.overlayEl = null;
			this.listEl = null;
			this.searchInputEl = null;
			this.isOverlayVisible = false;
			this.hideTimeoutId = null;
		}, 150);
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
		// @ts-ignore
		const allCommands: Record<string, Command> = this.app.commands.commands;
		// @ts-ignore
		const hotkeys = this.app.hotkeyManager?.customKeys || {};
		// @ts-ignore
		const defaultHotkeys = this.app.hotkeyManager?.defaultKeys || {};

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
			// @ts-ignore
			const plugin = this.app.plugins?.plugins?.[pluginId];
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

	formatHotkey(hotkey: any): string {
		if (!hotkey) return '';

		const parts: string[] = [];
		if (hotkey.modifiers) {
			if (hotkey.modifiers.includes('Ctrl') || hotkey.modifiers.includes('Mod')) parts.push('Ctrl');
			if (hotkey.modifiers.includes('Shift')) parts.push('Shift');
			if (hotkey.modifiers.includes('Alt')) parts.push('Alt');
			if (hotkey.modifiers.includes('Meta')) parts.push('Cmd');
		}
		if (hotkey.key) parts.push(hotkey.key);

		return parts.join(' + ');
	}

	getAllCommands(): Command[] {
		// @ts-ignore
		return Object.values(this.app.commands.commands);
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

		containerEl.createEl('h2', { text: 'Command Overview Einstellungen' });

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
			.addText(text => text
				.setPlaceholder('Slash')
				.setValue(this.plugin.settings.triggerKey)
				.onChange(async (value) => {
					const trimmed = value.trim();
					if (isValidTriggerKey(trimmed)) {
						this.plugin.settings.triggerKey = trimmed;
						await this.plugin.saveSettings();
					} else if (trimmed.length > 0) {
						// Reset to previous valid value if invalid
						text.setValue(this.plugin.settings.triggerKey);
					}
				}));

		// Modifiers
		containerEl.createEl('h3', { text: 'Modifier-Tasten' });

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
		containerEl.createEl('h3', { text: 'Commands auswählen' });

		// Suchfeld für Settings
		const searchContainer = containerEl.createDiv('command-search-settings');
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Commands durchsuchen...',
			cls: 'command-search-input'
		});

		const commandsContainer = containerEl.createDiv('command-selection-container');

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
