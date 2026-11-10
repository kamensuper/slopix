/**
 * Input manager: unifies mouse, touch and pen through Pointer Events, tracks multi-touch for
 * pinch gestures, and forwards keyboard input. Scenes receive positions in CSS pixels relative
 * to the canvas.
 */
export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  /** Position where the pointer went down. */
  startX: number;
  startY: number;
  type: 'mouse' | 'touch' | 'pen';
  button: number;
}

export interface InputHandler {
  pointerDown?(pointer: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void;
  pointerMove?(pointer: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void;
  pointerUp?(pointer: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void;
  /** The system took the pointer away (palm rejection, alert, lost capture ...). */
  pointerCancel?(pointer: PointerInfo, all: ReadonlyMap<number, PointerInfo>): void;
  /** Mouse movement without a pressed button. */
  hover?(x: number, y: number): void;
  wheel?(x: number, y: number, deltaY: number): void;
  /** Return true when the key was handled (suppresses the browser default). */
  keyDown?(event: KeyboardEvent): boolean;
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

export class InputManager {
  handler: InputHandler | null = null;
  /** Called on the very first user gesture (used to unlock audio). */
  onFirstGesture: (() => void) | null = null;
  private readonly pointers = new Map<number, PointerInfo>();
  private gestureSeen = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const opts = { passive: false } as const;
    canvas.addEventListener('pointerdown', this.onDown, opts);
    canvas.addEventListener('pointermove', this.onMove, opts);
    canvas.addEventListener('pointerup', this.onUp, opts);
    canvas.addEventListener('pointercancel', this.onCancel, opts);
    canvas.addEventListener('lostpointercapture', this.onCancel, opts);
    canvas.addEventListener('wheel', this.onWheel, opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Belt and braces next to `touch-action: none`: never scroll or pinch-zoom the page from the playfield.
    for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange'] as const) {
      canvas.addEventListener(type, (e) => e.preventDefault(), opts);
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('pointerdown', this.noteGesture, true);
    window.addEventListener('keydown', this.noteGesture, true);
    window.addEventListener('blur', this.cancelAll);
  }

  private readonly noteGesture = (): void => {
    if (!this.gestureSeen) {
      this.gestureSeen = true;
      window.removeEventListener('pointerdown', this.noteGesture, true);
      window.removeEventListener('keydown', this.noteGesture, true);
    }
    this.onFirstGesture?.();
  };

  private locate(event: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const { x, y } = this.locate(event);
    const type = event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse';
    const pointer: PointerInfo = { id: event.pointerId, x, y, startX: x, startY: y, type, button: event.button };
    this.pointers.set(pointer.id, pointer);
    try {
      // Keep receiving the drag when the finger leaves the canvas or passes over a HUD button.
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events have no capturable pointer; dragging still works inside the canvas.
    }
    this.handler?.pointerDown?.(pointer, this.pointers);
  };

  private readonly onMove = (event: PointerEvent): void => {
    const { x, y } = this.locate(event);
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) {
      this.handler?.hover?.(x, y);
      return;
    }
    event.preventDefault();
    pointer.x = x;
    pointer.y = y;
    this.handler?.pointerMove?.(pointer, this.pointers);
  };

  private readonly onUp = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    event.preventDefault();
    const { x, y } = this.locate(event);
    pointer.x = x;
    pointer.y = y;
    this.pointers.delete(pointer.id);
    this.handler?.pointerUp?.(pointer, this.pointers);
  };

  private readonly onCancel = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    this.pointers.delete(pointer.id);
    this.handler?.pointerCancel?.(pointer, this.pointers);
  };

  private readonly cancelAll = (): void => {
    for (const pointer of [...this.pointers.values()]) {
      this.pointers.delete(pointer.id);
      this.handler?.pointerCancel?.(pointer, this.pointers);
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const { x, y } = this.locate(event);
    // Normalise line / page based wheels to pixels.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    this.handler?.wheel?.(x, y, event.deltaY * scale);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) return;
    if (this.handler?.keyDown?.(event)) event.preventDefault();
  };
}
