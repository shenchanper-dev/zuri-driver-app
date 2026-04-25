import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Alert, StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';
import { MapaDriver, MapaDriverRef } from '@/components/MapaDriver';
import { HomeBottomSheet } from '@/components/HomeBottomSheet';

export default function HomeScreen() {
    const router = useRouter();
    const { conductor } = useAuthStore();
    const {
        isTracking, iniciarTurno, finalizarTurno,
        verificarTurnoPeristido, isConnected, currentLocation,
    } = useLocationStore();

    const mapRef = useRef<MapaDriverRef>(null);
    const isOnline = isTracking;
    const [isToggling, setIsToggling] = useState(false);
    const [serviciosResumen, setServiciosResumen] = useState({ pendientes: 0, activos: 0 });

    // ── Load service counters ─────────────────────────────────────────────────
    const refrescarResumen = useCallback(async () => {
        try {
            const res = await driverApi.getServices();
            const todos: any[] = res.servicios ?? [];
            setServiciosResumen({
                pendientes: todos.filter((s: any) => s.estado === 'ASIGNADO').length,
                activos: todos.filter((s: any) =>
                    ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'].includes(s.estado)
                ).length,
            });
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
            setServiciosResumen({
                pendientes: pendientes.length,
                activos: todos.filter((s: any) =>
                    ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'].includes(s.estado)
                ).length,
            });
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
            if (reanudado) console.log('[Home] Turno reanudado automáticamente');
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

    // ── Derived display values ────────────────────────────────────────────────
    const nombreCorto = conductor?.nombres
        || conductor?.nombreCompleto?.split(' ')[0]
        || 'Conductor';
    const inicial = nombreCorto.charAt(0).toUpperCase();

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" backgroundColor="#1F2937" translucent={false} />

            {/* MAPA FULLSCREEN */}
            <MapaDriver
                ref={mapRef}
                lat={currentLocation?.latitude ?? -12.1462}
                lng={currentLocation?.longitude ?? -76.9954}
            />

            {/* HEADER FLOTANTE */}
            <View style={s.headerCard} pointerEvents="box-none">
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
                onToggleConnection={handleToggleStatus}
                loadingConnection={isToggling}
                stats={{
                    completados: 0,
                    activos: serviciosResumen.activos,
                    pendientes: serviciosResumen.pendientes,
                }}
                hasServicioActivo={isOnline && serviciosResumen.activos > 0}
                onOpenServicioActivo={() => router.push('/(tabs)/services')}
            />
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
        paddingTop: 50,
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
});
