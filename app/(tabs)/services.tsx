import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, StyleSheet,
    FlatList, TouchableOpacity,
    RefreshControl, ActivityIndicator,
    Platform, Modal,
} from 'react-native';
import { ServicioModal } from '@/components/ServicioModal';
import { ServicioActivoCard } from '@/components/ServicioActivoCard';
import { ServicioPendienteCard } from '@/components/ServicioPendienteCard';
import { ServicioHistorialCard } from '@/components/ServicioHistorialCard';
import { ChatScreen } from '@/components/ChatScreen';
import { useServicioSocket } from '@/hooks/useServicioSocket';
import { useServiciosHoy } from '@/hooks/useServiciosHoy';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNagging } from '@/hooks/useNagging';
import { useAuthStore } from '@/stores/auth';
import type { Servicio, AsignacionProgramacion, JornadaInfo, TabType } from '@/types/servicios';
import { ESTADOS_PENDIENTE, ESTADOS_ACTIVO, ESTADOS_HISTORIAL } from '@/types/servicios';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';

// ── Tab labels ────────────────────────────────────────────────────────────────

const TAB_LABELS: Record<TabType, string> = {
    pendientes: 'Pendientes',
    activos: 'Activos',
    historial: 'Historial',
};

const TABS: TabType[] = ['pendientes', 'activos', 'historial'];

// ── Union item type for the FlatList (jornada ESPECIAL + servicio NEMT) ──────
type JornadaGroup = { kind: 'jornada'; jornada: JornadaInfo; servicios: Servicio[]; id: string };
type ServicioItem = { kind: 'servicio'; servicio: Servicio; id: string };
type TabItem = JornadaGroup | ServicioItem;

// ── Jornada card (nuevo — tap navega a Inicio) ──────────────────────────────
const JORNADA_ESTADO_META: Record<string, { label: string; fg: string; bg: string }> = {
    PUBLICADA:  { label: 'Pendiente',  fg: '#8a5a0b', bg: '#fdf2dd' },
    ACTIVA:     { label: 'En curso',   fg: '#0b7d4e', bg: '#e6f6ee' },
    FINALIZADA: { label: 'Finalizada', fg: '#1e3a8a', bg: '#eaeffc' },
    TRUNCADA:   { label: 'Truncada',   fg: '#991b1b', bg: '#fdeceb' },
};

