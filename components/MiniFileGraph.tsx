"use client";

import { useEffect, useRef, useState } from "react";
import type { FileNodeRow } from "@/lib/types";

type P = { id: string; name: string; type: "folder" | "file"; parent: string | null; x: number; y: number; vx: number; vy: number };

// Grafo físico compacto (só leitura) estilo Obsidian, para mostrar as pastas
// às quais a IA tem acesso. Reaproveita a mesma ideia de forças do grafo geral.
export default function MiniFileGraph({ files, height = 260 }: { files: FileNodeRow[]; height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<P[]>([]);
  const rafRef = useRef<number | null>(null);
  const alphaRef = useRef(0);
  const [, force] = useState(0);
  const sizeRef = useRef({ w: 400, h: height });

  useEffect(() => {
    const el = wrapRef.current;
    const w = el?.clientWidth || 400;
    sizeRef.current = { w, h: height };
    nodesRef.current = files.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      parent: f.parent_id,
      x: w / 2 + (Math.random() - 0.5) * 120,
      y: height / 2 + (Math.random() - 0.5) * 120,
      vx: 0,
      vy: 0,
    }));
    alphaRef.current = 1;
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, height]);

  function tick() {
    const list = nodesRef.current;
    const { w, h } = sizeRef.current;
    const cx = w / 2;
    const cy = h / 2;
    const CHARGE = 4200;
    const LINK_LEN = 60;
    const LINK_K = 0.05;
    const GRAVITY = 0.04;
    const FRICTION = 0.74;
    const byId = new Map(list.map((n) => [n.id, n]));
    const fx = new Map<string, number>();
    const fy = new Map<string, number>();
    for (const n of list) {
      fx.set(n.id, (cx - n.x) * GRAVITY);
      fy.set(n.id, (cy - n.y) * GRAVITY);
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = Math.random();
          dy = Math.random();
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        const rep = CHARGE / d2;
        fx.set(a.id, (fx.get(a.id) ?? 0) + (dx / d) * rep);
        fy.set(a.id, (fy.get(a.id) ?? 0) + (dy / d) * rep);
        fx.set(b.id, (fx.get(b.id) ?? 0) - (dx / d) * rep);
        fy.set(b.id, (fy.get(b.id) ?? 0) - (dy / d) * rep);
      }
    }
    for (const n of list) {
      if (!n.parent) continue;
      const p = byId.get(n.parent);
      if (!p) continue;
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force2 = (d - LINK_LEN) * LINK_K;
      fx.set(n.id, (fx.get(n.id) ?? 0) - (dx / d) * force2);
      fy.set(n.id, (fy.get(n.id) ?? 0) - (dy / d) * force2);
      fx.set(p.id, (fx.get(p.id) ?? 0) + (dx / d) * force2);
      fy.set(p.id, (fy.get(p.id) ?? 0) + (dy / d) * force2);
    }
    const alpha = alphaRef.current;
    for (const n of list) {
      n.vx = Math.max(-30, Math.min(30, (n.vx + (fx.get(n.id) ?? 0)) * FRICTION));
      n.vy = Math.max(-30, Math.min(30, (n.vy + (fy.get(n.id) ?? 0)) * FRICTION));
      n.x = Math.max(20, Math.min(w - 20, n.x + n.vx * alpha));
      n.y = Math.max(20, Math.min(h - 24, n.y + n.vy * alpha));
    }
    alphaRef.current = alpha * 0.985;
    force((v) => v + 1);
    if (alphaRef.current > 0.02) rafRef.current = requestAnimationFrame(tick);
    else rafRef.current = null;
  }

  const list = nodesRef.current;
  const byId = new Map(list.map((n) => [n.id, n]));

  return (
    <div ref={wrapRef} className="relative w-full rounded-xl bg-black/20 border border-white/10 overflow-hidden" style={{ height }}>
      {files.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-gray-500 italic">
          Sem pastas ainda — adicione arquivos à base de conhecimento.
        </div>
      ) : (
        <>
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {list.map((n) => {
              if (!n.parent) return null;
              const p = byId.get(n.parent);
              if (!p) return null;
              return (
                <line key={n.id} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke="var(--accent)" strokeOpacity={0.3} strokeWidth={1.2} />
              );
            })}
          </svg>
          {list.map((n) => {
            const r = n.type === "folder" ? 9 : 5;
            return (
              <div
                key={n.id}
                className="absolute rounded-full"
                style={{
                  left: n.x - r,
                  top: n.y - r,
                  width: r * 2,
                  height: r * 2,
                  background: n.type === "folder" ? "var(--accent)" : "#334155",
                  boxShadow: n.type === "folder" ? "0 0 8px var(--accent)" : "none",
                }}
                title={n.name}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
