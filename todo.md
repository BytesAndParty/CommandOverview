# Command Overview Plugin - TODO

## Konzept
- Trigger: Anpassbarer Shortcut (z.B. Ctrl+Shift+/)
- Modus: Toggle oder Hold (konfigurierbar)
- Overlay zeigt: Command-Name + Shortcut
- Design: Minimalistisch aber informativ
- Ribbon-Icon: Klick öffnet auch das Overlay

---

## Phase 1: Projekt-Setup
- [x] Bun initialisieren
- [x] Obsidian Plugin Grundstruktur erstellen
- [x] TypeScript Konfiguration
- [x] Build-Skripte einrichten
- [x] manifest.json erstellen

## Phase 2: Core Funktionalität
- [x] Plugin-Klasse mit onload/onunload
- [x] Ribbon-Icon hinzufügen
- [x] Keyboard Event Handler (keydown/keyup)
- [x] Trigger-Hotkey registrieren (anpassbar)
- [x] Command-Liste aus Obsidian API abrufen
- [x] Hotkeys zu Commands zuordnen

## Phase 3: Overlay UI
- [x] Overlay HTML/CSS Struktur
- [x] Theme-Support (Light/Dark Mode)
- [x] Command-Liste rendern (Name + Shortcut)
- [x] Klickbare Commands (führt Command aus)
- [x] Animation (Ein-/Ausblenden)
- [x] Positionierung

## Phase 4: Settings
- [x] Settings Tab erstellen
- [x] Trigger-Hotkey konfigurierbar
- [x] Toggle vs. Hold Modus Auswahl
- [x] Command-Auswahl (welche im Overlay erscheinen)
- [x] Settings persistieren
- [x] Nach Plugin gruppieren Option

## Phase 5: Erweiterte Features
- [x] Suchfunktion im Overlay
- [x] Kategorisierung nach Plugin
- [x] Keyboard-Navigation im Overlay (Pfeiltasten + Enter)
- [x] Suchfeld in Settings für Command-Auswahl

## Phase 6: Polish
- [ ] README aktualisieren
- [ ] Testen in verschiedenen Themes

---

## Status
**Aktuell:** Alle Features implementiert!

## Features
- **Suchfeld** im Overlay zum schnellen Filtern
- **Gruppierung** nach Plugin (optional in Settings)
- **Keyboard-Navigation**: Pfeiltasten + Enter + Escape
- **Hover-Selection**: Maus-Hover aktualisiert Auswahl
- **Klickbar**: Commands direkt ausführen

## Installation
1. Kopiere den Ordner nach `.obsidian/plugins/command-overview/`
2. Aktiviere das Plugin in den Obsidian-Einstellungen
3. Gehe zu Plugin-Settings und wähle Commands aus
4. Drücke `Ctrl+Shift+/` oder klicke das Ribbon-Icon

## Keyboard Shortcuts im Overlay
| Taste | Aktion |
|-------|--------|
| `↑` / `↓` | Navigation |
| `Enter` | Command ausführen |
| `Escape` | Overlay schließen |
| Tippen | Suche |
