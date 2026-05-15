'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';

interface MapaDriverProps {
    lat: number;
    lng: number;
    zoom?: number;
}

export interface MapaDriverRef {
    recenter: () => void;
}

/**
 * MapaDriver — Iframe-based Leaflet map.
 *
 * El mapa vive en /map.html, un archivo HTML estático servido por Expo
 * desde public/. Esto lo aísla completamente del runtime de React Native
 * Web, evitando los bugs de layout documentados (RNW#940).
 *
 * Comunicación con el iframe:
 *   parent → iframe: iframe.contentWindow.postMessage({type, ...})
 *   iframe → parent: window.parent.postMessage({type, ...})
 *
 * Tipos de mensajes:
 *   updateLocation { lat, lng, recenter?, zoom? }
 *   recenter       { lat, lng, zoom? }
 *   invalidate     {}                    -- forzar redimensión
 *   mapReady       {}                    -- iframe → parent al cargar
 */
export const MapaDriver = forwardRef<MapaDriverRef, MapaDriverProps>(
    ({ lat, lng, zoom = 16 }, ref) => {
        const iframeRef = useRef<HTMLIFrameElement | null>(null);
        const isReadyRef = useRef(false);
        const pendingRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);

        const post = (msg: any) => {
            if (Platform.OS !== 'web') return;
            const win = iframeRef.current?.contentWindow;
            if (!win) return;
            try {
                win.postMessage(msg, '*');
            } catch {
                /* ignore */
            }
        };

        useImperativeHandle(ref, () => ({
            recenter: () => {
                if (!lat || !lng) return;
                post({ type: 'recenter', lat, lng, zoom });
            },
        }));

        // ── Listen para mapReady desde el iframe ─────────────────────
        useEffect(() => {
            if (Platform.OS !== 'web') return;

            const onMessage = (event: MessageEvent) => {
                const msg = event.data || {};
                if (msg.type === 'mapReady') {
                    isReadyRef.current = true;
                    if (pendingRef.current) {
                        post({
                            type: 'updateLocation',
                            lat: pendingRef.current.lat,
                            lng: pendingRef.current.lng,
                            zoom: pendingRef.current.zoom,
                            recenter: true,
                        });
                        pendingRef.current = null;
                    }
                }
            };

            window.addEventListener('message', onMessage);
            return () => window.removeEventListener('message', onMessage);
        }, []);

        // ── Push de coordenadas al iframe cada vez que cambian ───────
        useEffect(() => {
            if (Platform.OS !== 'web') return;
            if (!lat || !lng) return;
            if (!isReadyRef.current) {
                pendingRef.current = { lat, lng, zoom };
                return;
            }
            post({ type: 'updateLocation', lat, lng });
        }, [lat, lng, zoom]);

        // ── Native: fondo con coordenadas GPS ────────────────────────
        if (Platform.OS !== 'web') {
            const hasCoords = lat !== -12.1462 || lng !== -76.9954;
            return (
                <View style={st.placeholder}>
                    <Text style={st.placeholderIcon}>📍</Text>
                    <Text style={st.placeholderLabel}>GPS Activo</Text>
                    {hasCoords && (
                        <Text style={st.placeholderCoords}>
                            {lat.toFixed(5)}, {lng.toFixed(5)}
                        </Text>
                    )}
                </View>
            );
        }

        // ── Web: iframe full-screen vía position:fixed ───────────────
        return (
            <iframe
                ref={iframeRef}
                src="/map.html"
                title="ZURI Map"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    border: 'none',
                    margin: 0,
                    padding: 0,
                    zIndex: 0,
                    backgroundColor: '#1F2937',
                }}
                allow="geolocation"
            />
        );
    }
);

MapaDriver.displayName = 'MapaDriver';

const st = StyleSheet.create({
    placeholder: {
        flex: 1,
        backgroundColor: '#0F172A',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    placeholderIcon: {
        fontSize: 40,
        marginBottom: 4,
    },
    placeholderLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#94A3B8',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    placeholderCoords: {
        fontSize: 12,
        color: '#475569',
        fontVariant: ['tabular-nums'],
    },
});
