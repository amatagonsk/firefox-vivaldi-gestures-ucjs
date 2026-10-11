// ==UserScript==
// @name            Mouse Gestures (Vivaldi mapping)
// @description     Right-button mouse gestures with Vivaldi default mapping. Port of xiaoxiaoflood's mouseGestures.uc.js for MrOtherGuy fx-autoconfig (chrome/JS). Chrome-level handling, so gestures work on about: pages too. Link gestures (open link in new/background tab) need resources/mouseGestures/MGest{Parent,Child}.sys.mjs.
// @author          xiaoxiaoflood (original), ported for fx-autoconfig
// ==/UserScript==

(function () {
  // This script runs once per browser window, so the surrounding window
  // is always the correct one. (Do NOT derive it from event.view: for
  // events coming from remote content, event.view.windowRoot.ownerGlobal
  // is undefined and the handler throws before doing anything.)
  const win = window;
  const doc = win.document;
  // Per-window state (this script runs once per browser window).
  // Gesture key format: '{startButton}{directions}'
  //   0, 1, 2: left, middle, right mouse button
  //   U, D, L, R: up, down, left, right
  //   -, +: wheel up, wheel down (compatible with xiaoxiaoflood original)
  const GESTURES = {
    '2D': {
      name: 'Vivaldi: New tab / Open link in new tab',
      cmd(win) {
        openLinkOrEmptyTab(win, { inBackground: false });
      },
    },
    '2DU': {
      name: 'Vivaldi: New background tab / Open link in background tab',
      cmd(win) {
        openLinkOrEmptyTab(win, { inBackground: true });
      },
    },
    '2DR': {
      name: 'Vivaldi: Close tab (L-shape)',
      cmd(win) {
        win.gBrowser.removeCurrentTab();
      },
    },
    '2UD': {
      name: 'Vivaldi: Reload',
      cmd(win) {
        win.gBrowser.reloadTab(win.gBrowser.selectedTab);
      },
    },
    '2L': {
      name: 'Vivaldi: Back',
      cmd(win) {
        win.gBrowser.goBack();
      },
    },
    '2R': {
      name: 'Vivaldi: Forward',
      cmd(win) {
        win.gBrowser.goForward();
      },
    },
    '2UR': {
      name: 'Vivaldi: Reopen closed tab',
      cmd(win) {
        // Same as Ctrl+Shift+T. Fall back across Firefox versions
        // (pre/post SessionWindowUI split, Bug 1959616).
        try {
          if (typeof win.undoCloseTab === 'function') {
            win.undoCloseTab();
            return;
          }
        } catch (e) {}
        try {
          const key = win.document.getElementById('key_undoCloseTab');
          if (key) {
            key.doCommand();
            return;
          }
        } catch (e) {}
        try {
          const ss = win.SessionStore;
          if (ss?.undoCloseTab) {
            const hasClosed =
              typeof ss.getClosedTabCountForWindow === 'function'
                ? ss.getClosedTabCountForWindow(win) > 0
                : typeof ss.getClosedTabCount === 'function'
                  ? ss.getClosedTabCount(win) > 0
                  : true;
            if (hasClosed) {
              ss.undoCloseTab(win, 0, win);
              return;
            }
          }
        } catch (e) {
          console.error('mouseGestures: reopen closed tab failed', e);
        }
      },
    },
    '2+': {
      name: 'Next tab (right-button + wheel down)',
      cmd(win) {
        win.gBrowser.tabContainer.advanceSelectedTab(1, true);
      },
    },
    '2-': {
      name: 'Previous tab (right-button + wheel up)',
      cmd(win) {
        win.gBrowser.tabContainer.advanceSelectedTab(-1, true);
      },
    },
  };

  const state = {
    directionChain: '',
    firstButton: undefined,
    lastX: 0,
    lastY: 0,
    cancel: false,
    prevent: false,
    startedInContent: false,
  };
  const DEBUG = false;
  const dbg = (...args) => {
    if (DEBUG) {
      console.log('mouseGestures:', ...args);
    }
  };

  // WindowActor for link gestures (simplified xiaoxiaoflood MGest).
  // Files: <profile>/chrome/resources/mouseGestures/MGest{Parent,Child}.sys.mjs
  // (chrome://userchrome/content/mouseGestures/... via fx-autoconfig manifest).
  function registerMGestActor() {
    try {
      ChromeUtils.registerWindowActor('MGest', {
        parent: {
          esModuleURI:
            'chrome://userchrome/content/mouseGestures/MGestParent.sys.mjs',
        },
        child: {
          esModuleURI:
            'chrome://userchrome/content/mouseGestures/MGestChild.sys.mjs',
          events: { mousedown: { mozSystemGroup: true } },
        },
        allFrames: true,
      });
    } catch (e) {
      // Second window throws "already registered" — safe to ignore.
      if (!/already|exists|registered/i.test(String(e))) {
        console.error('mouseGestures: registerWindowActor failed', e);
      }
    }
  }

  // Link URL cached by MGestParent for the selected browser.
  // Only trusted when the gesture started in web content (not chrome UI),
  // otherwise a stale cache could open an unrelated link.
  function getContentLinkURL(win) {
    try {
      if (!state.startedInContent) {
        return null;
      }
      // Fast path: mirrored by MGestParent (covers subframes, which have
      // their own actor instance per WindowGlobal).
      const mirrored = win._mgestLinkURL;
      if (typeof mirrored === 'string' && mirrored) {
        return mirrored;
      }
      if (mirrored === null) {
        return null;
      }
      // Fallback: per-browser parent actor cache (top frame only).
      const browser = win.gBrowser.selectedBrowser;
      const wg = browser?.browsingContext?.currentWindowGlobal;
      if (!wg) {
        return null;
      }
      const actor = wg.getActor('MGest');
      const url = actor?.linkURL;
      if (typeof url !== 'string' || !url) {
        return null;
      }
      return url;
    } catch (e) {
      return null;
    }
  }

  function systemPrincipal() {
    return Services.scriptSecurityManager.getSystemPrincipal();
  }

  // Vivaldi default: Down over a link opens it (foreground),
  // Down-Up over a link opens it in background.
  // Non-link / about: pages (no content actor) fall back to empty tab,
  // matching the xiaoxiaoflood original policy.
  function openLinkOrEmptyTab(win, { inBackground }) {
    const url = getContentLinkURL(win);
    if (url) {
      let tp;
      try {
        tp = win.gBrowser.selectedBrowser.contentPrincipal ?? systemPrincipal();
      } catch (e) {
        tp = systemPrincipal();
      }
      const tab = win.gBrowser.addTab(url, {
        triggeringPrincipal: tp,
        relatedToCurrent: true,
      });
      if (!inBackground) {
        win.gBrowser.selectedTab = tab;
      }
      return;
    }
    // Note: win.BrowserOpenTab() does not exist in this Firefox
    // version, so open + select explicitly (foreground tab).
    if (!inBackground) {
      win.gBrowser.selectedTab = win.gBrowser.addTab('about:newtab', {
        triggeringPrincipal: systemPrincipal(),
      });
    } else {
      win.gBrowser.addTab('about:newtab', {
        triggeringPrincipal: systemPrincipal(),
      });
    }
  }

  // Small delay so the pointer can leave the window before the command
  // runs (prevents the context menu from flashing on gesture end).
  function stoppedOutside(win) {
    return new Promise(resolve => {
      let start;
      const step = timestamp => {
        if (start === undefined && timestamp) {
          start = timestamp;
        }
        if (timestamp - start < 20 && !state.cancel) {
          win.requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      win.requestAnimationFrame(step);
    });
  }

  async function stopGesture(gst, win) {
    dbg('stopGesture, chain =', JSON.stringify(gst), 'known =', Boolean(GESTURES[gst]));
    if (GESTURES[gst]) {
      const topWin = win;
      state.prevent = true;
      if (/[UDLR]/.test(gst)) {
        await stoppedOutside(win);
      }
      win.document.documentElement.removeEventListener('mouseleave', onEvent, false);
      if (!state.cancel) {
        GESTURES[gst].cmd(topWin);
      }
    }
  }

  function onEvent(event) {
    const { button, composedTarget, screenX, screenY } = event;
    let delX, delY, absDX, absDY, direction;

    switch (event.type) {
      case 'mousedown': {
        dbg('mousedown, button =', button, 'chain =', JSON.stringify(state.directionChain));
        if (event.ctrlKey) {
          return;
        }
        if (state.directionChain) {
          delX = screenX - state.lastX;
          delY = screenY - state.lastY;
          if (Math.abs(delX) > 30 || Math.abs(delY) > 30) {
            return;
          }
          // Chord (second button pressed): only swallow the event when it
          // actually matches a defined gesture.
          if (GESTURES[state.directionChain + button]) {
            stopGesture(state.directionChain + button, win);
            event.preventDefault();
            event.stopPropagation();
          }
        } else {
          state.lastX = screenX;
          state.lastY = screenY;
          state.firstButton = button;
          state.directionChain += button;
          state.cancel = false;
          state.prevent = false;
          state.startedInContent = !!composedTarget?.isRemoteBrowser;
          doc.addEventListener('mousemove', onEvent, false);
          doc.addEventListener('wheel', onEvent, { capture: true, passive: false });
          doc.addEventListener('dragend', onEvent, { capture: true, once: true });
          doc.documentElement.addEventListener('mouseleave', onEvent, false);
        }
        break;
      }
      case 'mousemove': {
        delX = screenX - state.lastX;
        delY = screenY - state.lastY;
        absDX = Math.abs(delX);
        absDY = Math.abs(delY);
        if (absDX < 10 && absDY < 10) {
          return;
        }
        if (absDX > absDY) {
          direction = delX < 0 ? 'L' : 'R';
        } else {
          direction = delY < 0 ? 'U' : 'D';
        }
        if (direction !== state.directionChain[state.directionChain.length - 1]) {
          state.directionChain += direction;
        }
        state.lastX = screenX;
        state.lastY = screenY;
        break;
      }
      case 'dragend':
      case 'mouseup': {
        dbg('mouseup, button =', button, 'chain =', JSON.stringify(state.directionChain));
        if (state.directionChain) {
          stopGesture(state.directionChain, win);
          if (state.firstButton === button) {
            state.directionChain = '';
            doc.removeEventListener('mousemove', onEvent, false);
            doc.removeEventListener('dragend', onEvent, true);
            doc.removeEventListener('wheel', onEvent, true);
          }
          if (state.prevent && button !== 2) {
            if (composedTarget.isRemoteBrowser) {
              doc.documentElement.focus();
              win.gBrowser.selectedBrowser.focus();
              event.preventDefault();
              event.stopPropagation();
            } else {
              win.addEventListener('click', onEvent, { capture: true, once: true });
            }
          }
        }
        break;
      }
      case 'click': {
        event.preventDefault();
        event.stopPropagation();
        break;
      }
      case 'contextmenu': {
        if (state.prevent) {
          event.preventDefault();
          event.stopPropagation();
        }
        break;
      }
      case 'wheel': {
        // Right-button + wheel: compatible with xiaoxiaoflood original.
        // directionChain is e.g. '2', so '2+' / '2-' matches GESTURES.
        if (state.directionChain) {
          event.preventDefault();
          event.stopPropagation();
          stopGesture(state.directionChain + (event.deltaY > 0 ? '+' : '-'), win);
        }
        break;
      }
      case 'mouseleave': {
        state.cancel = true;
        break;
      }
    }
  }

  ['contextmenu', 'mousedown', 'mouseup'].forEach(type => {
    document.addEventListener(type, onEvent, true);
  });
  registerMGestActor();
  console.log('mouseGestures: loaded (Vivaldi mapping)');

  // Let the context menu appear on mouse-up so a right-button drag is
  // recognized as a gesture instead of opening the menu immediately.
  // (Same pref Gesturefy asks Linux/macOS users to set.)
  try {
    if (!Services.prefs.getBoolPref('ui.context_menus.after_mouseup', false)) {
      Services.prefs.setBoolPref('ui.context_menus.after_mouseup', true);
    }
  } catch (e) {
    console.error('mouseGestures: could not set ui.context_menus.after_mouseup', e);
  }
})();
