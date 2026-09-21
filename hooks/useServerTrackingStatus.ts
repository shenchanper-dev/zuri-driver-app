/**
 * ZURI Driver App — useServerTrackingStatus
 *
 * Deriva el estado "En linea" HONESTO desde el backend:
 *  - Se suscribe al evento onHttp de BackgroundGeolocation.
 *  - Cada vez que llega ACK 2xx del server -> lastServerAckAt = now.
 *  - Cada 15s revisa: si getState().enabled=true Y lastServerAck<120s -> online.
 *  - Si el ack tiene >120s -> "Reconectando..."
 *
 * Ventaja vs isTracking del store: refleja la realidad del server, no un flag local.
 */

import { useEffect, useState, useRef } from 'react';
import BackgroundGeolocation from 'react-native-background-geolocation';

export type ServerStatus = 'online' | 'reconnecting' | 'offline';

export interface UseServerTrackingStatusReturn {
    status: ServerStatus;
    lastServerAckSec: number | null;
    enabled: boolean;
}

const RECONNECT_THRESHOLD_SEC = 120;

export function useServerTrackingStatus(): UseServerTrackingStatusReturn {
    const [enabled, setEnabled] = useState(false);
    const [lastServerAckSec, setLastServerAckSec] = useState<number | null>(null);
    const lastAckAtRef = useRef<number | null>(null);

    useEffect(() => {
        // Suscribirse al onHttp para trackear ACKs
        const sub = BackgroundGeolocation.onHttp((response: any) => {
            if (response.success) {
                lastAckAtRef.current = Date.now();
            }
        });
        return () => {
            try { sub.remove?.(); } catch { /* no-op */ }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            try {
                const state = await BackgroundGeolocation.getState();
                if (cancelled) return;
                setEnabled(state.enabled);
                if (lastAckAtRef.current) {
                    setLastServerAckSec(Math.floor((Date.now() - lastAckAtRef.current) / 1000));
                }
            } catch {
                if (!cancelled) setEnabled(false);
            }
        };
        tick();
        const iv = setInterval(tick, 15000);
        return () => { cancelled = true; clearInterval(iv); };
    }, []);

    let status: ServerStatus = 'offline';
    if (enabled) {
        if (lastServerAckSec === null || lastServerAckSec > RECONNECT_THRESHOLD_SEC) {
            status = 'reconnecting';
        } else {
            status = 'online';
        }
    }

    return { status, lastServerAckSec, enabled };
}

export default useServerTrackingStatus;
