/**
 * ZURI Driver App — backgroundLocation (DEPRECADO)
 *
 * REFACTOR 2026-09-18: este archivo definia el TaskManager de expo-location
 * para background tracking. Ahora esa responsabilidad la tiene el Foreground
 * Service de react-native-background-geolocation.
 *
 * Se mantiene como STUB con exports vacios para no romper imports residuales
 * mientras se limpia el codebase. Todas las funciones son no-op.
 */

export async function startBackgroundLocation(_conductorId: number): Promise<void> {
    // no-op — Transistorsoft gestiona su propio background service
}

export async function stopBackgroundLocation(): Promise<void> {
    // no-op
}

export async function isBackgroundLocationActive(): Promise<boolean> {
    // no-op — el estado real esta en BackgroundGeolocation.getState().enabled
    return false;
}
