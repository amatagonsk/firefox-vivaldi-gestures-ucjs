// MGestChild (simplified Vivaldi port for fx-autoconfig).
// Reports the anchor URL under the mousedown point to the parent actor.
// Covers <a>/<area> (+ SVG <a>); background-image/media detection from the
// xiaoxiaoflood original is intentionally omitted for the Vivaldi mapping.
// Placement: <profile>/chrome/resources/mouseGestures/MGestChild.sys.mjs
//   -> esModuleURI: chrome://userchrome/content/mouseGestures/MGestChild.sys.mjs

export class MGestChild extends JSWindowActorChild {
  handleEvent(evt) {
    let url = null;
    try {
      let elem = evt.composedTarget;
      while (elem) {
        if (elem.nodeType === 1) {
          const localName = (elem.localName || '').toLowerCase();
          // HTML anchor / area with href (elem.href is already absolute).
          if ((localName === 'a' || localName === 'area') && elem.href) {
            url = elem.href;
            break;
          }
          // SVG <a>: href may live in href / xlink:href attribute.
          if (
            elem.namespaceURI === 'http://www.w3.org/2000/svg' &&
            localName === 'a'
          ) {
            const href =
              elem.getAttribute('href') ||
              elem.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
            if (href) {
              try {
                url = new URL(href, elem.ownerDocument.baseURI).href;
              } catch (e) {
                url = null;
              }
              break;
            }
          }
        }
        elem =
          typeof elem.flattenedTreeParentNode === 'function'
            ? elem.flattenedTreeParentNode
            : elem.parentNode;
      }
    } catch (e) {
      url = null;
    }
    try {
      this.sendAsyncMessage('MGest:Link', { url });
    } catch (e) {
      // Parent may be gone during shutdown; safe to ignore.
    }
  }
}
