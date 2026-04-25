'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';

interface MapaDriverProps {
    lat: number;
    lng: number;
    zoom?: number;
}

export interface MapaDriverRef {
    recenter: () => void;
}

const MIN_DIM = 50;

export const MapaDriver = forwardRef<MapaDriverRef, MapaDriverProps>(
    ({ lat, lng, zoom = 16 }, ref) => {
        const mapRef = useRef<any>(null);
        const markerRef = useRef<any>(null);
        const containerRef = useRef<HTMLDivElement>(null);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const [size, setSize] = useState<{ w: number; h: number } | null>(null);
        const sizeIsValid = !!size && size.w >= MIN_DIM && size.h >= MIN_DIM;

        useImperativeHandle(ref, () => ({
            recenter: () => {
                if (!mapRef.current || !lat || !lng) return;
                mapRef.current.flyTo([lat, lng], zoom, { duration: 0.8 });
            },
        }));

        // ── Measure wrapper — multiple attempts to catch async layout ──────
        useEffect(() => {
            if (Platform.OS !== 'web') return;
            if (!wrapperRef.current) return;

            const wrap = wrapperRef.current;

            const measure = () => {
                const rect = wrap.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const w = Math.round(rect.width);
                    const h = Math.round(rect.height);
                    setSize(prev => {
                        if (prev && prev.w === w && prev.h === h) return prev;
                        return { w, h };
                    });
                }
            };

            measure();
            const t1 = setTimeout(measure, 50);
            const t2 = setTimeout(measure, 200);
            const t3 = setTimeout(measure, 600);

            let ro: ResizeObserver | null = null;
            if (typeof ResizeObserver !== 'undefined') {
                ro = new ResizeObserver(measure);
                ro.observe(wrap);
            }
            window.addEventListener('resize', measure);
            window.addEventListener('orientationchange', measure);

            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                if (ro) ro.disconnect();
                window.removeEventListener('resize', measure);
                window.removeEventListener('orientationchange', measure);
            };
        }, []);

        // ── Initialize Leaflet ONCE when size first valid ─────────────────
        useEffect(() => {
            if (Platform.OS !== 'web') return;
            if (!containerRef.current) return;
            if (!sizeIsValid) return;
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

                // Triple invalidateSize for tile reload reliability
                setTimeout(() => map.invalidateSize(), 50);
                setTimeout(() => map.invalidateSize(), 250);
                setTimeout(() => map.invalidateSize(), 800);
            });

            return () => {
                cancelled = true;
                if (mapRef.current) {
                    mapRef.current.remove();
                    mapRef.current = null;
                    markerRef.current = null;
                }
            };
        }, [sizeIsValid]);

        // ── invalidateSize on subsequent size changes (resize/orientation) ─
        useEffect(() => {
            if (!mapRef.current || !size) return;
            const t1 = setTimeout(() => mapRef.current?.invalidateSize(), 50);
            const t2 = setTimeout(() => mapRef.current?.invalidateSize(), 250);
            return () => {
                clearTimeout(t1);
                clearTimeout(t2);
            };
        }, [size?.w, size?.h]);

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

        // ── Web render — pixel-sized inner div, only when size valid ──────
        return (
            <div
                ref={wrapperRef}
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    overflow: 'hidden',
                    backgroundColor: '#1F2937',
                }}
            >
                {sizeIsValid && size && (
                    <div
                        ref={containerRef}
                        style={{
                            position: 'absolute',
                            top: 0, left: 0,
                            width: `${size.w}px`,
                            height: `${size.h}px`,
                        }}
                    />
                )}
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
