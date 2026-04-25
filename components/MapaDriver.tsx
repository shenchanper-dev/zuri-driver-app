'use client';

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

interface MapaDriverProps {
    lat: number;
    lng: number;
    zoom?: number;
    height?: number | string;
}

export function MapaDriver({ lat, lng, zoom = 16, height = '100%' }: MapaDriverProps) {
    const mapRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        if (!containerRef.current) return;
        if (mapRef.current) return;

        import('leaflet').then((L) => {
            delete (L.Icon.Default.prototype as any)._getIconUrl;
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
                iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
                shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
            });

            const map = L.map(containerRef.current!, {
                zoomControl: false,
                attributionControl: false,
            }).setView([lat, lng], zoom);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
            }).addTo(map);

            const driverIcon = L.divIcon({
                html: `
                    <div style="
                        width:44px;height:44px;
                        background:#1F2937;
                        border:3px solid white;
                        border-radius:50%;
                        box-shadow:0 2px 8px rgba(0,0,0,0.4);
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-size:20px;
                    ">🚗</div>
                `,
                className: '',
                iconSize: [44, 44],
                iconAnchor: [22, 22],
            });

            const marker = L.marker([lat, lng], { icon: driverIcon }).addTo(map);

            mapRef.current = map;
            markerRef.current = marker;
        });

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
                markerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!mapRef.current || !markerRef.current) return;
        if (!lat || !lng) return;
        const latlng: [number, number] = [lat, lng];
        markerRef.current.setLatLng(latlng);
        mapRef.current.panTo(latlng, { animate: true, duration: 0.5 });
    }, [lat, lng]);

    if (Platform.OS !== 'web') return null;

    return (
        <>
            <style>{`
                .leaflet-container { background: #1F2937; }
                .leaflet-control-attribution { display: none !important; }
            `}</style>
            <div ref={containerRef} style={{ width: '100%', height, minHeight: 200 }} />
        </>
    );
}
