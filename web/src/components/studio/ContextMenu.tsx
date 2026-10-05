"use client";

import { Check, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";

// The Studio's right-click menu (long-press on touch screens): a small
// menu at the pointer on a desktop, a sheet from the bottom on a phone.
// Arrow keys move through it, Enter picks, Esc closes.

export type MenuItem =
  | {
      type?: "item";
      label: string;
      icon?: LucideIcon;
      shortcut?: string;
      hint?: string;
      onSelect: () => void;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
    }
  | { type: "separator" }
  | { type: "heading"; label: string }
  /** A row of small choices, e.g. stutter lengths. */
  | { type: "chips"; label: string; chips: { label: string; icon?: LucideIcon; onSelect: () => void; active?: boolean; hint?: string }[] };

type MenuState = {
  /** `sheet`: shown as a sheet from the bottom (phones) rather than at the pointer. */
  menu: { x: number; y: number; title?: string; items: MenuItem[]; sheet: boolean } | null;
  open: (x: number, y: number, items: MenuItem[], title?: string) => void;
  close: () => void;
};

export const useContextMenu = create<MenuState>((set) => ({
  menu: null,
  open: (x, y, items, title) => set({ menu: { x, y, items, title, sheet: isSheet() } }),
  close: () => set({ menu: null }),
}));

export function openMenu(x: number, y: number, items: MenuItem[], title?: string) {
  useContextMenu.getState().open(x, y, items, title);
}

/**
 * A press held still for half a second on a touch screen opens the menu.
 * Spread the returned handlers on the element (with any of its own).
 */
export function useLongPress(onLongPress: (x: number, y: number) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    start.current = null;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return;
      cancel();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        const at = start.current;
        cancel();
        if (at) {
          navigator.vibrate?.(10);
          onLongPress(at.x, at.y);
        }
      }, 480);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const at = start.current;
      if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}

function isSheet() {
  return window.matchMedia("(max-width: 39.999rem), (pointer: coarse) and (max-width: 63.999rem)").matches;
}

export default function ContextMenuHost() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);
  const ref = useRef<HTMLDivElement>(null);
  const sheet = !!menu?.sheet;
  // The finger that long-pressed to open the menu lifts over it, and the
  // browser turns that into a click on whatever item is under it. Items
  // only answer a press that started inside the menu (or the keyboard).
  const armed = useRef(false);
  useEffect(() => {
    armed.current = false;
  }, [menu]);

  // Keep the menu on screen: flip it left/up when it would run off an edge.
  // Measured and placed before paint, straight on the element.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!menu || menu.sheet || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = menu.x + width > window.innerWidth - 8 ? Math.max(8, menu.x - width) : menu.x;
    const top = menu.y + height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - height - 8) : menu.y;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const first = ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button[data-item]:not(:disabled)") ?? [])];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = buttons[(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
        next?.focus();
      }
    };
    // No "close on scroll": scrolling the menu itself (a long one on a
    // short screen) or the timeline following the playhead must leave it
    // open. Scrolling anywhere else lands on the backdrop, which closes it.
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const pick = (e: React.MouseEvent, run: () => void) => {
    if (e.detail !== 0 && !armed.current) return;
    close();
    run();
  };

  // On <body>, so no transformed or filtered ancestor can shift where the
  // fixed-position menu lands.
  return createPortal(
    <>
      <div
        className={`fixed inset-0 z-[80] ${sheet ? "bg-black/55" : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          close();
        }}
        onWheel={close}
        // A long-press that opened this menu may still fire the browser's own
        // contextmenu on Android — swallow it rather than close what just opened.
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={ref}
        role="menu"
        aria-label={menu.title ?? "Options"}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={() => {
          armed.current = true;
        }}
        className={
          sheet
            ? "fixed inset-x-0 bottom-0 z-[81] mx-auto max-h-[75dvh] max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 border-border bg-surface px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl"
            : "fixed z-[81] max-h-[calc(100dvh-1rem)] w-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface-raised/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-md"
        }
        style={
          sheet
            ? { animation: "sheet-in 0.18s ease-out" }
            : { left: menu.x, top: menu.y, visibility: "hidden" }
        }
      >
        {sheet && <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border" />}
        {menu.title && (
          <p className="truncate px-2.5 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{menu.title}</p>
        )}
        {menu.items.map((item, i) => {
          if (item.type === "separator") return <div key={i} className="my-1 h-px bg-border" />;
          if (item.type === "heading")
            return (
              <p key={i} className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {item.label}
              </p>
            );
          if (item.type === "chips")
            return (
              <div key={i} className="flex flex-wrap items-center gap-1 px-2.5 py-1.5">
                <span className="mr-1 text-xs text-muted">{item.label}</span>
                {item.chips.map((chip) => (
                  <button
                    key={chip.label}
                    data-item
                    onClick={(e) => pick(e, chip.onSelect)}
                    title={chip.hint}
                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors focus:border-brand focus:outline-none pointer-coarse:px-3 pointer-coarse:py-1.5 ${
                      chip.active ? "border-brand bg-brand/20 text-foreground" : "border-border text-muted hover:border-brand hover:text-foreground"
                    }`}
                  >
                    {chip.icon && <chip.icon className="mr-0.5" />}
                    {chip.label}
                  </button>
                ))}
              </div>
            );
          return (
            <button
              key={i}
              data-item
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => pick(e, item.onSelect)}
              title={item.hint}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors focus:outline-none disabled:opacity-35 pointer-coarse:py-2.5 pointer-coarse:text-sm ${
                item.danger
                  ? "text-danger hover:bg-danger/15 focus:bg-danger/15"
                  : "text-foreground hover:bg-brand/20 focus:bg-brand/20"
              }`}
            >
              <span className="w-4 shrink-0 text-center text-sm opacity-80">{item.checked ? <Check /> : item.icon && <item.icon />}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <kbd className="shrink-0 font-mono text-[10px] text-muted pointer-coarse:hidden">{item.shortcut}</kbd>
              )}
            </button>
          );
        })}
      </div>
    </>,
    document.body
  );
}
