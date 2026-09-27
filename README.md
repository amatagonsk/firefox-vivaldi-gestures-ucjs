# mouseGestures.uc.js (Vivaldi mapping, fx-autoconfig port)

<img src="https://raw.githubusercontent.com/amatagonsk/firefox-vivaldi-gestures-ucjs/master/animated_firefox-vivaldi-gestures-ucjs.avif" width="100%" />

(if not animated image, youtube link [here](https://youtu.be/yrYXIpO5ffo))

Right-button mouse gestures for Firefox, with Vivaldi's default gesture mapping.
Runs at chrome level, so gestures also work on system pages
(`about:preferences`, `about:addons`, `about:newtab`, ...).

## Requirements

- Firefox with the [MrOtherGuy fx-autoconfig](https://github.com/MrOtherGuy/fx-autoconfig) loader installed
  (provides the `<profile>/chrome/JS/` + `chrome/utils/` layout)

## Setup

1. Copy `mouseGestures.uc.js` into `<profile>/chrome/JS/`
2. Open `about:support` > `Clear startup cache` > Restart Firefox
3. Check `Ctrl+Shift+J` (Browser Console) for `mouseGestures: loaded`

## Gestures

Hold the **right** mouse button, draw, release.
Based on [Vivaldi's default mouse gestures](https://help.vivaldi.com/desktop/shortcuts/mouse-gestures).

| Gesture | Action | Key |
|---|---|---|
| Down | New tab | `2D` |
| Down then Up | New background tab | `2DU` |
| Down then Right (L-shape) | Close current tab | `2DR` |
| Up then Down | Reload current tab | `2UD` |
| Left | Back in history | `2L` |
| Right | Forward in history | `2R` |

### Customizing

Gestures live in the `GESTURES` object at the top of the script.
The key format is `{start button}{directions}`:

- Buttons: `0` = left, `1` = middle, `2` = right
- Directions: `U` / `D` / `L` / `R` = up / down / left / right

Example — middle-button Up-Down to duplicate the tab:

```js
'1UD': {
  name: 'Duplicate tab',
  cmd(win) {
    win.gBrowser.selectedTab = win.gBrowser.duplicateTab(win.gBrowser.selectedTab);
  },
},
```

Multi-stroke chains work: a direction is appended each time the pointer
changes direction (10px minimum stroke), and the full chain must match
a key exactly on release.

## Notes

- The script sets `ui.context_menus.after_mouseup=true` so a
  right-button drag is treated as a gesture instead of opening the
  context menu immediately.
- Pure chrome-level handling: no content scripts, no WindowActors.
- Debug: set `DEBUG = true` in the file and watch the Browser Console.

## Tested on

- Firefox 153.3.0 ESR

## Origin

Ported from [xiaoxiaoflood/firefox-scripts](https://github.com/xiaoxiaoflood/firefox-scripts)
`mouseGestures.uc.js` for fx-autoconfig.
Dropped from the original: wheel / rocker / link-hover / video /
zoom / copy-paste gestures.
