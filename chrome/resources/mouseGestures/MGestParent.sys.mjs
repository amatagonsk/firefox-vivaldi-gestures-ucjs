// MGestParent (simplified Vivaldi port for fx-autoconfig).
// Only caches the link URL reported by the content child so that
// mouseGestures.uc.js can open "link in new tab" gestures.
// Placement: <profile>/chrome/resources/mouseGestures/MGestParent.sys.mjs
//   -> esModuleURI: chrome://userchrome/content/mouseGestures/MGestParent.sys.mjs

export class MGestParent extends JSWindowActorParent {
  linkURL = null;

  receiveMessage(message) {
    if (message.name === 'MGest:Link') {
      this.linkURL = message.data?.url || null;
      // Mirror to the top chrome window so gestures starting in subframes
      // (which have their own actor instance) are also visible to uc.js.
      try {
        this.browsingContext.topChromeWindow._mgestLinkURL = this.linkURL;
      } catch (e) {
        // Window gone during shutdown; safe to ignore.
      }
    }
  }
}
