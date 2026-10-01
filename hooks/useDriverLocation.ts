/**
 * useDriverLocation (NUEVO) — expo-location SOLO para currentLocation del mapa
 * (centrado + polilinea en index.tsx). Aislado: alimenta UNICAMENTE
 * store.updateLocation; NO toca el chip (isTracking real vive en el SDK).
 * NO pide permisos (solo getForegroundPermissionsAsync).
 */
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useLocationStore } from '@/stores/location';

function raceTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export function useDriverLocation() {
  const update = useLocationStore((s) => s.updateLocation);
  const subRef = useRef<any>(null);
  const webIdRef = useRef<number | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const feed = (loc: any) => update({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      heading: loc.coords.heading ?? undefined,
      speed: loc.coords.speed ?? undefined,
      accuracy: loc.coords.accuracy ?? undefined,
      timestamp: new Date(loc.timestamp ?? Date.now()).toISOString(),
    });

    const stop = () => {
      try { subRef.current?.remove?.(); } catch { /* no-op */ }
      subRef.current = null;
      if (webIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(webIdRef.current);
        webIdRef.current = null;
      }
    };

    const active = () => !cancelled && AppState.currentState === 'active';

    const start = async () => {
      if (startingRef.current || subRef.current) return;
      startingRef.current = true;
      try {
        if (Platform.OS === 'web') {
          if (typeof navigator === 'undefined' || !navigator.geolocation || webIdRef.current != null) return;
          webIdRef.current = navigator.geolocation.watchPosition(
            (p) => feed(p), () => { /* no-op */ },
            { enableHighAccuracy: false, maximumAge: 5000, timeout: 8000 },
          );
          return;
        }
        const Location = await import('expo-location');
        if (!active()) return;
        const { status } = await Location.getForegroundPermissionsAsync(); // SOLO check, nunca request
        if (!active() || status !== 'granted') return;
        // fix inicial NO bloqueante (timeout 8s); si no llega, el watch lo llena
        const first = await raceTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 8000,
        );
        if (!active()) return;
        if (first) feed(first);
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
          (loc) => feed(loc),
        );
        if (!active()) { try { sub.remove(); } catch { /* no-op */ } return; }
        subRef.current = sub;
      } finally {
        startingRef.current = false;
      }
    };

    start();

    const onAppState = (st: AppStateStatus) => {
      if (st === 'active') start();
      else stop(); // background/inactive -> desuscribe (el SDK nativo sigue en bg)
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => { cancelled = true; stop(); appSub.remove(); };
  }, [update]);
}

export default useDriverLocation;
