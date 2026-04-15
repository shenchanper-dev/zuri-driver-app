import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet,
    FlatList, TouchableOpacity,
    RefreshControl, ActivityIndicator,
    Platform,
} from 'react-native';
import { driverApi } from '@/services/api';
import { requestNotificationPermissions } from '@/services/notifications';
import { ServicioModal } from '@/components/ServicioModal';
import { ServicioActivoCard } from '@/components/ServicioActivoCard';
import { ServicioPendienteCard } from '@/components/ServicioPendienteCard';
import { ServicioHistorialCard } from '@/components/ServicioHistorialCard';
import { useServicioSocket } from '@/hooks/useServicioSocket';
import { useNagging } from '@/hooks/useNagging';
import type { Servicio, AsignacionProgramacion, TabType } from '@/types/servicios';
import { C, ESTADOS_PENDIENTE, ESTADOS_ACTIVO, ESTADOS_HISTORIAL } from '@/types/servicios';

// ── Tab labels ────────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabType, string> = {
    pendientes: 'Pendientes',
    activos:    'Activos',
    historial:  'Historial',
};

const TABS: TabType[] = ['pendientes', 'activos', 'historial'];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ServicesScreen() {
    const [services, setServices] = useState<Servicio[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('pendientes');

    // Programacion_detalle assignment notification
    const [nuevaAsignacion, setNuevaAsignacion] = useState<AsignacionProgramacion | null>(null);
    const [showModalAsignacion, setShowModalAsignacion] = useState(false);
    // Ref keeps assignment alive for nagging interval reads
    const nagAsignacionRef = useRef<AsignacionProgramacion | null>(null);

    // ── Load services ─────────────────────────────────────────────────────────
    const loadServices = useCallback(async () => {
        try {
            const response = await driverApi.getServices();
            console.log('[ZURI] getServices response:', response.success, 'count:', response.servicios?.length);
            if (response.success) {
                setServices(response.servicios ?? []);
            }
        } catch (e) {
            console.error('[Services] loadServices error:', e);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        requestNotificationPermissions();
        loadServices();
    }, [loadServices]);

    // ── Socket events ─────────────────────────────────────────────────────────
    useServicioSocket({
        onProgramacionAsignada: (asignacion) => {
            nagAsignacionRef.current = asignacion;
            setNuevaAsignacion(asignacion);
            setShowModalAsignacion(true);
        },
        onServicioAsignado: () => {
            loadServices();
        },
        onServicioActualizado: () => {
            loadServices();
        },
    });

    // ── Nagging ───────────────────────────────────────────────────────────────
    // Active while there is a pending assignment that hasn't been accepted yet
    const nagActivo = nuevaAsignacion !== null && !showModalAsignacion;

    useNagging(nagActivo, () => {
        if (nagAsignacionRef.current) {
            setNuevaAsignacion(nagAsignacionRef.current);
            setShowModalAsignacion(true);
        }
    });

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleAceptado = useCallback((asignacion: AsignacionProgramacion) => {
        // Clear pending assignment — stops nagging
        nagAsignacionRef.current = null;
        setNuevaAsignacion(null);
        setShowModalAsignacion(false);
        loadServices();
    }, [loadServices]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadServices();
    }, [loadServices]);

    // ── Tab counts ────────────────────────────────────────────────────────────
    const pendientes = services.filter(s => (ESTADOS_PENDIENTE as readonly string[]).includes(s.estado));
    const activos    = services.filter(s => (ESTADOS_ACTIVO    as readonly string[]).includes(s.estado));
    const historial  = services.filter(s => (ESTADOS_HISTORIAL as readonly string[]).includes(s.estado));

    const tabData: Record<TabType, Servicio[]> = { pendientes, activos, historial };

    // ── Render ────────────────────────────────────────────────────────────────

    const renderItem = useCallback(({ item }: { item: Servicio }) => {
        if (activeTab === 'activos') {
            return <ServicioActivoCard servicio={item} onActualizado={loadServices} />;
        }
        if (activeTab === 'pendientes') {
            return <ServicioPendienteCard servicio={item} onAceptado={loadServices} />;
        }
        return <ServicioHistorialCard servicio={item} />;
    }, [activeTab, loadServices]);

    const renderEmpty = () => (
        <View style={s.empty}>
            <Text style={s.emptyIcon}>
                {activeTab === 'pendientes' ? '🔔' : activeTab === 'activos' ? '🚗' : '📋'}
            </Text>
            <Text style={s.emptyTx}>
                {activeTab === 'pendientes'
                    ? 'Sin servicios pendientes'
                    : activeTab === 'activos'
                        ? 'No tienes servicios activos'
                        : 'Sin historial'}
            </Text>
        </View>
    );

    return (
        <View style={s.container}>
            {/* Header */}
            <View style={s.header}>
                <Text style={s.headerTitle}>Mis Servicios</Text>
                {isLoading && <ActivityIndicator color="#fff" size="small" />}
            </View>

            {/* Tabs */}
            <View style={s.tabBar}>
                {TABS.map(tab => {
                    const count = tabData[tab].length;
                    const isActive = activeTab === tab;
                    return (
                        <TouchableOpacity
                            key={tab}
                            style={[s.tab, isActive && s.tabActive]}
                            onPress={() => setActiveTab(tab)}
                            activeOpacity={0.75}
                        >
                            <Text style={[s.tabTx, isActive && s.tabTxActive]}>
                                {TAB_LABELS[tab]}
                            </Text>
                            {count > 0 && (
                                <View style={[s.tabBadge, isActive && s.tabBadgeActive]}>
                                    <Text style={[s.tabBadgeTx, isActive && s.tabBadgeTxActive]}>
                                        {count}
                                    </Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            {/* List */}
            <FlatList
                data={tabData[activeTab]}
                keyExtractor={item => String(item.id)}
                renderItem={renderItem}
                ListEmptyComponent={isLoading ? null : renderEmpty}
                contentContainerStyle={s.list}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={C.verde}
                        colors={[C.verde]}
                    />
                }
            />

            {/* Programacion_detalle assignment modal */}
            <ServicioModal
                visible={showModalAsignacion}
                asignacion={nuevaAsignacion}
                onAceptado={handleAceptado}
            />
        </View>
    );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.fondo,
    },
    header: {
        backgroundColor: C.header,
        paddingTop: Platform.OS === 'ios' ? 60 : 48,
        paddingBottom: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: C.card,
        borderBottomWidth: 1,
        borderBottomColor: C.borde,
        paddingHorizontal: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 6,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: C.verde,
    },
    tabTx: {
        fontSize: 13,
        fontWeight: '600',
        color: C.grisTexto,
    },
    tabTxActive: {
        color: C.verde,
    },
    tabBadge: {
        backgroundColor: C.borde,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 1,
        minWidth: 20,
        alignItems: 'center',
    },
    tabBadgeActive: {
        backgroundColor: C.verde,
    },
    tabBadgeTx: {
        fontSize: 11,
        fontWeight: '700',
        color: C.grisTexto,
    },
    tabBadgeTxActive: {
        color: '#fff',
    },
    list: {
        paddingTop: 8,
        paddingBottom: 24,
        flexGrow: 1,
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 80,
        gap: 12,
    },
    emptyIcon: {
        fontSize: 48,
    },
    emptyTx: {
        fontSize: 15,
        color: C.grisTexto,
        fontWeight: '500',
    },
});
