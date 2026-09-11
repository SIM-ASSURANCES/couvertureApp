"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";

import { useExplorer, type SheetSnap } from "@/components/explorer/ExplorerProvider";
import { cn } from "@/lib/cn";

/** Position (translate-y) de la bottom sheet mobile pour chaque cran. `100%` = hauteur de la feuille. */
const SNAP_Y: Record<SheetSnap, string> = {
  peek: "calc(100% - 11rem)",
  half: "calc(100% - 55dvh)",
  full: "0px",
};
const ORDER: SheetSnap[] = ["peek", "half", "full"];

/**
 * Conteneur du panneau d'information.
 * - Ordinateur / tablette : panneau flottant à gauche, repliable.
 * - Mobile : bottom sheet à trois crans (aperçu, moitié, plein écran), déplaçable au doigt.
 */
export function Panel({ children }: { children: React.ReactNode }) {
  const { sheetSnap, setSheetSnap, panelCollapsed, setPanelCollapsed } = useExplorer();
  const [dragDy, setDragDy] = useState<number | null>(null);
  const drag = useRef<{ y: number; t: number; moved: boolean } | null>(null);

  const step = (dir: 1 | -1) => {
    const i = ORDER.indexOf(sheetSnap);
    setSheetSnap(ORDER[Math.min(ORDER.length - 1, Math.max(0, i + dir))]!);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, t: performance.now(), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dy) > 4) drag.current.moved = true;
    setDragDy(sheetSnap === "full" ? Math.max(0, dy) : dy);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setDragDy(null);
    if (!d) return;
    const dy = e.clientY - d.y;
    const velocity = dy / Math.max(1, performance.now() - d.t);
    if (!d.moved) setSheetSnap(sheetSnap === "full" ? "half" : sheetSnap === "half" ? "full" : "half");
    else if (dy < -50 || velocity < -0.45) step(1);
    else if (dy > 50 || velocity > 0.45) step(-1);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") step(1);
    else if (e.key === "ArrowDown") step(-1);
    else if (e.key === "Enter" || e.key === " ") setSheetSnap(sheetSnap === "full" ? "peek" : "full");
    else return;
    e.preventDefault();
  };

  const y = dragDy == null ? SNAP_Y[sheetSnap] : `calc(${SNAP_Y[sheetSnap]} + ${dragDy}px)`;

  return (
    <>
      <aside
        id="panneau"
        aria-label="Panneau d'information"
        style={{ "--sheet-y": y } as React.CSSProperties}
        className={cn(
          "surface fixed inset-x-0 bottom-0 z-20 flex h-[calc(100dvh-7.75rem)] flex-col overflow-hidden rounded-t-3xl",
          "translate-y-(--sheet-y) will-change-transform",
          dragDy == null && "transition-[translate] duration-300 ease-out-soft",
          "md:absolute md:inset-x-auto md:bottom-4 md:left-4 md:top-[8.25rem] md:h-auto md:w-[400px] md:translate-y-0 md:rounded-2xl",
          panelCollapsed && "md:pointer-events-none md:-translate-x-[calc(100%+2rem)]",
        )}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={sheetSnap === "full" ? "Réduire le panneau" : "Agrandir le panneau"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden"
        >
          <span className="h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        </div>
        <div data-panel-scroll className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setPanelCollapsed(!panelCollapsed)}
        aria-label={panelCollapsed ? "Afficher le panneau" : "Masquer le panneau pour agrandir la carte"}
        aria-expanded={!panelCollapsed}
        aria-controls="panneau"
        className={cn(
          "surface absolute top-40 z-20 hidden h-10 w-6 items-center justify-center rounded-r-lg text-zinc-500 transition-[left] duration-300 ease-out-soft hover:text-zinc-900 md:flex dark:hover:text-white",
          panelCollapsed ? "left-0" : "left-[416px]",
        )}
      >
        {panelCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
    </>
  );
}
