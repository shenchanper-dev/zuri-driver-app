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
    Image,
    StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { COLORS, FONT, SPACING, RADIUS, SHADOW } from '../../constants/theme';

export default function HomeScreen() {
    const router = useRouter();
    const { conductor } = useAuthStore();
    const { isTracking, iniciarTurno, finalizarTurno, verificarTurnoPeristido, isConnected } = useLocationStore();

    const isOnline = isTracking;
    const [isToggling, setIsToggling] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [todayStats] = useState({ viajes: 0, km: 0 });
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

    // ── Derived display values ────────────────────────────────────────────────
    const nombreCorto = conductor?.nombres
        || conductor?.nombreCompleto?.split(' ')[0]
        || 'Conductor';
    const inicial = nombreCorto.charAt(0).toUpperCase();

    return (
        <View style={s.root}>
            <StatusBar
                barStyle="dark-content"
                backgroundColor={COLORS.surface}
                translucent={false}
            />

            {/* Map placeholder — replaced with real MapView in future phase */}
            <View style={s.mapArea}>
                <Ionicons name="map-outline" size={64} color={COLORS.borderStrong} />
            </View>

            {/* Bottom sheet card */}
            <ScrollView
                style={s.sheet}
                contentContainerStyle={s.sheetContent}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.accent}
                        colors={[COLORS.accent]}
                    />
                }
                showsVerticalScrollIndicator={false}
            >
                {/* Header: Hola + avatar */}
                <View style={s.headerRow}>
                    <View>
                        <Text style={s.greeting}>Hola,</Text>
                        <Text style={s.driverName}>{nombreCorto}</Text>
                    </View>
                    {conductor?.foto ? (
                        <Image source={{ uri: conductor.foto }} style={s.avatar} />
                    ) : (
                        <View style={s.avatarFallback}>
                            <Text style={s.avatarInitial}>{inicial}</Text>
                        </View>
                    )}
                </View>

                <View style={s.sep} />

                {/* Status section */}
                <View style={s.statusSection}>
                    {isOnline ? (
                        <>
                            <View style={s.onlineRow}>
                                <View style={s.onlineBadge}>
                                    <View style={s.onlineDot} />
                                    <Text style={s.onlineBadgeText}>EN LÍNEA</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={handleToggleStatus}
                                    disabled={isToggling}
                                    activeOpacity={0.7}
                                >
                                    {isToggling
                                        ? <ActivityIndicator color={COLORS.textMuted} size="small" />
                                        : <Text style={s.disconnectText}>Desconectarse</Text>
                                    }
                                </TouchableOpacity>
                            </View>
                            <View style={s.pills}>
                                <View style={[s.pill, isTracking && s.pillActive]}>
                                    <View style={[s.pillDot, isTracking && s.pillDotActive]} />
                                    <Text style={s.pillText}>GPS</Text>
                                </View>
                                <View style={[s.pill, isConnected && s.pillActive]}>
                                    <View style={[s.pillDot, isConnected && s.pillDotActive]} />
                                    <Text style={s.pillText}>Servidor</Text>
                                </View>
                                {isOnline && !isConnected && (
                                    <Text style={s.httpFallback}>· Modo HTTP</Text>
                                )}
                            </View>
                        </>
                    ) : (
                        <>
                            <View style={s.offlineRow}>
                                <View style={s.offlineDot} />
                                <Text style={s.offlineText}>Estás fuera de servicio</Text>
                            </View>
                            <TouchableOpacity
                                style={[s.connectBtn, isToggling && s.connectBtnDisabled]}
                                onPress={handleToggleStatus}
                                disabled={isToggling}
                                activeOpacity={0.85}
                            >
                                {isToggling
                                    ? <ActivityIndicator color={COLORS.textOnDark} size="small" />
                                    : <Text style={s.connectBtnText}>CONECTARSE</Text>
                                }
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {/* Active service card */}
                {isOnline && serviciosResumen.activos > 0 && (
                    <TouchableOpacity
                        style={s.serviceCard}
                        onPress={() => router.push('/(tabs)/services')}
                        activeOpacity={0.85}
                    >
                        <View style={s.serviceCardLeft}>
                            <Text style={s.serviceCardTitle}>Servicio en curso</Text>
                            <Text style={s.serviceCardSub}>Toca para ver detalles y avanzar estado</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
                    </TouchableOpacity>
                )}

                {/* Queue banner — shows even when offline (assigned while offline) */}
                {serviciosResumen.pendientes > 0 && (
                    <TouchableOpacity
                        style={s.queueBanner}
                        onPress={() => router.push('/(tabs)/services')}
                        activeOpacity={0.85}
                    >
                        <Ionicons name="notifications-outline" size={16} color={COLORS.warning} />
                        <Text style={s.queueBannerText}>
                            Tienes {serviciosResumen.pendientes} servicio{serviciosResumen.pendientes > 1 ? 's' : ''} por aceptar — toca aquí
                        </Text>
                    </TouchableOpacity>
                )}

                <View style={s.sep} />

                {/* Resumen hoy */}
                <View style={s.statsSection}>
                    <Text style={s.statsSectionTitle}>Hoy</Text>
                    <View style={s.statsRow}>
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{todayStats.viajes}</Text>
                            <Text style={s.statLabel}>Completados</Text>
                        </View>
                        <View style={s.statDiv} />
                        <View style={s.statItem}>
                            <Text style={s.statValue}>{serviciosResumen.activos}</Text>
                            <Text style={s.statLabel}>Activos</Text>
                        </View>
                        <View style={s.statDiv} />
                        <View style={s.statItem}>
                            <Text style={[
                                s.statValue,
                                serviciosResumen.pendientes > 0 && { color: COLORS.warning },
                            ]}>
                                {serviciosResumen.pendientes}
                            </Text>
                            <Text style={s.statLabel}>Pendientes</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: COLORS.surface,
        paddingTop: Platform.OS === 'android' ? 0 : 0,
    },
    mapArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
    },

    // Bottom sheet
    sheet: {
        backgroundColor: COLORS.card,
        borderTopLeftRadius: RADIUS.xl,
        borderTopRightRadius: RADIUS.xl,
        ...SHADOW.elevated,
    },
    sheetContent: {
        paddingHorizontal: SPACING[4],
        paddingTop: SPACING[5],
        paddingBottom: SPACING[10],
        gap: SPACING[4],
    },

    // Header row
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    greeting: {
        fontSize: FONT.sizes.sm,
        fontWeight: FONT.weights.regular,
        color: COLORS.textSecondary,
    },
    driverName: {
        fontSize: FONT.sizes.xl,
        fontWeight: FONT.weights.bold,
        color: COLORS.textPrimary,
        marginTop: 2,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.pill,
    },
    avatarFallback: {
        width: 40,
        height: 40,
        borderRadius: RADIUS.pill,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarInitial: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.bold,
        color: COLORS.textOnDark,
    },

    // Separator
    sep: {
        height: 1,
        backgroundColor: COLORS.border,
    },

    // Status
    statusSection: {
        gap: SPACING[3],
    },
    onlineRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    onlineBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[2],
        backgroundColor: COLORS.successBg,
        paddingHorizontal: SPACING[3],
        paddingVertical: 5,
        borderRadius: RADIUS.pill,
    },
    onlineDot: {
        width: 8,
        height: 8,
        borderRadius: RADIUS.pill,
        backgroundColor: COLORS.success,
    },
    onlineBadgeText: {
        fontSize: FONT.sizes.xs,
        fontWeight: FONT.weights.bold,
        color: COLORS.success,
        letterSpacing: 0.3,
    },
    disconnectText: {
        fontSize: FONT.sizes.sm,
        fontWeight: FONT.weights.medium,
        color: COLORS.textMuted,
    },
    pills: {
        flexDirection: 'row',
        gap: SPACING[2],
        flexWrap: 'wrap',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: COLORS.surface,
        paddingHorizontal: SPACING[3],
        paddingVertical: 6,
        borderRadius: RADIUS.pill,
    },
    pillActive: {
        backgroundColor: COLORS.successBg,
    },
    pillDot: {
        width: 6,
        height: 6,
        borderRadius: RADIUS.pill,
        backgroundColor: COLORS.borderStrong,
    },
    pillDotActive: {
        backgroundColor: COLORS.success,
    },
    pillText: {
        fontSize: FONT.sizes.xs,
        fontWeight: FONT.weights.medium,
        color: COLORS.textSecondary,
    },
    httpFallback: {
        fontSize: FONT.sizes.xs,
        color: COLORS.warning,
        alignSelf: 'center',
    },
    offlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[2],
    },
    offlineDot: {
        width: 8,
        height: 8,
        borderRadius: RADIUS.pill,
        backgroundColor: COLORS.textMuted,
    },
    offlineText: {
        fontSize: FONT.sizes.sm,
        color: COLORS.textSecondary,
    },
    connectBtn: {
        backgroundColor: COLORS.primary,
        height: 52,
        borderRadius: RADIUS.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    connectBtnDisabled: {
        backgroundColor: COLORS.borderStrong,
    },
    connectBtnText: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.bold,
        color: COLORS.textOnDark,
        letterSpacing: 0.5,
    },

    // Active service card
    serviceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.infoBg,
        borderRadius: RADIUS.md,
        padding: SPACING[4],
        borderLeftWidth: 3,
        borderLeftColor: COLORS.accent,
        gap: SPACING[3],
    },
    serviceCardLeft: {
        flex: 1,
        gap: 4,
    },
    serviceCardTitle: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.bold,
        color: COLORS.accent,
    },
    serviceCardSub: {
        fontSize: FONT.sizes.xs,
        color: COLORS.textSecondary,
    },

    // Queue banner
    queueBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING[2],
        backgroundColor: COLORS.warningBg,
        borderRadius: RADIUS.md,
        padding: SPACING[3],
        borderWidth: 1,
        borderColor: COLORS.warning,
    },
    queueBannerText: {
        flex: 1,
        fontSize: FONT.sizes.sm,
        fontWeight: FONT.weights.medium,
        color: COLORS.textPrimary,
    },

    // Stats
    statsSection: {
        gap: SPACING[3],
    },
    statsSectionTitle: {
        fontSize: FONT.sizes.base,
        fontWeight: FONT.weights.semibold,
        color: COLORS.textPrimary,
    },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        borderRadius: RADIUS.md,
        padding: SPACING[4],
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    statDiv: {
        width: 1,
        backgroundColor: COLORS.border,
        marginVertical: SPACING[1],
    },
    statValue: {
        fontSize: FONT.sizes.xxl,
        fontWeight: FONT.weights.bold,
        color: COLORS.textPrimary,
    },
    statLabel: {
        fontSize: FONT.sizes.xs,
        fontWeight: FONT.weights.regular,
        color: COLORS.textSecondary,
    },
});
