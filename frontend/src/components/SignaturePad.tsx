import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface SignaturePadHandle {
  clear(): void;
  toDataURL(): string | null;
  isEmpty(): boolean;
}

interface Props {
  label?: string;
  height?: number;
  onChange?: (empty: boolean) => void;
}

/**
 * Capture de signature manuscrite au doigt/souris via Pointer Events (unifie
 * tactile et souris, pas besoin de gérer touch/mouse séparément).
 */
const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { label = "Signature", height = 160, onChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  function context() {
    return canvasRef.current?.getContext("2d") ?? null;
  }

  function resizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = context();
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0f1b2d";
    }
  }

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    onChange?.(empty);
  }, [empty, onChange]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = context();
    const point = pointFromEvent(e);
    const last = lastPointRef.current;
    if (ctx && last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    lastPointRef.current = point;
    setEmpty(false);
  }

  function end() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(true);
  }

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => empty,
    toDataURL: () => (empty ? null : canvasRef.current?.toDataURL("image/png") ?? null),
  }));

  return (
    <div className="field">
      <label className="label">{label} <span className="req">*</span></label>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height,
          border: "1.5px solid var(--border, #e5e7eb)",
          borderRadius: 8,
          touchAction: "none",
          background: "#fff",
          cursor: "crosshair",
        }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>Signez avec le doigt ou la souris.</span>
        <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={clear}>
          Effacer
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
