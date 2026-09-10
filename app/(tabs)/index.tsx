import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, StatusBar, Platform, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { MapaDriver, MapaDriverRef } from '@/components/MapaDriver';
import { HomeBottomSheet } from '@/components/HomeBottomSheet';
import { ChatScreen } from '@/components/ChatScreen';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function HomeScreen() {
    const router = useRouter();
    const { conductor } = useAuthStore();
    usePushNotifications(conductor?.id);
    const {
        isTracking, iniciarTurno, finalizarTurno,
        verificarTurnoPeristido, isConnected, currentLocation,
    } = useLocationStore();

    const mapRef = useRef<MapaDriverRef>(null);
    const isOnline = isTracking;
    const [isToggling, setIsToggling]           = useState(false);
    const [serviciosResumen, setServiciosResumen] = useState({ pendientes: 0, activos: 0 });
    const [servicioActivoId, setServicioActivoId] = useState<number | null>(null);
    // Banner GPS: en turno pero sin GPS (apagado o sin permiso). Modelo Uber "Waiting for GPS".
    const [gpsWarning, setGpsWarning] = useState(false);
    const [chatOpen, setChatOpen]               = useState(false);

    // ── Load service counters ─────────────────────────────────────────────────
    const refrescarResumen = useCallback(async () => {
        try {
            const res = await driverApi.getServices();
            const todos: any[] = res.servicios ?? [];
            const activos = todos.filter((s: any) =>
                ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'].includes(s.estado)
            );
            setServiciosResumen({
                pendientes: todos.filter((s: any) => s.estado === 'ASIGNADO').length,
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
            const pendientes = todos.filter((s: any) => s.estado === 'ASIGNADO');
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
                ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'].includes(s.estado)
            );
            setServiciosResumen({ pendientes: pendientes.length, activos: activos.length });
            setServicioActivoId(activos[0]?.id ?? null);
        } catch (e) {
            console.error('[ZURI] Error verificando pendientes al conectar:', e);
        }
    }, [router]);

    // ── Toggle online/offline ─────────────────────────────────────────────────
    const handleToggleStatus = async () => {
        if (isToggling) return;
        setIsToggling(true);
        try {
            if (!isOnline) {
                const gpsOk = await iniciarTurno();
                if (!gpsOk) {
                    Alert.alert(
                        'GPS no disponible',
                        'Verifica que el GPS esté activado y que la app tenga permisos de ubicación.',
                        [{ text: 'OK' }]
                    );
                    return;
                }
                try {
                    await driverApi.updateProfile({ estadoServicio: 'DISPONIBLE' });
                } catch (e) {
                    console.warn('[Home] No se pudo actualizar estadoServicio:', e);
                }
                setIsToggling(false);
                socket.connect().then(connected => {
                    if (connected) useLocationStore.getState().setConnected(true);
                });
                checkServiciosPendientes();
            } else {
                await finalizarTurno();
                useLocationStore.getState().setConnected(false);
                socket.disconnect();
                try {
                    await driverApi.updateProfile({ estadoServicio: 'DESCONECTADO' });
                } catch (e) {
                    console.warn('[Home] No se pudo actualizar estadoServicio:', e);
                }
            }
        } finally {
            setIsToggling(false);
        }
    };

    // ── Mount: auto-resume turno, connect socket, load counters ──────────────
    useEffect(() => {
        verificarTurnoPeristido().then(reanudado => {
            if (reanudado) {
                console.log('[Home] Turno reanudado automáticamente');
            } else {
                iniciarTurno().then(ok => {
                    if (ok) {
                        console.log('[Home] GPS auto-iniciado al montar');
                        socket.connect().then(connected => {
                            if (connected) useLocationStore.getState().setConnected(true);
                        });
                    }
                });
            }
        });

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

    // ── GPS watchdog: en turno pero sin GPS (apagado o permiso denegado) ────────
    // Modelo Uber "Waiting for GPS": avisar pero permitir. Chequea al activarse el
    // turno y cada 15s mientras dure, y al volver a foreground (via currentLocation).
    useEffect(() => {
        if (!isOnline) { setGpsWarning(false); return; }
        let cancelled = false;
        const checkGps = async () => {
            try {
                const enabled = await Location.hasServicesEnabledAsync();
                const { status } = await Location.getForegroundPermissionsAsync();
                if (!cancelled) setGpsWarning(!enabled || status !== 'granted');
            } catch {
                if (!cancelled) setGpsWarning(false);
            }
        };
        checkGps();
        const iv = setInterval(checkGps, 15000);
        return () => { cancelled = true; clearInterval(iv); };
    }, [isOnline, currentLocation]);

    // ── Derived display values ────────────────────────────────────────────────
    const nombreCorto = conductor?.nombres
        || conductor?.nombreCompleto?.split(' ')[0]
        || 'Conductor';
    const inicial = nombreCorto.charAt(0).toUpperCase();

    const headerPaddingTop = Platform.OS === 'web' ? 16 : 50;

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

            {/* BANNER GPS: en turno pero sin GPS (apagado / sin permiso) */}
            {gpsWarning && (
                <TouchableOpacity
                    style={s.gpsBanner}
                    activeOpacity={0.85}
                    onPress={async () => {
                        const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
                        if (!enabled) {
                            Alert.alert(
                                'GPS desactivado',
                                'Activa la ubicación (GPS) de tu teléfono para poder recibir servicios.'
                            );
                        } else {
                            const { status } = await Location.requestForegroundPermissionsAsync();
                            if (status === 'granted') setGpsWarning(false);
                        }
                    }}
                >
                    <Text style={s.gpsBannerIcon}>📡</Text>
                    <Text style={s.gpsBannerTx}>GPS desactivado — actívalo para recibir servicios</Text>
                </TouchableOpacity>
            )}

            {/* FAB recentrar */}
            <TouchableOpacity
                style={s.fab}
                onPress={() => mapRef.current?.recenter()}
                activeOpacity={0.8}
            >
                <Text style={s.fabIcon}>📍</Text>
            </TouchableOpacity>

            {/* BOTTOM SHEET FLOTANTE */}
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

    // Floating header card
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

    // FAB recentrar
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
    gpsBanner: {
        position: 'absolute',
        top: Platform.OS === 'web' ? 70 : 104,
        left: SPACING[4],
        right: SPACING[4],
        backgroundColor: '#F59E0B',
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        zIndex: 20,
        ...SHADOW.elevated,
    },
    gpsBannerIcon: { fontSize: 16 },
    gpsBannerTx: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
});

// Web-only override applied inline — keeps StyleSheet types clean
// @ts-ignore
const webRoot: any = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    height: '100dvh',
    width: '100vw',
};