function JornadaEspecialCard({ jornada, onPress }: { jornada: JornadaInfo; onPress: () => void }) {
    const meta = JORNADA_ESTADO_META[jornada.estado] || { label: jornada.estado, fg: '#3a4656', bg: '#eef1f7' };
    const horario =
        jornada.hora_inicio_planeada && jornada.hora_fin_planeada
            ? `${jornada.hora_inicio_planeada} – ${jornada.hora_fin_planeada}`
            : jornada.hora_inicio_planeada ?? '—';

    const declaradas = jornada.paradas_declaradas ?? null;
    const detectadas = jornada.paradas_detectadas ?? 0;
    const progreso = declaradas != null
        ? `${detectadas}/${declaradas} paradas`
        : `${detectadas} paradas detectadas`;

    return (
        <TouchableOpacity style={js.card} onPress={onPress} activeOpacity={0.85}>
            <View style={js.cardHead}>
                <View style={js.chipZuri}>
                    <Text style={js.chipZuriTx}>ZURI ESPECIAL</Text>
                </View>
                <View style={[js.estadoChip, { backgroundColor: meta.bg }]}>
                    <Text style={[js.estadoChipTx, { color: meta.fg }]}>{meta.label}</Text>
                </View>
            </View>

            <Text style={js.cliente} numberOfLines={1}>
                {jornada.cliente_nombre || 'Jornada ESPECIAL'}
            </Text>
            {jornada.turno && <Text style={js.turno}>Turno {jornada.turno}</Text>}

            <View style={js.row}>
                <View style={js.rowItem}>
                    <Text style={js.rowLabel}>Horario</Text>
                    <Text style={js.rowValue}>{horario}</Text>
                </View>
                <View style={js.rowItem}>
                    <Text style={js.rowLabel}>Progreso</Text>
                    <Text style={js.rowValue}>{progreso}</Text>
                </View>
            </View>

            <View style={js.footerRow}>
                <Text style={js.cta}>Abrir en Inicio →</Text>
            </View>
        </TouchableOpacity>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ServicesScreen() {
    const router = useRouter();
    const { conductor } = useAuthStore();

    // PASO 2 — hook compartido reemplaza loadServices/isLoading/refreshing locales.
    // Mismo origen de datos que Inicio: /api/driver/servicios?fecha=hoy, polling 60s,
    // refresh on foreground. Si una jornada ESPECIAL vive aqui, es la misma que ve Inicio.
    const {
        services,
        loading: isLoading,
        refreshing,
        refresh: loadServices,
        onRefresh,
    } = useServiciosHoy();

    const [activeTab, setActiveTab] = useState<TabType>('pendientes');
    const [chatOpen, setChatOpen] = useState(false);

    // ZURI-FIX 2026-04-22: Queue-based system for multiple consecutive assignments
    // Fixes race condition where 2nd assignment overwrites 1st before ACEPTAR is pressed
    const [queue, setQueue] = useState<AsignacionProgramacion[]>([]);
    const [showModalAsignacion, setShowModalAsignacion] = useState(false);
    const queueRef = useRef<AsignacionProgramacion[]>([]);

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
                if (prev.some(sv => sv.id === asignacion.id)) return prev;
                const newQueue = [...prev, asignacion];
                queueRef.current = newQueue;
                return newQueue;
            });
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
    const nagActivo = queue.length > 0 && !showModalAsignacion;

    useNagging(nagActivo, () => {
        if (queueRef.current && queueRef.current.length > 0) {
            setShowModalAsignacion(true);
        }
    });

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleAceptado = useCallback((_asignacion: AsignacionProgramacion) => {
        const newQueue = queueRef.current.slice(1);
        queueRef.current = newQueue;
        setQueue([...newQueue]);
        if (newQueue.length === 0) {
            setShowModalAsignacion(false);
        }
        loadServices();
    }, [loadServices]);

    // PASO 2 — tap en una tarjeta de jornada → navegar a Inicio.
    const abrirInicio = useCallback(() => {
        router.push('/(tabs)');
    }, [router]);

    // ── Classification (PASO 2) ───────────────────────────────────────────────
    // 1) Agrupar servicios con jornada ESPECIAL por jornada.id → 1 card por jornada.
    //    (NEMT y servicios sueltos siguen clasificándose por estado del servicio.)
    const { jornadasEspecial, serviciosSueltos } = useMemo(() => {
        const map = new Map<number, { jornada: JornadaInfo; servicios: Servicio[] }>();
        const sueltos: Servicio[] = [];
        for (const sv of services) {
            const esEspecial = sv.jornada?.modo === 'ESPECIAL';
            if (esEspecial && sv.jornada) {
                const existing = map.get(sv.jornada.id);
                if (existing) existing.servicios.push(sv);
                else map.set(sv.jornada.id, { jornada: sv.jornada, servicios: [sv] });
            } else {
                sueltos.push(sv);
            }
        }
        return {
            jornadasEspecial: Array.from(map.values()),
            serviciosSueltos: sueltos,
        };
    }, [services]);

    // 2) Clasificar jornadas ESPECIAL por estado.
    const jornadasPorTab: Record<TabType, JornadaGroup[]> = useMemo(() => {
        const toItem = (g: { jornada: JornadaInfo; servicios: Servicio[] }): JornadaGroup => ({
            kind: 'jornada',
            jornada: g.jornada,
            servicios: g.servicios,
            id: `j${g.jornada.id}`,
        });
        return {
            pendientes: jornadasEspecial.filter(g => g.jornada.estado === 'PUBLICADA').map(toItem),
            activos:    jornadasEspecial.filter(g => g.jornada.estado === 'ACTIVA').map(toItem),
            historial:  jornadasEspecial
                .filter(g => ['FINALIZADA', 'TRUNCADA', 'ANULADA'].includes(g.jornada.estado))
                .map(toItem),
        };
    }, [jornadasEspecial]);

    // 3) Clasificar servicios sueltos (NEMT) por estado del servicio — comportamiento previo.
    const pendientes = serviciosSueltos.filter(sv => (ESTADOS_PENDIENTE as readonly string[]).includes(sv.estado));
    const activos    = serviciosSueltos.filter(sv => (ESTADOS_ACTIVO as readonly string[]).includes(sv.estado));
    const historial  = serviciosSueltos.filter(sv => (ESTADOS_HISTORIAL as readonly string[]).includes(sv.estado));

    const sortByFechaHora = (a: Servicio, b: Servicio, desc = false) => {
        const fa = (a.fecha || '') + (a.hora_inicio || '');
        const fb = (b.fecha || '') + (b.hora_inicio || '');
        return desc ? fb.localeCompare(fa) : fa.localeCompare(fb);
    };

    const asItem = (sv: Servicio): ServicioItem => ({ kind: 'servicio', servicio: sv, id: `s${sv.id}` });

    // 4) Mezcla final por tab: jornadas primero, luego servicios sueltos ordenados.
    const tabData: Record<TabType, TabItem[]> = {
        pendientes: [
            ...jornadasPorTab.pendientes,
            ...[...pendientes].sort((a, b) => sortByFechaHora(a, b)).map(asItem),
        ],
        activos: [
            ...jornadasPorTab.activos,
            ...[...activos].sort((a, b) => sortByFechaHora(a, b)).map(asItem),
        ],
        historial: [
            ...jornadasPorTab.historial,
            ...[...historial].sort((a, b) => sortByFechaHora(a, b, true)).map(asItem),
        ],
    };

    // Para el FAB chat seguimos usando los servicios activos sueltos (NEMT).
    const activosFlat = activos;

    // ── Render ────────────────────────────────────────────────────────────────
    const renderItem = useCallback(({ item }: { item: TabItem }) => {
        if (item.kind === 'jornada') {
            return <JornadaEspecialCard jornada={item.jornada} onPress={abrirInicio} />;
        }
        const sv = item.servicio;
        if (activeTab === 'activos') {
            return <ServicioActivoCard servicio={sv} onActualizado={loadServices} />;
        }
        if (activeTab === 'pendientes') {
            return <ServicioPendienteCard servicio={sv} onAceptado={loadServices} />;
        }
        return <ServicioHistorialCard servicio={sv} />;
    }, [activeTab, loadServices, abrirInicio]);

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
                keyExtractor={item => item.id}
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

            {/* Chat FAB — visible when there are active NEMT services */}
            {activosFlat.length > 0 && conductor?.id && (
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
                {chatOpen && activosFlat.length > 0 && conductor?.id && (
                    <ChatScreen
                        servicioId={activosFlat[0].id}
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

// ── JornadaEspecialCard styles ──────────────────────────────────────────────
const js = StyleSheet.create({
    card: {
        marginHorizontal: 12,
        marginVertical: 6,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#eef1f7',
        shadowColor: '#0e1726',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    cardHead: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    chipZuri: {
        backgroundColor: '#eaeffc',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    chipZuriTx: {
        fontSize: 10,
        fontWeight: '800',
        color: '#2f54eb',
        letterSpacing: 0.8,
    },
    estadoChip: {
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    estadoChipTx: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    cliente: {
        fontSize: 16,
        fontWeight: '800',
        color: '#0e1726',
        letterSpacing: -0.2,
    },
    turno: {
        fontSize: 12,
        fontWeight: '700',
        color: '#737f90',
        marginTop: 2,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 12,
    },
    rowItem: {
        flex: 1,
        backgroundColor: '#f6f8fb',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    rowLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#737f90',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    rowValue: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0e1726',
        marginTop: 2,
        fontVariant: ['tabular-nums'],
    },
    footerRow: {
        marginTop: 12,
        alignItems: 'flex-end',
    },
    cta: {
        fontSize: 12,
        fontWeight: '800',
        color: '#2f54eb',
        letterSpacing: 0.2,
    },
});
