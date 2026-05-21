'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { MAP_HTML } from '@/constants/mapHtml';

interface MapaDriverProps {
    lat: number;
    lng: number;
    zoom?: number;
    heading?: number;
}

export interface MapaDriverRef {
    recenter: () => void;
}

/**
 * MapaDriver — Leaflet map.
 *
 * Web:    iframe → /map.html (servido por Expo desde public/).
 * Native: WebView → MAP_URL  (mismo HTML hosteado en producción).
 *
 * Comunicación con el documento del mapa:
 *   parent → map: en web vía `iframe.contentWindow.postMessage`;
 *                en native vía `WebView.injectJavaScript("window.postMessage(...)")`.
 *   map → parent: en web vía `window.parent.postMessage`;
 *                en native vía `window.ReactNativeWebView.postMessage`.
 *
 * Tipos de mensajes:
 *   updateLocation { lat, lng, recenter?, zoom? }
 *   recenter       { lat, lng, zoom? }
 *   invalidate     {}
 *   mapReady       {}   (map → parent al cargar)
 */
export const MapaDriver = forwardRef<MapaDriverRef, MapaDriverProps>(
    ({ lat, lng, zoom = 16, heading }, ref) => {
        const iframeRef = useRef<HTMLIFrameElement | null>(null);
        const webViewRef = useRef<WebView | null>(null);
        const isReadyRef = useRef(false);
        const pendingRef = useRef<{ lat: number; lng: number; zoom: number; heading?: number } | null>(null);

        const post = (msg: any) => {
            if (Platform.OS === 'web') {
                const win = iframeRef.current?.contentWindow;
                if (!win) return;
                try { win.postMessage(msg, '*'); } catch { /* ignore */ }
            } else {
                const wv = webViewRef.current;
                if (!wv) return;
                const js = `window.postMessage(${JSON.stringify(msg)}, '*'); true;`;
                try { wv.injectJavaScript(js); } catch { /* ignore */ }
            }
        };

        useImperativeHandle(ref, () => ({
            recenter: () => {
                if (!lat || !lng) return;
                post({ type: 'recenter', lat, lng, zoom });
            },
        }));

        // ── Web: listen mapReady from iframe via window message ──────
        useEffect(() => {
            if (Platform.OS !== 'web') return;

            const onMessage = (event: MessageEvent) => {
                const msg = event.data || {};
                if (msg.type === 'mapReady') {
                    isReadyRef.current = true;
                    if (pendingRef.current) {
                        post({
                            type: 'updateLocation',
                            lat: pendingRef.current.lat, heading: pendingRef.current.heading,
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

        // ── Push coords whenever they change ─────────────────────────
        useEffect(() => {
            if (!lat || !lng) return;
            if (!isReadyRef.current) {
                pendingRef.current = { lat, lng, zoom, heading };
                return;
            }
            post({ type: 'updateLocation', lat, lng, heading });
        }, [lat, lng, zoom, heading]);

        // ── Native: WebView con mapa Leaflet ─────────────────────────
        if (Platform.OS !== 'web') {
            return (
                <View style={st.nativeContainer}>
                    <WebView
                        ref={webViewRef}
                        source={{ html: MAP_HTML }}
                        style={st.webview}
                        originWhitelist={['*']}
                        javaScriptEnabled
                        domStorageEnabled
                        geolocationEnabled
                        scalesPageToFit
                        startInLoadingState={false}
                        androidLayerType="hardware"
                        setSupportMultipleWindows={false}
                        onMessage={(event) => {
                            try {
                                const msg = JSON.parse(event.nativeEvent.data || '{}');
                                if (msg.type === 'mapReady') {
                                    isReadyRef.current = true;
                                    if (pendingRef.current) {
                                        post({
                                            type: 'updateLocation',
                                            lat: pendingRef.current.lat, heading: pendingRef.current.heading,
                                            lng: pendingRef.current.lng,
                                            zoom: pendingRef.current.zoom,
                                            recenter: true,
                                        });
                                        pendingRef.current = null;
                                    }
                                }
                            } catch { /* ignore */ }
                        }}
                    />
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
    nativeContainer: {
        flex: 1,
        backgroundColor: '#d6d6d6',
    },
    webview: {
        flex: 1,
        backgroundColor: '#d6d6d6',
    },
});
