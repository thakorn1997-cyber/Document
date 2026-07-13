import { useCallback, useRef } from "react";

/**
 * Drag-to-scroll (grab & pan) for a horizontally overflowing container, with
 * momentum. Hold the left mouse button anywhere in the element and drag to
 * scroll it; on release it keeps gliding and decelerates (kinetic scrolling),
 * so it feels like a native touch surface rather than a stiff 1:1 pan.
 *
 * Clicks on links/buttons still work: a drag only starts past a small movement
 * threshold, and the click that follows a real drag is suppressed so it doesn't
 * accidentally navigate. Respects `prefers-reduced-motion` (no momentum glide).
 *
 * Returns a *callback ref* (not a RefObject) so the listeners are attached the
 * moment the node actually mounts — critical when the target renders only after
 * data loads (e.g. behind a loading spinner). A plain useEffect+useRef would run
 * once while the node is still null and never re-attach.
 *
 * Usage: const ref = useDragScroll(); <div ref={ref} className="overflow-x-auto cursor-grab">…</div>
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    // Detach from the previous node (or on unmount when el === null).
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!el) return;

    const THRESHOLD = 5; // px before a press becomes a drag
    const FRICTION = 0.94; // per-frame velocity decay during the glide
    const MIN_V = 0.05; // px/ms below which the glide stops
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let down = false;
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0; // scrollLeft px per ms (smoothed); positive = scrolling right
    let raf = 0;

    const stopGlide = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // left button only
      stopGlide(); // grabbing again cancels any ongoing momentum
      down = true;
      dragging = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
      lastX = e.clientX;
      lastT = e.timeStamp;
      velocity = 0;
    };

    const onMove = (e: MouseEvent) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) < THRESHOLD) return;
      dragging = true;
      el.scrollLeft = startLeft - dx;
      el.style.cursor = "grabbing";
      el.classList.add("select-none");
      window.getSelection()?.removeAllRanges(); // drop any selection started before the threshold

      // Track pointer velocity (px/ms). Scroll moves opposite the pointer, so
      // a leftward drag (dx < 0) scrolls right (positive velocity).
      const dt = e.timeStamp - lastT;
      if (dt > 0) {
        const instant = -(e.clientX - lastX) / dt;
        velocity = 0.8 * instant + 0.2 * velocity; // smooth out jitter
        lastX = e.clientX;
        lastT = e.timeStamp;
      }
      e.preventDefault(); // stop text selection while panning
    };

    const glide = () => {
      velocity *= FRICTION;
      if (Math.abs(velocity) < MIN_V) {
        raf = 0;
        return;
      }
      const before = el.scrollLeft;
      el.scrollLeft = before + velocity * 16; // ~one frame (16ms) of travel
      if (el.scrollLeft === before) {
        raf = 0; // hit the start/end edge — nothing more to scroll
        return;
      }
      raf = requestAnimationFrame(glide);
    };

    const onUp = () => {
      if (!down) return;
      down = false;
      el.style.cursor = "";
      el.classList.remove("select-none");
      if (dragging) {
        // Swallow the click that fires right after a real drag.
        el.dataset.dragged = "1";
        setTimeout(() => delete el.dataset.dragged, 0);
        // Let go with speed → coast to a stop.
        if (!reduceMotion && Math.abs(velocity) > MIN_V) {
          stopGlide();
          raf = requestAnimationFrame(glide);
        }
      }
      dragging = false;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (el.dataset.dragged) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Links/images are draggable by default; native drag hijacks the mouse and
    // kills the pan. Suppress it so a press-and-drag always scrolls.
    const onDragStart = (e: DragEvent) => e.preventDefault();
    // Grabbing the scrollbar or wheel-scrolling should also cancel momentum.
    const onWheel = () => stopGlide();

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("wheel", onWheel, { passive: true });

    cleanupRef.current = () => {
      stopGlide();
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);
}
