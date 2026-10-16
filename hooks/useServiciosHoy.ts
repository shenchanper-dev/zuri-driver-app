/**
 * useServiciosHoy — hook compartido para leer los servicios + jornada de HOY.
 *
 * Problema (PASO 0 APK 111): la pantalla Inicio (app/(tabs)/index.tsx) y la
 * pantalla Servicios (app/(tabs)/services.tsx) tenían copias independientes
 * de `useState<Servicio[]>` + llamadas a `driverApi.getServices()`. Resultado:
 * con una jornada ESPECIAL activa, los 3 tabs quedaban vacíos (sólo filtran
 * servicios individuales por estado; nunca ven la jornada).
 *
 * Este hook centraliza:
 *   - carga inicial con fecha=hoy_lima (filtro para no arrastrar días viejos),
 *   - polling 60s mientras el conductor está autenticado,
 *   - refresh on-foreground via AppState,
 *   - refresh manual via `refresh()` + estados `loading` / `refreshing`.
 *
 * Fuentes de verdad reutilizables: cualquier componente que necesite "los
 * servicios y jornadas del día" (tabs, Inicio, tiles de resumen) debería
 * consumir este hook en vez de volver a implementar polling.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { driverApi } from '@/services/api';
import { fechaLima } from '@/services/dates';
import { useAuthStore } from '@/stores/auth';
import type { Servicio } from '@/types/servicios';

interface UseServiciosHoyResult {
    services: Servicio[];
    loading: boolean;
    refreshing: boolean;
    /** Reload inmediato (sin tocar `refreshing`). */
    refresh: () => Promise<void>;
    /** Para el RefreshControl: pone refreshing=true + reload. */
    onRefresh: () => void;
}

export function useServiciosHoy(): UseServiciosHoyResult {
    const { conductor } = useAuthStore();
    const [services, setServices] = useState<Servicio[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            const hoy = fechaLima();
            const res = await driverApi.getServices({ fecha: hoy });
            if (res?.success) {
                setServices(res.servicios ?? []);
            } else if (res?.error) {
                console.warn('[useServiciosHoy] backend error:', res.error);
            }
        } catch (e) {
            console.error('[useServiciosHoy] exception:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Carga inicial
    useEffect(() => {
        load();
    }, [load]);

    // Polling 60s + refresh on foreground mientras hay conductor logueado.
    useEffect(() => {
        if (!conductor?.id) return;
        const iv = setInterval(load, 60_000);
        const sub = AppState.addEventListener('change', (st) => {
            if (st === 'active') load();
        });
        return () => {
            clearInterval(iv);
            sub.remove();
        };
    }, [conductor?.id, load]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        load();
    }, [load]);

    return { services, loading, refreshing, refresh: load, onRefresh };
}
