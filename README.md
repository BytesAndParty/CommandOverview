# Command Overview

An Obsidian plugin that displays a customizable overlay showing your selected commands and their keyboard shortcuts.

## Features

- **Customizable Trigger**: Set your own keyboard shortcut (default: `Ctrl+Shift+/`)
- **Two Modes**: Hold (overlay visible while key pressed) or Toggle (press to open/close)
- **Search**: Quickly filter commands by typing
- **Plugin Grouping**: Commands grouped by their source plugin (optional)
- **Keyboard Navigation**: Use arrow keys to navigate, Enter to execute, Escape to close
- **Ribbon Icon**: Click the list icon in the sidebar to open
- **Theme Support**: Automatically adapts to light/dark mode

## Installation

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release
2. Create a folder called `command-overview` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Enable the plugin in Obsidian Settings > Community Plugins

### From Source

```bash
# Clone the repository
git clone https://github.com/BytesAndParty/CommandOverview.git
cd command-overview

# Install dependencies
bun install

# Build
bun run build
```

## Usage

1. Open Obsidian Settings > Command Overview
2. Select which commands you want to see in the overlay
3. Configure your preferred trigger shortcut and mode
4. Press your trigger shortcut or click the ribbon icon

## Keyboard Shortcuts (in Overlay)

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate through commands |
| `Enter` | Execute selected command |
| `Escape` | Close overlay |
| Type | Search/filter commands |

## Settings

| Setting | Description |
|---------|-------------|
| Mode | Hold (keep pressed) or Toggle (press once) |
| Trigger Key | The key that opens the overlay (e.g., Slash, F1, KeyK) |
| Modifiers | Ctrl, Shift, Alt, Meta (Cmd/Win) |
| Group by Plugin | Group commands by their source plugin |
| Command Selection | Choose which commands appear in the overlay |

## Development

```bash
# Install dependencies
bun install

# Development mode (watch)
bun run dev

# Production build
bun run build

# Type checking
bun run typecheck
```

## Works Well with Other BytesAndParty Plugins

- [Auto Categories](https://github.com/BytesAndParty/Obsidian_AutoCategories) - Trigger sync and cleanup commands quickly from one overlay.
- [Company Knowledge Hub](https://github.com/BytesAndParty/CompanyKnowledgeHub) - Keep publish and unpublish commands always accessible.
- [Customer Tag Sorter](https://github.com/BytesAndParty/CustomerTag) - Run sorting workflows without leaving keyboard navigation.
- [Obsidian Recall](https://github.com/BytesAndParty/ObsidianRecall) - Start review and stats commands from the same command surface.

## License

MIT
