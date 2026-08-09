"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n";

type Point = { x: number; y: number };

const MAX_OUTPUT_EDGE = 2400;

/**
 * Solves for the projective transform mapping destination (x,y) -> source (u,v).
 * Returns [a,b,c,d,e,f,g,h] where:
 *   u = (a*x + b*y + c) / (g*x + h*y + 1)
 *   v = (d*x + e*y + f) / (g*x + h*y + 1)
 */
function solveHomography(dst: Point[], src: Point[]): number[] | null {
  const M: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i];
    const { x: u, y: v } = src[i];
    M.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    M.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const p = M[col][col];
    for (let c = col; c <= 8; c++) M[col][c] /= p;

    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let c = col; c <= 8; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map((row) => row[8]);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function ImageEditor({
  billId,
  hasOriginal,
  version,
  isPdf,
  onClose,
  onSaved,
}: {
  billId: string;
  hasOriginal: boolean;
  version: string;
  isPdf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslations();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const [grayscale, setGrayscale] = useState(false);
  const [contrast, setContrast] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [corners, setCorners] = useState<Point[] | null>(null);
  const [activeCorner, setActiveCorner] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterCss = `grayscale(${grayscale ? 1 : 0}) contrast(${contrast}%) brightness(${brightness}%)`;

  // Resolves the actual pixel source before any of the crop/filter logic
  // below ever runs. For a plain image, that's just the file URL, exactly
  // as before. For a PDF, its first page is rendered to an offscreen
  // canvas first and handed off as a normal image data URL — everything
  // downstream stays completely unaware a PDF was ever involved.
  useEffect(() => {
    let cancelled = false;
    setImgSrc(null);
    setSourceError(null);

    async function loadSource() {
      if (!isPdf) {
        setImgSrc(`/api/bills/${billId}/file?v=${version}`);
        return;
      }

      try {
        // Dynamic import — pdfjs-dist touches browser-only APIs and is a
        // heavy library not worth bundling into every page just for the
        // rare case someone opens this editor on a PDF.
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const doc = await pdfjsLib.getDocument({ url: `/api/bills/${billId}/file?v=${version}` }).promise;
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas");

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;

        if (!cancelled) setImgSrc(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) setSourceError(t("imageEditor.errorPdfRender"));
      }
    }
loadSource();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, version, isPdf]);

  function resetCorners() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    setCorners([
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ]);
  }

  useEffect(() => {
    function onResize() {
      if (!corners) resetCorners();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  function relativePoint(e: React.PointerEvent): Point {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(e.clientY - rect.top, rect.height)),
    };
  }

  function onCornerDown(index: number, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActiveCorner(index);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activeCorner === null || !corners) return;
    const p = relativePoint(e);
    setCorners(corners.map((c, i) => (i === activeCorner ? p : c)));
  }

  function onPointerUp() {
    setActiveCorner(null);
  }

  function reset() {
    resetCorners();
    setGrayscale(false);
    setContrast(100);
    setBrightness(100);
  }

  async function handleSave() {
    const img = imgRef.current;
    if (!img || !corners) return;

    setSaving(true);
    setError(null);

    // Let the UI paint the "processing" state before the blocking pixel loop.
    await new Promise((r) => setTimeout(r, 30));

    try {
      const scale = img.naturalWidth / img.clientWidth;
      const srcQuad = corners.map((c) => ({ x: c.x * scale, y: c.y * scale }));

      // Output size from the quad's average edge lengths.
      let outW = Math.max(distance(srcQuad[0], srcQuad[1]), distance(srcQuad[3], srcQuad[2]));
      let outH = Math.max(distance(srcQuad[0], srcQuad[3]), distance(srcQuad[1], srcQuad[2]));

      const longest = Math.max(outW, outH);
      if (longest > MAX_OUTPUT_EDGE) {
        const k = MAX_OUTPUT_EDGE / longest;
        outW *= k;
        outH *= k;
      }
      outW = Math.max(1, Math.round(outW));
      outH = Math.max(1, Math.round(outH));

      // Bake filters into a source canvas first.
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = img.naturalWidth;
      srcCanvas.height = img.naturalHeight;
      const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
      if (!srcCtx) throw new Error("canvas");
      srcCtx.filter = filterCss;
      srcCtx.drawImage(img, 0, 0);
      const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
      const sp = srcData.data;
      const sw = srcCanvas.width;
      const sh = srcCanvas.height;

      const dstQuad: Point[] = [
        { x: 0, y: 0 },
        { x: outW, y: 0 },
        { x: outW, y: outH },
        { x: 0, y: outH },
      ];

      const H = solveHomography(dstQuad, srcQuad);
      if (!H) throw new Error("degenerate");
      const [a, b, c, d, e, f, g, h] = H;

      const outCanvas = document.createElement("canvas");
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext("2d");
      if (!outCtx) throw new Error("canvas");
      const outData = outCtx.createImageData(outW, outH);
      const op = outData.data;

      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const denom = g * x + h * y + 1;
          const u = (a * x + b * y + c) / denom;
          const v = (d * x + e * y + f) / denom;

          const di = (y * outW + x) * 4;

          if (u < 0 || v < 0 || u >= sw - 1 || v >= sh - 1) {
            op[di] = 255;
            op[di + 1] = 255;
            op[di + 2] = 255;
            op[di + 3] = 255;
            continue;
          }

          // Bilinear sample
          const x0 = Math.floor(u);
          const y0 = Math.floor(v);
          const fx = u - x0;
          const fy = v - y0;
          const i00 = (y0 * sw + x0) * 4;
          const i10 = i00 + 4;
          const i01 = i00 + sw * 4;
          const i11 = i01 + 4;
          const w00 = (1 - fx) * (1 - fy);
          const w10 = fx * (1 - fy);
          const w01 = (1 - fx) * fy;
          const w11 = fx * fy;

          for (let ch = 0; ch < 3; ch++) {
            op[di + ch] =
              sp[i00 + ch] * w00 +
              sp[i10 + ch] * w10 +
              sp[i01 + ch] * w01 +
              sp[i11 + ch] * w11;
          }
          op[di + 3] = 255;
        }
      }

      outCtx.putImageData(outData, 0, 0);

      const blob: Blob | null = await new Promise((resolve) =>
        outCanvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("export");

      const formData = new FormData();
      formData.append("file", blob, "edited.jpg");

      const res = await fetch(`/api/bills/${billId}/image`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let code = `HTTP ${res.status}`;
        try {
          const data = await res.json();
          code = String(data.error);
        } catch {}
        setError(t(`imageEditor.error.${code}`));
        setSaving(false);
        return;
      }

      setSaving(false);
      onSaved();
      onClose();
    } catch {
      setError(t("imageEditor.errorExport"));
      setSaving(false);
    }
  }

  async function handleRevert() {
    if (!window.confirm(t("imageEditor.confirmRevert"))) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/bills/${billId}/image`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      setError(t("imageEditor.errorRevert"));
      return;
    }
    onSaved();
    onClose();
  }

  const polygonPoints = corners ? corners.map((c) => `${c.x},${c.y}`).join(" ") : "";

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          maxWidth: 900,
          width: "100%",
          maxHeight: "92vh",
          overflow: "auto",
          padding: "1.25rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
            {t("imageEditor.title")}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {error && <p style={{ color: "#c00", marginBottom: "0.75rem" }}>{error}</p>}

        {sourceError ? (
          <p style={{ color: "#c00" }}>{sourceError}</p>
        ) : !imgSrc ? (
          <p style={{ color: "#666" }}>{isPdf ? t("imageEditor.loadingPdf") : t("common.loading")}</p>
        ) : (
          <>
            <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem" }}>
              {t("imageEditor.cornerHint")}
            </p>

            <div
              ref={containerRef}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                position: "relative",
                display: "inline-block",
                maxWidth: "100%",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              <img
                ref={imgRef}
                src={imgSrc}
                alt=""
                draggable={false}
                onLoad={resetCorners}
                style={{ maxWidth: "100%", display: "block", filter: filterCss }}
              />

              {corners && (
                <svg
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                >
                  <polygon
                    points={polygonPoints}
                    fill="rgba(6,69,173,0.10)"
                    stroke="#0645AD"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                </svg>
              )}

              {corners &&
                corners.map((c, i) => (
                  <div
                    key={i}
                    onPointerDown={(e) => onCornerDown(i, e)}
                    style={{
                      position: "absolute",
                      left: c.x - 14,
                      top: c.y - 14,
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      border: "2px solid #0645AD",
                      background: activeCorner === i ? "#0645AD" : "rgba(255,255,255,0.85)",
                      cursor: "grab",
                      touchAction: "none",
                    }}
                  />
                ))}
            </div>

            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={grayscale}
                  onChange={(e) => setGrayscale(e.target.checked)}
                />
                {t("imageEditor.blackWhite")}
              </label>

              <label style={{ fontSize: "0.9rem" }}>
                {t("imageEditor.contrast")}: {contrast}%
                <input
                  type="range"
                  min={50}
                  max={250}
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </label>

              <label style={{ fontSize: "0.9rem" }}>
                {t("imageEditor.brightness")}: {brightness}%
                <input
                  type="range"
                  min={50}
                  max={180}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </label>
            </div>

            <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: "0.5rem 1rem", background: "#111", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}
              >
                {t("imageEditor.apply")}
              </button>
              <button
                onClick={reset}
                disabled={saving}
                style={{ padding: "0.5rem 1rem", background: "#fff", color: "#111", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
              >
                {t("imageEditor.reset")}
              </button>
              {hasOriginal && (
                <button
                  onClick={handleRevert}
                  disabled={saving}
                  style={{ padding: "0.5rem 1rem", background: "#fff", color: "#a60", border: "1px solid #a60", borderRadius: 4, cursor: "pointer" }}
                >
                  {t("imageEditor.revert")}
                </button>
              )}
              {saving && (
                <span style={{ alignSelf: "center", color: "#666", fontSize: "0.85rem" }}>
                  {t("imageEditor.processing")}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
