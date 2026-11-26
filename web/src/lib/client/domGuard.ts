"use client";

// Browser translation (Chrome's "Translate this page", much used by Persian
// visitors) and some extensions move or wrap the page's text nodes. React
// then removes or inserts around a node that's no longer where it put it,
// the DOM throws "NotFoundError: Failed to execute 'removeChild' on 'Node'",
// and the whole page crashes (seen on /studio and the tool pages). Asked to
// remove a node that has already moved, or to insert before one that has,
// these do what's still possible instead of throwing — React's long-standing
// advice (facebook/react#11538). Nothing changes for nodes where React left them.

let installed = false;

export function guardDomAgainstTranslation() {
  if (installed || typeof Node === "undefined" || !Node.prototype) return;
  installed = true;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // Already moved elsewhere (by the translator): take it out of wherever it is now.
      if (child.parentNode) child.parentNode.removeChild(child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, reference: Node | null): T {
    // The node to insert before has moved: put it at the end rather than crash.
    if (reference && reference.parentNode !== this) return insertBefore.call(this, node, null) as T;
    return insertBefore.call(this, node, reference) as T;
  };
}

guardDomAgainstTranslation();
