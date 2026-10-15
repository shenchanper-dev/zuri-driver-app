import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet,
    FlatList, TouchableOpacity,
    RefreshControl, ActivityIndicator,
    Platform, Modal,
} from 'react-native';
import { driverApi } from '@/services/api';
import { ServicioModal } from '@/components/ServicioModal';
import { ServicioActivoCard } from '@/components/ServicioActivoCard';
import { ServicioPendienteCard } from '@/components/ServicioPendienteCard';
import { ServicioHistorialCard } from '@/components/ServicioHistorialCard';
import { ChatScreen } from '@/components/ChatScreen';
import { useServicioSocket } from '@/hooks/useServicioSocket';
import { useFocusEffect } from 'expo-router';
import { useNagging } from '@/hooks/useNagging';
import { useAuthStore } from '@/stores/auth';
import type { Servicio, AsignacionProgramacion, TabType } from '@/types/servicios';
import { ESTADOS_PENDIENTE, ESTADOS_ACTIVO, ESTADOS_HISTORIAL } from '@/types/servicios';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';
import { fechaLima } from '@/services/dates';

// ── Tab labels ────────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabType, string> = {
    pendientes: 'Pendientes',
    activos: 'Activos',
    historial: 'Historial',
};

const TABS: TabType[] = ['pendientes', 'activos', 'historial'];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ServicesScreen() {
    const { conductor } = useAuthStore();
    const [services, setServices] = useState<Servicio[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('pendientes');
    const [chatOpen, setChatOpen] = useState(false);

    // ZURI-FIX 2026-04-22: Queue-based system for multiple consecutive assignments
    // Fixes race condition where 2nd assignment overwrites 1st before ACEPTAR is pressed
    const [queue, setQueue] = useState<AsignacionProgramacion[]>([]);
    const [showModalAsignacion, setShowModalAsignacion] = useState(false);
    const queueRef = useRef<AsignacionProgramacion[]>([]);

    // ── Load services ─────────────────────────────────────────────────────────
    const loadServices = useCallback(async () => {
        try {
            // ZURI-FIX 2026-09-15: pasar fecha=hoy para no traer 30 dias (evita datos viejos pegados)
            const hoy = fechaLima();
            const response = await driverApi.getServices({ fecha: hoy });
            console.log('[ZURI] getServices:', response.success, 'count:', response.servicios?.length, response.error || '');
            if (response.success) {
                setServices(response.servicios ?? []);
            } else {
                console.warn('[ZURI] getServices failed:', response.error);
            }
        } catch (e) {
            console.error('[Services] loadServices error:', e);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadServices();
    }, [loadServices]);

    // Reload services when tab gains focus (Bug D fix)
    useFocusEffect(
        useCallback(() => {
            loadServices();
        }, [loadServices])
    );

    // ── Socket events ─────────────────────────────────────────────────────────
    useServicioSocket({
        onProgramacionAsignada: (asignacion) => {
            setQueue(prev => {
                // Avoid duplicate assignments in queue
                if (prev.some(s => s.id === asignacion.id)) return prev;
                const newQueue = [...prev, asignacion];
                queueRef.current = newQueue;
                return newQueue;
            });
            // Show modal if not already visible (only on first item)
            if (!showModalAsignacion) {
                setShowModalAsignacion(true);
            }
        },
        onServicioAsignado: () => {
            loadServices();
        },
        onServicioActualizado: () => {
            loadServices();
        },
    });

    // ── Nagging ───────────────────────────────────────────────────────────────
    // Active while queue has items but modal is hidden (user closed it without answering)
    const nagActivo = queue.length > 0 && !showModalAsignacion;

    useNagging(nagActivo, () => {
        // Re-show modal with current (first) item from queue
        if (queueRef.current && queueRef.current.length > 0) {
            setShowModalAsignacion(true);
        }
    });

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleAceptado = useCallback((_asignacion: AsignacionProgramacion) => {
        // Compute new queue synchronously via ref to avoid setState-inside-setState anti-pattern
        const newQueue = queueRef.current.slice(1);
        queueRef.current = newQueue;
        setQueue([...newQueue]);
        if (newQueue.length === 0) {
            setShowModalAsignacion(false);
        }
        loadServices();
    }, [loadServices]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadServices();
    }, [loadServices]);

    // ── Tab counts ────────────────────────────────────────────────────────────
    const pendientes = services.filter(s => (ESTADOS_PENDIENTE as readonly string[]).includes(s.estado));
    const activos = services.filter(s => (ESTADOS_ACTIVO as readonly string[]).includes(s.estado));
    const historial = services.filter(s => (ESTADOS_HISTORIAL as readonly string[]).includes(s.estado));

    // Bug 3 fix: sort services by fecha+hora
    const sortByFechaHora = (a: Servicio, b: Servicio, desc = false) => {
        const fa = (a.fecha || '') + (a.hora_inicio || '');
        const fb = (b.fecha || '') + (b.hora_inicio || '');
        return desc ? fb.localeCompare(fa) : fa.localeCompare(fb);
    };
    const tabData: Record<TabType, Servicio[]> = {
        pendientes: [...pendientes].sort((a, b) => sortByFechaHora(a, b)),
        activos: [...activos].sort((a, b) => sortByFechaHora(a, b)),
        historial: [...historial].sort((a, b) => sortByFechaHora(a, b, true)),
    };

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

    const renderEmpty = () => {
        const config = {
            pendientes: {
                icon: '📋',
                titulo: 'Sin servicios pendientes',
                subtitulo: 'Los nuevos servicios asignados aparecerán aquí',
                boton: null,
            },
            activos: {
                icon: '🚗',
                titulo: 'Sin servicios activos',
                subtitulo: 'Los servicios asignados apareceran aqui',
                boton: { label: 'Ver pendientes', tab: 'pendientes' as TabType },
            },
            historial: {
                icon: '📅',
                titulo: 'Sin historial aún',
                subtitulo: 'Los servicios completados aparecerán aquí',
                boton: null,
            },
        }[activeTab];

        return (
            <View style={s.empty}>
                <Text style={s.emptyIcon}>{config.icon}</Text>
                <Text style={s.emptyTitulo}>{config.titulo}</Text>
                <Text style={s.emptySubtitulo}>{config.subtitulo}</Text>
                {config.boton && (
                    <TouchableOpacity
                        style={s.emptyBoton}
                        onPress={() => setActiveTab(config.boton!.tab)}
                    >
                        <Text style={s.emptyBotonTx}>{config.boton.label}</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

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
                        tintColor={COLORS.accent}
                        colors={[COLORS.accent]}
                    />
                }
            />

            {/* Programacion_detalle assignment modal */}
            <ServicioModal
                visible={showModalAsignacion}
                asignacion={queue.length > 0 ? queue[0] : null}
                onAceptado={handleAceptado}
                onClose={() => setShowModalAsignacion(false)}
            />

            {(() => { console.log("[ZURI:FAB] activos:", activos.length, "conductor.id:", conductor?.id); return null; })()}
            {/* Chat FAB — visible when there are active services */}
            {activos.length > 0 && conductor?.id && (
                <TouchableOpacity
                    style={s.chatFab}
                    onPress={() => setChatOpen(true)}
                    activeOpacity={0.85}
                >
                    <Text style={s.chatFabIcon}>💬</Text>
                </TouchableOpacity>
            )}

            {/* Chat Modal */}
            <Modal
                visible={chatOpen}
                animationType="slide"
                onRequestClose={() => setChatOpen(false)}
                presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
            >
                {chatOpen && activos.length > 0 && conductor?.id && (
                    <ChatScreen
                        servicioId={activos[0].id}
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

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    header: {
        backgroundColor: COLORS.primary,
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
        backgroundColor: COLORS.card,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        paddingHorizontal: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        gap: 6,
        borderBottomWidth: 2.5,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: COLORS.accent,
    },
    tabTx: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    tabTxActive: {
        color: COLORS.accent,
        fontWeight: '700',
    },
    tabBadge: {
        backgroundColor: COLORS.border,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 7,
        paddingVertical: 1,
        minWidth: 20,
        alignItems: 'center',
    },
    tabBadgeActive: {
        backgroundColor: COLORS.accent,
    },
    tabBadgeTx: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.textSecondary,
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
        fontSize: 52,
    },
    emptyTitulo: {
        fontSize: 17,
        fontWeight: '700',
        color: COLORS.textPrimary,
        textAlign: 'center',
    },
    emptySubtitulo: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 24,
    },
    emptyBoton: {
        marginTop: 4,
        backgroundColor: COLORS.bg,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: RADIUS.pill,
    },
    emptyBotonTx: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    chatFab: {
        position: 'absolute',
        bottom: 24,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#0EA5E9',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
    },
    chatFabIcon: {
        fontSize: 26,
    },
});
