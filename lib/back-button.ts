"use client";

import { useEffect, useRef } from "react";

// Android's system back button/gesture (components/shared/BackButtonBootstrap)
// closes the topmost open popup before it navigates anywhere. A popup opts
// in with useBackClose(close). Registering is just a list entry, so this is
// a no-op on the web and on iOS, where nothing ever reads the list.

const stack: Array<{ id: number; close: () => void }> = [];
let nextId = 1;

/** While `onClose` is set, the Android back button calls it instead of navigating. */
export function useBackClose(onClose: (() => void) | null | undefined | false): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  const active = !!onClose;
  useEffect(() => {
    if (!active) return;
    const id = nextId++;
    stack.push({ id, close: () => { const f = latest.current; if (f) f(); } });
    return () => {
      const i = stack.findIndex((s) => s.id === id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Closes the most recently opened popup. False if none is open. */
export function closeTopmostPopup(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
