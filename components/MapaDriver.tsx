'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';

interface MapaDriverProps {
    lat: number;
    lng: number;
    zoom?: number;
}

export interface MapaDriverRef {
    recenter: () => void;
}

export const MapaDriver = forwardRef<MapaDriverRef, MapaDriverProps>(
    ({ lat, lng, zoom = 16 }, ref) => {
        const mapRef = useRef<any>(null);
        const markerRef = useRef<any>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const roRef = useRef<ResizeObserver | null>(null);

        useImperativeHandle(ref, () => ({
            recenter: () => {
                if (!mapRef.current || !lat || !lng) return;
                mapRef.current.flyTo([lat, lng], zoom, { duration: 0.8 });
            },
        }));

        // ── Init Leaflet once on mount ─────────────────────────────────────
        useEffect(() => {
            if (Platform.OS !== 'web') return;
            if (!containerRef.current) return;
            if (mapRef.current) return;

            let cancelled = false;

            import('leaflet').then((L) => {
                if (cancelled || !containerRef.current || mapRef.current) return;

                delete (L.Icon.Default.prototype as any)._getIconUrl;
                L.Icon.Default.mergeOptions({
                    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                });

                const map = L.map(containerRef.current, {
                    zoomControl: false,
                    attributionControl: false,
                    dragging: true,
                    touchZoom: true,
                    scrollWheelZoom: true,
                    doubleClickZoom: true,
                }).setView([lat || -12.1462, lng || -76.9954], zoom);

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                }).addTo(map);

                const driverIcon = L.divIcon({
                    html: `
                        <div style="position:relative;width:56px;height:56px;">
                          <div style="position:absolute;inset:0;background:rgba(31,41,55,0.18);border-radius:50%;animation:zuriPulse 2s infinite;"></div>
                          <div style="position:absolute;inset:8px;background:#1F2937;border:3px solid white;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;font-size:18px;">🚗</div>
                        </div>
                        <style>@keyframes zuriPulse{0%{transform:scale(0.7);opacity:0.9}100%{transform:scale(1.5);opacity:0}}</style>
                    `,
                    className: '',
                    iconSize: [56, 56],
                    iconAnchor: [28, 28],
                });

                const marker = L.marker([lat || -12.1462, lng || -76.9954], { icon: driverIcon }).addTo(map);

                mapRef.current = map;
                markerRef.current = marker;

                // ResizeObserver: re-measure on any container size change
                if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
                    const ro = new ResizeObserver(() => {
                        if (mapRef.current) mapRef.current.invalidateSize();
                    });
                    ro.observe(containerRef.current);
                    roRef.current = ro;
                }

                // Multiple invalidateSize at increasing delays to catch async layout
                setTimeout(() => map.invalidateSize(), 0);
                setTimeout(() => map.invalidateSize(), 100);
                setTimeout(() => map.invalidateSize(), 500);
                setTimeout(() => map.invalidateSize(), 1500);
            });

            return () => {
                cancelled = true;
                if (roRef.current) {
                    roRef.current.disconnect();
                    roRef.current = null;
                }
                if (mapRef.current) {
                    mapRef.current.remove();
                    mapRef.current = null;
                    markerRef.current = null;
                }
            };
        }, []);

        // ── Update marker position when coords change ──────────────────────
        useEffect(() => {
            if (!mapRef.current || !markerRef.current) return;
            if (!lat || !lng) return;
            const latlng: [number, number] = [lat, lng];
            markerRef.current.setLatLng(latlng);
            mapRef.current.panTo(latlng, { animate: true, duration: 0.5 });
        }, [lat, lng]);

        // ── Native (APK future): placeholder ───────────────────────────────
        if (Platform.OS !== 'web') {
            return <View style={st.placeholder} />;
        }

        // ── Web: nested position:absolute inset:0 — explicit dims via CSS ─
        return (
            <div
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    overflow: 'hidden',
                    backgroundColor: '#1F2937',
                }}
            >
                <div
                    ref={containerRef}
                    style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        width: '100%',
                        height: '100%',
                    }}
                />
            </div>
        );
    }
);

MapaDriver.displayName = 'MapaDriver';

const st = StyleSheet.create({
    placeholder: {
        flex: 1,
        backgroundColor: '#1F2937',
    },
});
