/**
 * ZURI Driver App - Home Screen
 * - Botón verde apenas GPS arranca (no espera socket)
 * - Al conectarse verifica servicios pendientes en BD
 * - Tarjeta dinámica según estado real de servicios
 */

import { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';

export default function HomeScreen() {
    const router = useRouter();
    const { conductor } = useAuthStore();
    const { isTracking, iniciarTurno, finalizarTurno, verificarTurnoPeristido, isConnected } = useLocationStore();

    const isOnline = isTracking;
    const [isToggling, setIsToggling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [todayStats] = useState({ viajes: 0, km: 0 });

    // Counters for dynamic home card
    const [serviciosResumen, setServiciosResumen] = useState({ pendientes: 0, activos: 0 });

    // ── Load service counters ─────────────────────────────────────────────────
    const refrescarResumen = useCallback(async () => {
        try {
            const res = await driverApi.getServices();
            const todos: any[] = res.servicios ?? [];
            console.log('[Home] Servicios en BD:', todos.length);
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
            console.log('[ZURI] Servicios al conectar:', todos.length);

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

            // Update counters from same response
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

                // Release button immediately — don't wait for socket
                setIsToggling(false);

                // Socket in background + check pending services
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

    const onRefresh = async () => {
        setRefreshing(true);
        await refrescarResumen();
        setRefreshing(false);
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

        // On new assignment arrival, refresh counters only (modal handled by services tab)
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

    const statusColor = isOnline ? '#10B981' : '#9CA3AF';
    const iconName: 'power' | 'power-outline' = isOnline ? 'power' : 'power-outline';

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00875A" />}
        >
            {/* ── Status Card ── */}
            <View style={styles.statusCard}>
                <View style={styles.statusHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.statusLabel}>Estado actual</Text>
                        <Text style={[styles.statusText, { color: statusColor }]}>
                            {isOnline ? 'EN LÍNEA' : 'DESCONECTADO'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.statusToggle, { backgroundColor: statusColor }]}
                        onPress={handleToggleStatus}
                        disabled={isToggling}
                        activeOpacity={0.8}
                    >
                        {isToggling
                            ? <ActivityIndicator color="#fff" size="small" />
                            : <Ionicons name={iconName} size={32} color="#fff" />
                        }
                    </TouchableOpacity>
                </View>

                {/* GPS + Server indicators */}
                <View style={styles.indicators}>
                    <View style={styles.indicator}>
                        <View style={[styles.indicatorDot, isTracking && styles.indicatorActive]} />
                        <Text style={styles.indicatorText}>GPS</Text>
                    </View>
                    <View style={styles.indicator}>
                        <View style={[styles.indicatorDot, isConnected && styles.indicatorActive]} />
                        <Text style={styles.indicatorText}>Servidor</Text>
                    </View>
                    {isOnline && !isConnected && (
                        <Text style={styles.httpFallback}>• Modo HTTP</Text>
                    )}
                </View>
            </View>

            {/* ── Dynamic service state card ── */}
            {isOnline && (
                serviciosResumen.activos > 0 ? (
                    <TouchableOpacity
                        style={styles.estadoServicioCard}
                        onPress={() => router.push('/(tabs)/services')}
                        activeOpacity={0.8}
                    >
                        <View style={styles.estadoIcono}>
                            <Text style={{ fontSize: 28 }}>🚗</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.estadoTitulo}>Servicio en curso</Text>
                            <Text style={styles.estadoSubtitulo}>Toca para ver detalles y avanzar estado</Text>
                        </View>
                        <View style={styles.estadoBadge}>
                            <Text style={styles.estadoBadgeText}>{serviciosResumen.activos}</Text>
                        </View>
                    </TouchableOpacity>
                ) : serviciosResumen.pendientes > 0 ? (
                    <TouchableOpacity
                        style={[styles.estadoServicioCard, { borderLeftColor: '#F59E0B' }]}
                        onPress={() => router.push('/(tabs)/services')}
                        activeOpacity={0.8}
                    >
                        <View style={[styles.estadoIcono, { backgroundColor: '#FFFBEB' }]}>
                            <Text style={{ fontSize: 28 }}>🔔</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.estadoTitulo}>Tienes servicios asignados</Text>
                            <Text style={styles.estadoSubtitulo}>
                                {serviciosResumen.pendientes} servicio{serviciosResumen.pendientes > 1 ? 's' : ''} esperando tu respuesta
                            </Text>
                        </View>
                        <View style={[styles.estadoBadge, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.estadoBadgeText, { color: '#92400E' }]}>
                                {serviciosResumen.pendientes}
                            </Text>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <View style={styles.esperandoCard}>
                        <Text style={{ fontSize: 40, marginBottom: 12 }}>⏳</Text>
                        <Text style={styles.esperandoTitulo}>Sin servicios asignados</Text>
                        <Text style={styles.esperandoSubtitulo}>
                            Te notificaremos cuando tengas un nuevo servicio
                        </Text>
                        <TouchableOpacity
                            style={styles.btnVerHistorial}
                            onPress={() => router.push('/(tabs)/services')}
                        >
                            <Text style={styles.btnVerHistorialText}>Ver historial</Text>
                        </TouchableOpacity>
                    </View>
                )
            )}

            {/* ── Stats Hoy ── */}
            <View style={styles.statsContainer}>
                <Text style={styles.sectionTitle}>Hoy</Text>
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Ionicons name="car" size={24} color="#0066CC" />
                        <Text style={styles.statValue}>{todayStats.viajes}</Text>
                        <Text style={styles.statLabel}>Viajes</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Ionicons name="navigate" size={24} color="#10B981" />
                        <Text style={styles.statValue}>{todayStats.km} km</Text>
                        <Text style={styles.statLabel}>Distancia</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Ionicons name="star" size={24} color="#F59E0B" />
                        <Text style={styles.statValue}>
                            {conductor?.calificacion?.toFixed(1) || '--'}
                        </Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </View>
                </View>
            </View>

            {/* ── Vehículo ── */}
            <View style={styles.vehicleCard}>
                <View style={styles.vehicleHeader}>
                    <Ionicons name="car-sport" size={24} color="#0066CC" />
                    <Text style={styles.vehicleTitle}>Mi Vehículo</Text>
                </View>
                <Text style={styles.vehiclePlate}>
                    {conductor?.vehiculo?.placa || conductor?.placa || '---'}
                </Text>
                <Text style={styles.vehicleDetail}>
                    {[conductor?.vehiculo?.marca || conductor?.marcaVehiculo,
                    conductor?.vehiculo?.modelo || conductor?.modeloVehiculo]
                        .filter(Boolean).join(' ') || ''}
                </Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F0F4F8' },
    content: { paddingBottom: 32, paddingTop: Platform.OS === 'ios' ? 0 : 8 },
    statusCard: {
        backgroundColor: '#fff',
        margin: 16,
        marginBottom: 12,
        borderRadius: 16,
        padding: 20,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
    },
    statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusLabel: { fontSize: 14, color: '#6B7280' },
    statusText: { fontSize: 24, fontWeight: 'bold', marginTop: 4 },
    statusToggle: {
        width: 64, height: 64,
        borderRadius: 32,
        justifyContent: 'center', alignItems: 'center',
        elevation: 2,
    },
    indicators: { flexDirection: 'row', marginTop: 20, gap: 20, flexWrap: 'wrap' },
    indicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    indicatorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#D1D5DB' },
    indicatorActive: { backgroundColor: '#10B981' },
    indicatorText: { fontSize: 13, color: '#6B7280' },
    httpFallback: { fontSize: 11, color: '#F59E0B', alignSelf: 'center' },
    // Dynamic state card
    estadoServicioCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        marginHorizontal: 16,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#00875A',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
    },
    estadoIcono: {
        width: 56, height: 56,
        backgroundColor: '#F0FDF4',
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    estadoTitulo: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0B1F3A',
        marginBottom: 2,
    },
    estadoSubtitulo: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
    },
    estadoBadge: {
        backgroundColor: '#D1FAE5',
        width: 36, height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    estadoBadgeText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#065F46',
    },
    esperandoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 32,
        marginHorizontal: 16,
        marginBottom: 12,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    esperandoTitulo: {
        fontSize: 17,
        fontWeight: '700',
        color: '#0B1F3A',
        marginBottom: 8,
        textAlign: 'center',
    },
    esperandoSubtitulo: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
    },
    btnVerHistorial: {
        backgroundColor: '#F0F4F8',
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 20,
    },
    btnVerHistorialText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0B1F3A',
    },
    // Stats
    statsContainer: { marginHorizontal: 16, marginBottom: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    statsGrid: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 1 },
    statValue: { fontSize: 22, fontWeight: 'bold', color: '#1F2937', marginTop: 8 },
    statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    // Vehicle
    vehicleCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 20 },
    vehicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    vehicleTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    vehiclePlate: { fontSize: 28, fontWeight: 'bold', color: '#0066CC', letterSpacing: 2 },
    vehicleDetail: { fontSize: 14, color: '#6B7280', marginTop: 4 },
});
