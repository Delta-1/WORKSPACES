"use client";

// Mapa ao vivo dos motoristas (TransLog). Usa Leaflet + OpenStreetMap — sem
// chave de API. O pacote só é carregado no navegador (dynamic import dentro do
// useEffect), porque depende de `window`/`document` e não roda no servidor.

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type MapDriver = {
  id: string;
  nome: string;
  veiculo?: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_ping_at: string | null;
  gps_ativo: boolean | null;
};

export default function LogisticsMap({
  drivers, focusDriverId, height = 420, emptyHint = "Nenhum motorista com GPS ativo no momento.",
}: {
  drivers: MapDriver[];
  focusDriverId?: string | null;
  height?: number;
  emptyHint?: string;
}) {
  const elRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L: any = (mod as any).default ?? mod;
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true }).setView([-25.5, -54.5], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L: any = (mod as any).default ?? mod;
      if (cancelled || !mapRef.current) return;
      const map = mapRef.current;
      const seen = new Set<string>();
      const pts: [number, number][] = [];
      for (const d of drivers) {
        if (d.last_lat == null || d.last_lng == null) continue;
        seen.add(d.id);
        pts.push([d.last_lat, d.last_lng]);
        const color = d.gps_ativo ? "#34d399" : "#71717a";
        const icon = L.divIcon({
          className: "",
          html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #09090b;box-shadow:0 0 0 4px ${color}33"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        let marker = markersRef.current.get(d.id);
        if (!marker) {
          marker = L.marker([d.last_lat, d.last_lng], { icon }).addTo(map);
          markersRef.current.set(d.id, marker);
        } else {
          marker.setLatLng([d.last_lat, d.last_lng]);
          marker.setIcon(icon);
        }
        const ping = d.last_ping_at ? new Date(d.last_ping_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
        marker.bindPopup(`<b>${d.nome}</b>${d.veiculo ? `<br/>${d.veiculo}` : ""}<br/><span style="color:#a1a1aa">Última atualização: ${ping}</span>`);
      }
      for (const [id, marker] of markersRef.current) {
        if (!seen.has(id)) { marker.remove(); markersRef.current.delete(id); }
      }
      if (focusDriverId) {
        const d = drivers.find((x) => x.id === focusDriverId);
        if (d?.last_lat != null && d?.last_lng != null) map.setView([d.last_lat, d.last_lng], 13);
      } else if (pts.length > 0) {
        map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 12 });
      }
    })();
    return () => { cancelled = true; };
  }, [ready, drivers, focusDriverId]);

  const anyOnMap = drivers.some((d) => d.last_lat != null && d.last_lng != null);

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10" style={{ height }}>
      <div ref={elRef} className="w-full h-full bg-zinc-900" />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500 bg-zinc-900">Carregando mapa…</div>}
      {ready && !anyOnMap && <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500 bg-zinc-950/70 pointer-events-none text-center px-6">{emptyHint}</div>}
    </div>
  );
}
