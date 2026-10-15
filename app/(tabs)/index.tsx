import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, StatusBar, Platform, Modal, Linking, PermissionsAndroid, AppState,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { MapaDriver, MapaDriverRef } from '@/components/MapaDriver';
import { HomeBottomSheet } from '@/components/HomeBottomSheet';
import { ChatScreen } from '@/components/ChatScreen';
import { JornadaActivaView } from '@/components/JornadaActivaView';
import { JornadaEspecialView } from '@/components/JornadaEspecialView';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRef as useRefBS, useMemo as useMemoBS } from 'react';
import type { Servicio } from '@/types/servicios';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useDriverLocation } from '@/hooks/useDriverLocation';
import { isActive as trackingIsActive, restart } from '@/services/traccarTracking';

export default function HomeScreen() {
    const router = useRouter();
    const { conductor } = useAuthStore();
    usePushNotifications(conductor?.id);

    // currentLocation lo alimenta useDriverLocation (expo-location, solo mapa).
    const { currentLocation } = useLocationStore();
    useDriverLocation();

    // Estado "En linea" real = SDK Traccar (foreground service). NO flag local.
    const [online, setOnline] = useState(false);
    const [arDenied, setArDenied] = useState(false);

    const mapRef = useRef<MapaDriverRef>(null);
    const isOnline = online;
    const [isToggling, setIsToggling]           = useState(false);
    const [serviciosResumen, setServiciosResumen] = useState({ pendientes: 0, activos: 0 });
    const [servicios, setServicios] = useState<Servicio[]>([]);
    const [servicioActivoId, setServicioActivoId] = useState<number | null>(null);
    const [chatOpen, setChatOpen]               = useState(false);

    // ── Load service counters ─────────────────────────────────────────────────
    const refrescarResumen = useCallback(async () => {
        try {
            const res = await driverApi.getServices();
            const todos: Servicio[] = res.servicios ?? [];
            setServicios(todos);
            const activos = todos.filter((s) =>
                ['PENDIENTE', 'EN_RUTA_ORIGEN', 'EN_ORIGEN', 'EN_RUTA_DESTINO', 'EN_DESTINO'].includes(s.estado)
            );
            setServiciosResumen({
                pendientes: todos.filter((s) => s.estado === 'PENDIENTE').length,
                activos: activos.length,
            });
            setServicioActivoId(activos[0]?.id ?? null);
        } catch {
            // Silently ignore — home is informational only
        }
    }, []);

    // ── Check for pending services assigned while offline ─────────────────────
    const checkServiciosPendientes = useCallback(async () => {
        try {
            const res = await driverApi.getServices();
            const todos: any[] = res.servicios ?? [];
            const pendientes = todos.filter((s: any) => s.estado === 'PENDIENTE');
            if (pendientes.length > 0) {
                Alert.alert(
                    '🔔 Tienes servicios pendientes',
                    `Se te asignaron ${pendientes.length} servicio${pendientes.length > 1 ? 's' : ''} mientras estabas desconectado.\n\nRevisa la sección "Servicios" para aceptarlos.`,
                    [
                        { text: 'Ver ahora', onPress: () => router.push('/(tabs)/services') },
                        { text: 'Más tarde', style: 'cancel' },
                    ]
                );
            }
            const activos = todos.filter((s: any) =>
                ['PENDIENTE', 'EN_RUTA_ORIGEN', 'EN_ORIGEN', 'EN_RUTA_DESTINO', 'EN_DESTINO'].includes(s.estado)
            );
            setServiciosResumen({ pendientes: pendientes.length, activos: activos.length });
            setServicioActivoId(activos[0]?.id ?? null);
        } catch (e) {
            console.error('[ZURI] Error verificando pendientes al conectar:', e);
        }
    }, [router]);

    // Mount: connect socket, load counters
    useEffect(() => {
        if (conductor?.id) {
            socket.setDriverId(conductor.id);
            socket.connect().then(connected => {
                if (connected) {
                    console.log('[Home] Socket auto-connected on mount');
                    useLocationStore.getState().setConnected(true);
                }
            });
        }

        refrescarResumen();

        const handleServiceAssigned = (data: any) => {
            console.log('[Home] service:assigned received — tipo:', data?.tipo, '— reloading counters');
            refrescarResumen();
        };

        socket.on('service:assigned', handleServiceAssigned);
        socket.on('service:updated', refrescarResumen);

        const unsubConnection = socket.onConnectionChange((connected) => {
            useLocationStore.getState().setConnected(connected);
        });

        return () => {
            socket.off('service:assigned', handleServiceAssigned);
            socket.off('service:updated', refrescarResumen);
            unsubConnection();
        };
    }, [conductor?.id]);

    // ── Route tracking: add points to map polyline during active service ────
    const prevServiceId = useRef<number | null>(null);

    useEffect(() => {
        if (servicioActivoId !== prevServiceId.current) {
            mapRef.current?.clearRoute();
            prevServiceId.current = servicioActivoId;
        }
        if (currentLocation && servicioActivoId) {
            mapRef.current?.addRoutePoint(currentLocation.latitude, currentLocation.longitude);
        }
    }, [currentLocation, servicioActivoId]);

    // ── Chip "En linea": refleja isActive() real del SDK (poll + al volver a foreground) ──
    useEffect(() => {
        let cancel = false;
        const tick = async () => { const a = await trackingIsActive(); if (!cancel) setOnline(a); };
        tick();
        const iv = setInterval(tick, 10000);
        const sub = AppState.addEventListener('change', (st) => { if (st === 'active') tick(); });
        return () => { cancel = true; clearInterval(iv); sub.remove(); };
    }, []);

    // ── Aviso ACTIVITY_RECOGNITION denegado (SOLO check, nunca request; Android 10+/API29) ──
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        if (typeof Platform.Version === 'number' && Platform.Version < 29) return;
        let cancel = false;
        const check = async () => {
            try {
                const granted = await PermissionsAndroid.check(
                    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION);
                if (!cancel) setArDenied(!granted);
            } catch { /* no-op */ }
        };
        check();
        const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
        return () => { cancel = true; sub.remove(); };
    }, []);

    // ── Derived display values ────────────────────────────────────────────────
    const nombreCorto = conductor?.nombres
        || conductor?.nombreCompleto?.split(' ')[0]
        || 'Conductor';
    const inicial = nombreCorto.charAt(0).toUpperCase();

    const headerPaddingTop = Platform.OS === 'web' ? 16 : 50;

    // Bottom sheet: 3 snap points (colapsado 110px, medio 45%, expandido 85%)
    const bsRef = useRefBS<BottomSheet>(null);
    const snapPoints = useMemoBS(() => ['110', '45%', '85%'], []);

    // Agrupar servicios por jornada.id. La jornada activa (PUBLICADA/ACTIVA) manda.
    const serviciosConJornada = servicios.filter(sv => sv.jornada);
    const jornadaActiva = (() => {
        if (serviciosConJornada.length === 0) return null;
        // Buscar jornada ACTIVA primero, luego PUBLICADA
        const porEstado = ['ACTIVA', 'PUBLICADA'];
        for (const estado of porEstado) {
            const match = serviciosConJornada.find(sv => sv.jornada?.estado === estado);
            if (match) {
                const jid = match.jornada!.id;
                return serviciosConJornada.filter(sv => sv.jornada?.id === jid);
            }
        }
        return null;
    })();

    return (
        <View style={[s.root, Platform.OS === 'web' ? webRoot : null]}>
            <StatusBar barStyle="light-content" backgroundColor="#1F2937" translucent={false} />

            {/* MAPA FULLSCREEN */}
            <MapaDriver
                ref={mapRef}
                lat={currentLocation?.latitude ?? -12.1462}
                lng={currentLocation?.longitude ?? -76.9954}
                heading={currentLocation?.heading}
            />

            {/* HEADER FLOTANTE */}
            <View style={[s.headerCard, { paddingTop: headerPaddingTop }]} pointerEvents="box-none">
                <View style={s.headerInner}>
                    <View style={s.headerLeft}>
                        <Text style={s.headerHola}>Hola,</Text>
                        <Text style={s.headerNombre}>{nombreCorto}</Text>
                    </View>
                    <View style={s.avatar}>
                        <Text style={s.avatarTx}>{inicial}</Text>
                    </View>
                </View>
            </View>

            {/* CHIP DE ESTADO + (solo si !online) boton Reconectar. alpha.5: sin "Finalizar jornada". */}
            <View style={s.statusChipRow} pointerEvents="box-none">
                <View style={[s.statusChip, isOnline ? s.chipOnline : s.chipOffline]}>
                    <View style={[s.statusDot, isOnline ? s.dotOn : s.dotOff]} />
                    <Text style={s.statusTx}>{isOnline ? 'En línea' : 'Desconectado'}</Text>
                </View>
                {!isOnline && (
                    <TouchableOpacity
                        style={[s.statusAction, s.actionReconnect]}
                        disabled={isToggling}
                        onPress={() => {
                            (async () => {
                                setIsToggling(true);
                                try {
                                    const r = await restart();
                                    if (r === 'started') setOnline(true);
                                    else if (r === 'needs-login') router.replace('/(auth)/login');
                                    else Alert.alert('Sin conexión', 'No se pudo reconectar. Reintenta.');
                                } finally { setIsToggling(false); }
                            })();
                        }}
                    >
                        <Text style={s.statusActionTx}>Reconectar</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* BANNER ACTIVITY_RECOGNITION denegado (no altera el chip) */}
            {arDenied && (
                <TouchableOpacity style={s.arBanner} activeOpacity={0.85} onPress={() => Linking.openSettings()}>
                    <Text style={s.arBannerTx}>
                        Activa "Actividad física" para que ZURI funcione con el auto detenido
                    </Text>
                </TouchableOpacity>
            )}

            {/* "Ubicando…" NO bloqueante hasta la primera posición */}
            {!currentLocation && (
                <View style={s.locating} pointerEvents="none">
                    <Text style={s.locatingTx}>Ubicando…</Text>
                </View>
            )}

            {/* FAB recentrar */}
            <TouchableOpacity
                style={s.fab}
                onPress={() => mapRef.current?.recenter()}
                activeOpacity={0.8}
            >
                <Text style={s.fabIcon}>📍</Text>
            </TouchableOpacity>

            {/* BOTTOM: BottomSheet arrastrable con 3 snap points (patron Uber/Onfleet) */}
            {jornadaActiva ? (
                <BottomSheet
                    ref={bsRef}
                    snapPoints={snapPoints}
                    index={1}
                    enablePanDownToClose={false}
                    handleIndicatorStyle={{ backgroundColor: '#CBD5E1', width: 48, height: 5 }}
                    backgroundStyle={{ backgroundColor: '#FFFFFF' }}
                >
                    <BottomSheetView style={{ flex: 1 }}>
                        {jornadaActiva[0]?.jornada?.modo === 'NEMT' ? (
                            <JornadaActivaView
                                servicios={jornadaActiva}
                                onRefresh={refrescarResumen}
                            />
                        ) : (
                            <JornadaEspecialView
                                servicios={jornadaActiva}
                                onRefresh={refrescarResumen}
                            />
                        )}
                    </BottomSheetView>
                </BottomSheet>
            ) : (
                <HomeBottomSheet
                    isConnected={isOnline}
                    stats={{
                        completados: 0,
                        activos: serviciosResumen.activos,
                        pendientes: serviciosResumen.pendientes,
                    }}
                    hasServicioActivo={isOnline && serviciosResumen.activos > 0}
                    onOpenServicioActivo={() => router.push('/(tabs)/services')}
                    onOpenChat={servicioActivoId ? () => setChatOpen(true) : undefined}
                />
            )}

            {/* CHAT MODAL */}
            <Modal
                visible={chatOpen}
                animationType="slide"
                onRequestClose={() => setChatOpen(false)}
                presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
            >
                {chatOpen && servicioActivoId && conductor?.id && (
                    <ChatScreen
                        servicioId={servicioActivoId}
                        conductorId={conductor.id}
                        conductorNombre={
                            conductor.nombres
                            || conductor.nombreCompleto?.split(' ')[0]
                            || 'Conductor'
                        }
                        onClose={() => setChatOpen(false)}
                        zuriAiHabilitado={conductor?.zuriAiHabilitado ?? true}
                    />
                )}
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#1F2937',
    },
    headerCard: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        paddingHorizontal: SPACING[4],
        zIndex: 10,
    },
    headerInner: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        paddingHorizontal: SPACING[4],
        paddingVertical: SPACING[3],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...SHADOW.elevated,
    },
    headerLeft: { flex: 1 },
    headerHola: {
        fontSize: FONT.sizes.sm,
        color: COLORS.textMuted,
    },
    headerNombre: {
        fontSize: FONT.sizes.lg,
        fontWeight: FONT.weights.bold,
        color: COLORS.textPrimary,
    },
    avatar: {
        width: 40, height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarTx: {
        color: COLORS.textOnDark,
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.bold,
    },
    fab: {
        position: 'absolute',
        right: SPACING[4],
        bottom: 240,
        width: 48, height: 48,
        borderRadius: 24,
        backgroundColor: COLORS.card,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        ...SHADOW.elevated,
    },
    fabIcon: { fontSize: 20 },

    // Chip de estado + accion
    statusChipRow: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 70 : 104,
        left: SPACING[4],
        right: SPACING[4],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        zIndex: 20,
    },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: RADIUS.pill,
        ...SHADOW.elevated,
    },
    chipOnline: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
    chipOffline: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    dotOn: { backgroundColor: '#22C55E' },
    dotOff: { backgroundColor: '#9CA3AF' },
    statusTx: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary },
    statusAction: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: RADIUS.pill,
        ...SHADOW.elevated,
    },
    actionReconnect: { backgroundColor: COLORS.primary },
    statusActionTx: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Banner ACTIVITY_RECOGNITION
    arBanner: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 118 : 152,
        left: SPACING[4],
        right: SPACING[4],
        backgroundColor: '#DC2626',
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 14,
        zIndex: 20,
        ...SHADOW.elevated,
    },
    arBannerTx: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // "Ubicando…" no bloqueante
    locating: {
        position: 'absolute',
        bottom: 300,
        alignSelf: 'center',
        backgroundColor: 'rgba(31,41,55,0.85)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: RADIUS.pill,
        zIndex: 15,
    },
    locatingTx: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Overlay jornada activa
    jornadaOverlay: {
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: '55%',
    },
    jornadaCard: {
        flex: 1,
        marginHorizontal: 10,
        marginBottom: 10,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
    },
});

// Web-only override applied inline — keeps StyleSheet types clean
// @ts-ignore
const webRoot: any = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    height: '100dvh',
    width: '100vw',
};
