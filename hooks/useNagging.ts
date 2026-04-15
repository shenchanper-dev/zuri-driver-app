import { useEffect, useRef, useCallback } from 'react';
import { Vibration, Platform } from 'react-native';

const NAGGING_INTERVAL = 3 * 60 * 1000; // 3 minutos

/**
 * Fires onReaparecer every 3 minutes while activo=true.
 * Vibrates on native; silent on web.
 * Uses a stable ref for the callback so it never goes stale.
 */
export function useNagging(activo: boolean, onReaparecer: () => void) {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Keep callback ref current without recreating the interval
    const callbackRef = useRef(onReaparecer);
    useEffect(() => { callbackRef.current = onReaparecer; });

    const detener = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const iniciar = useCallback(() => {
        detener();
        timerRef.current = setInterval(() => {
            if (Platform.OS !== 'web') {
                Vibration.vibrate([400, 200, 400, 200, 400]);
            }
            callbackRef.current();
        }, NAGGING_INTERVAL);
    }, [detener]);

    useEffect(() => {
        if (activo) iniciar();
        else detener();
        return detener;
    }, [activo, iniciar, detener]);

    return { iniciar, detener };
}
