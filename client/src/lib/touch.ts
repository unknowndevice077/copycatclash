/** Blocks the long-press / right-click menu everywhere except text fields. */
export function disableLongPressMenus(): void {
  const editable = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"]');
  window.addEventListener('contextmenu', (e) => {
    if (!editable(e.target)) e.preventDefault();
  });
  // Images and canvases are never draggable (stops the ghost-image drag on long press).
  window.addEventListener('dragstart', (e) => {
    if (e.target instanceof HTMLImageElement || e.target instanceof HTMLCanvasElement) e.preventDefault();
  });
}
