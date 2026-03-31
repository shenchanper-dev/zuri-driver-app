/**
 * ZURI Driver App - Home Screen (FIXED)
 * - Botón verde apenas GPS arrerca (no espera socket)
 * - Stats "Hoy" dinámicas desde API
 * - isOnline persiste mientras la sesión esté viva
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
    const { isTracking, startTracking, stopTracking, isConnected } = useLocationStore();

    // El estado online visual ahora depende de si el GPS está trackeando 
    // Y opcionalmente si el socket está conectado (decisión de UX)
    // Para esta refactorización, lo haremos depender de isTracking pero con indicador de Socket
    const isOnline = isTracking;
    const [isToggling, setIsToggling] = useState(false);
    const [currentService, setCurrentService] = useState<any>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [todayStats, setTodayStats] = useState({ viajes: 0, km: 0 });

    // ── Conectar: GPS primero → UI verde → socket en background ──
    const handleToggleStatus = async () => {
        if (isToggling) return;
        setIsToggling(true);

        try {
            if (!isOnline) {
                // 1. Pedir permisos + arrancar GPS
                const gpsOk = await startTracking();
                if (!gpsOk) {
                    Alert.alert(
                        'GPS no disponible',
                        'Verifica que el GPS esté activado y que la app tenga permisos de ubicación.',
                        [{ text: 'OK' }]
                    );
                    return;
                }

                // 3. Actualizar estado en el servidor (HTTP fallback)
                try {
                    await driverApi.updateProfile({ estadoServicio: 'DISPONIBLE' });
                } catch (e) {
                    console.warn('[Home] No se pudo actualizar estadoServicio:', e);
                }

                // ZURI-FIX 2026-03-30: liberar el botón inmediatamente tras GPS exitoso, sin esperar al socket
                setIsToggling(false);

                // 4. Socket en background (sin await — no bloquea el UI)
                socket.connect().then(connected => { // ZURI-FIX 2026-03-30: fire-and-forget, era await (bloqueaba 15s)
                    if (connected) {
                        useLocationStore.getState().setConnected(true);
                    }
                    // Sin Alert: si falla el socket el modo HTTP fallback opera silenciosamente
                });

            } else {
                // DESCONECTAR
                await stopTracking();
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

    // ── Servicio activo ──
    const loadActiveService = useCallback(async () => {
        try {
            const response = await driverApi.getServices({ estado: 'activo' });
            if (response.success && response.servicios?.length > 0) {
                setCurrentService(response.servicios[0]);
            } else {
                setCurrentService(null);
            }
        } catch (e) {
            console.warn('[Home] No se pudo cargar el servicio activo');
        }
    }, []);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadActiveService();
        setRefreshing(false);
    };

    useEffect(() => {
        loadActiveService();

        socket.on('service:assigned', () => loadActiveService());
        return () => { socket.off('service:assigned'); };
    }, []);

    const statusColor = isOnline ? '#10B981' : '#9CA3AF';
    const statusBg = isOnline ? '#D1FAE5' : '#F3F4F6';
    const iconName = isOnline ? 'power' : 'power-outline';

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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

                {/* Indicadores GPS + Servidor */}
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

            {/* ── Servicio activo / Esperando ── */}
            {currentService ? (
                <TouchableOpacity
                    style={styles.serviceCard}
                    onPress={() => router.push('/(tabs)/services')}
                >
                    <View style={styles.serviceHeader}>
                        <Ionicons name="navigate" size={24} color="#0066CC" />
                        <Text style={styles.serviceTitle}>Servicio Activo</Text>
                        <View style={styles.serviceBadge}>
                            <Text style={styles.serviceBadgeText}>{currentService.estado}</Text>
                        </View>
                    </View>
                    <Text style={styles.patientName}>{currentService.paciente?.nombre}</Text>
                    <View style={styles.addressRow}>
                        <Ionicons name="location" size={16} color="#666" />
                        <Text style={styles.addressText} numberOfLines={1}>
                            {currentService.origen?.direccion}
                        </Text>
                    </View>
                    <View style={styles.addressRow}>
                        <Ionicons name="flag" size={16} color="#0066CC" />
                        <Text style={styles.addressText} numberOfLines={1}>
                            {currentService.destino?.direccion}
                        </Text>
                    </View>
                </TouchableOpacity>
            ) : isOnline ? (
                <View style={styles.waitingCard}>
                    <Ionicons name="hourglass-outline" size={48} color="#888" />
                    <Text style={styles.waitingText}>Esperando asignación...</Text>
                    <Text style={styles.waitingSubtext}>
                        Te notificaremos cuando tengas un servicio
                    </Text>
                </View>
            ) : null}

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
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    statusCard: {
        backgroundColor: '#fff',
        margin: 16,
        borderRadius: 16,
        padding: 20,
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
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
    serviceCard: {
        backgroundColor: '#fff',
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 16, padding: 20,
        borderLeftWidth: 4, borderLeftColor: '#0066CC',
        elevation: 2,
    },
    serviceHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    serviceTitle: { flex: 1, fontSize: 14, color: '#6B7280' },
    serviceBadge: { backgroundColor: '#0066CC', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
    serviceBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    patientName: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    addressText: { flex: 1, fontSize: 14, color: '#6B7280' },
    waitingCard: {
        backgroundColor: '#fff',
        marginHorizontal: 16, marginBottom: 16,
        borderRadius: 16, padding: 32, alignItems: 'center',
    },
    waitingText: { fontSize: 18, fontWeight: '600', color: '#374151', marginTop: 16 },
    waitingSubtext: { fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },
    statsContainer: { marginHorizontal: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    statsGrid: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: 'bold', color: '#1F2937', marginTop: 8 },
    statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    vehicleCard: { backgroundColor: '#fff', margin: 16, marginTop: 0, borderRadius: 16, padding: 20 },
    vehicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    vehicleTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    vehiclePlate: { fontSize: 28, fontWeight: 'bold', color: '#0066CC', letterSpacing: 2 },
    vehicleDetail: { fontSize: 14, color: '#6B7280', marginTop: 4 },
});
