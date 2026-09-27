// ==UserScript==
// @name            Mouse Gestures (Vivaldi mapping)
// @description     Right-button mouse gestures with Vivaldi default mapping. Port of xiaoxiaoflood's mouseGestures.uc.js for MrOtherGuy fx-autoconfig (chrome/JS). Chrome-level handling, so gestures work on about: pages too.
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
  const GESTURES = {
    '2D': {
      name: 'Vivaldi: New tab',
      cmd(win) {
        // Note: win.BrowserOpenTab() does not exist in this Firefox
        // version, so open + select explicitly (foreground tab).
        win.gBrowser.selectedTab = win.gBrowser.addTab('about:newtab', {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
      },
    },
    '2DU': {
      name: 'Vivaldi: New background tab',
      cmd(win) {
        win.gBrowser.addTab('about:newtab', {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
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
  };

  const state = {
    directionChain: '',
    firstButton: undefined,
    lastX: 0,
    lastY: 0,
    cancel: false,
    prevent: false,
  };
  const DEBUG = false;
  const dbg = (...args) => {
    if (DEBUG) {
      console.log('mouseGestures:', ...args);
    }
  };

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
          doc.addEventListener('mousemove', onEvent, false);
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
      case 'mouseleave': {
        state.cancel = true;
        break;
      }
    }
  }

  ['contextmenu', 'mousedown', 'mouseup'].forEach(type => {
    document.addEventListener(type, onEvent, true);
  });
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
