/**
 * JornadaActivaView — Vista multiparada para el conductor.
 *
 * Muestra una jornada activa (PUBLICADA/ACTIVA) con sus N paradas,
 * timeline vertical, resalta la parada actual (primera no-terminal) y
 * expone el stepper de avance para esa parada.
 */
import React, { useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Linking,
    ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import type { Servicio } from '@/types/servicios';
import { driverApi } from '@/services/api';

interface Props {
    servicios: Servicio[]; // Todos los servicios con la misma jornada.id
    onRefresh: () => void;
}

const ESTADOS_TERMINAL = ['ATENDIDA', 'AUSENTE', 'DESCARTADA', 'ABORTADA'];
const ESTADOS_EN_CURSO = ['EN_RUTA_ORIGEN', 'EN_ORIGEN', 'EN_RUTA_DESTINO', 'EN_DESTINO'];

interface Avance {
    label: string;
    accion: 'EN_CAMINO' | 'EN_ORIGEN' | 'EN_TRANSPORTE' | 'EN_DESTINO' | 'COMPLETAR';
    bg: string;
}

// Acciones del stepper (nombres VERBO que el backend ACCION_A_ESTADO espera).
const AVANCE: Record<string, Avance> = {
    PENDIENTE:       { label: 'Iniciar ruta',          accion: 'EN_CAMINO',    bg: '#0B1F3A' },
    EN_RUTA_ORIGEN:  { label: 'Llegué al origen',      accion: 'EN_ORIGEN',    bg: '#0B1F3A' },
    EN_ORIGEN:       { label: 'En camino al destino',  accion: 'EN_TRANSPORTE', bg: '#0B1F3A' },
    EN_RUTA_DESTINO: { label: 'Llegué al destino',     accion: 'EN_DESTINO',   bg: '#0B1F3A' },
    EN_DESTINO:      { label: 'Completar',             accion: 'COMPLETAR',    bg: '#00875A' },
};

const ESTADO_LABEL: Record<string, string> = {
    PENDIENTE: 'Pendiente',
    EN_RUTA_ORIGEN: 'En camino',
    EN_ORIGEN: 'En origen',
    EN_RUTA_DESTINO: 'En transporte',
    EN_DESTINO: 'En destino',
    ATENDIDA: 'Atendida',
    AUSENTE: 'Ausente',
    DESCARTADA: 'Descartada',
    ABORTADA: 'Abortada',
};

function colorForEstado(estado: string): { dot: string; text: string; bg: string } {
    if (estado === 'ATENDIDA') return { dot: '#00875A', text: '#065F46', bg: '#D1FAE5' };
    if (ESTADOS_EN_CURSO.includes(estado)) return { dot: '#3B82F6', text: '#1D4ED8', bg: '#DBEAFE' };
    if (['AUSENTE', 'DESCARTADA', 'ABORTADA'].includes(estado)) return { dot: '#DC2626', text: '#991B1B', bg: '#FEE2E2' };
    return { dot: '#9CA3AF', text: '#6B7280', bg: '#F3F4F6' };
}

export function JornadaActivaView({ servicios, onRefresh }: Props) {
    // Ordenar por orden (nulls al final) y luego hora_inicio
    const ordenados = useMemo(() => {
        return [...servicios].sort((a, b) => {
            const oa = a.orden ?? 999;
            const ob = b.orden ?? 999;
            if (oa !== ob) return oa - ob;
            return (a.hora_inicio || '').localeCompare(b.hora_inicio || '');
        });
    }, [servicios]);

    // Jornada vive en el primer servicio (todos tienen la misma)
    const jornada = ordenados[0]?.jornada;

    // Parada actual = primera no-terminal
    const actualIdx = ordenados.findIndex(s => !ESTADOS_TERMINAL.includes(s.estado));
    const actual = actualIdx >= 0 ? ordenados[actualIdx] : null;

    const [loading, setLoading] = useState<number | null>(null);

    const handleAvanzar = async (servicio: Servicio) => {
        const av = AVANCE[servicio.estado];
        if (!av) return;
        setLoading(servicio.id);
        try {
            await driverApi.avanzarProgramacion(servicio.id, av.accion);
            onRefresh();
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'No se pudo actualizar el estado.');
        } finally {
            setLoading(null);
        }
    };

    const handleNavegar = (s: Servicio) => {
        const label = s.origen.direccion || s.origen.referencia || '';
        if (!label) {
            Alert.alert('Sin dirección', 'No hay dirección registrada para esta parada.');
            return;
        }
        const q = encodeURIComponent(label);
        const url = Platform.OS === 'ios'
            ? `maps://?q=${q}`
            : `google.navigation:q=${q}`;
        Linking.openURL(url).catch(() =>
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`),
        );
    };

    if (!jornada) {
        return (
            <View style={s.empty}>
                <Text style={s.emptyTx}>Sin jornada activa</Text>
            </View>
        );
    }

    const pct = jornada.total_paradas > 0
        ? Math.round((jornada.atendidas / jornada.total_paradas) * 100)
        : 0;

    return (
        <View style={s.root}>
            {/* Header */}
            <View style={s.header}>
                <View style={s.headerTop}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.doctor} numberOfLines={1}>
                            Dr. {jornada.doctor_nombre || '—'}
                        </Text>
                        <Text style={s.cliente} numberOfLines={1}>
                            {jornada.cliente_nombre || 'Sin cliente'}
                            {jornada.turno ? ` · Turno ${jornada.turno}` : ''}
                        </Text>
                    </View>
                    <View style={[s.estadoBadge, jornada.estado === 'ACTIVA' ? s.badgeActiva : s.badgePubli]}>
                        <Text style={s.estadoTx}>{jornada.estado}</Text>
                    </View>
                </View>

                {/* Progreso */}
                <View style={s.progressRow}>
                    <View style={s.progressBar}>
                        <View style={[s.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={s.progressTx}>
                        {jornada.atendidas}/{jornada.total_paradas} atendidas
                    </Text>
                </View>
            </View>

            {/* Botón navegar */}
            {actual && actual.origen.direccion && (
                <TouchableOpacity style={s.navBtn} onPress={() => handleNavegar(actual)}>
                    <Text style={s.navBtnTx}>
                        🗺️  Navegar a {actual.origen.referencia || actual.origen.direccion}
                    </Text>
                </TouchableOpacity>
            )}

            {/* Timeline */}
            <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 16 }}>
                {ordenados.map((p, idx) => {
                    const isActual = idx === actualIdx;
                    const isPast = idx < actualIdx || ESTADOS_TERMINAL.includes(p.estado);
                    const colors = colorForEstado(p.estado);
                    const av = AVANCE[p.estado];

                    return (
                        <View
                            key={p.id}
                            style={[
                                s.item,
                                isActual && s.itemActual,
                                isPast && s.itemPast,
                            ]}
                        >
                            {/* Linea vertical + dot */}
                            <View style={s.linea}>
                                <View style={[s.dot, { backgroundColor: colors.dot }]}>
                                    <Text style={s.dotTx}>{p.orden ?? idx + 1}</Text>
                                </View>
                                {idx < ordenados.length - 1 && (
                                    <View style={[s.lineaV, isPast && s.lineaVPast]} />
                                )}
                            </View>

                            {/* Info parada */}
                            <View style={s.info}>
                                <View style={s.infoHeader}>
                                    <Text style={s.distrito} numberOfLines={1}>
                                        {p.origen.referencia || 'Sin distrito'}
                                    </Text>
                                    <View style={[s.estadoChip, { backgroundColor: colors.bg }]}>
                                        <Text style={[s.estadoChipTx, { color: colors.text }]}>
                                            {ESTADO_LABEL[p.estado] || p.estado}
                                        </Text>
                                    </View>
                                </View>
                                {p.origen.direccion ? (
                                    <Text style={s.direccion} numberOfLines={2}>
                                        📍 {p.origen.direccion}
                                    </Text>
                                ) : null}
                                <Text style={s.hora}>
                                    ⏰ {p.hora_inicio || '—'}{p.hora_fin ? ` – ${p.hora_fin}` : ''}
                                </Text>

                                {/* Stepper button solo en la parada actual */}
                                {isActual && av && (
                                    <TouchableOpacity
                                        style={[s.avanzarBtn, { backgroundColor: av.bg }, loading === p.id && s.avanzarBtnDisabled]}
                                        onPress={() => handleAvanzar(p)}
                                        disabled={loading === p.id}
                                    >
                                        {loading === p.id
                                            ? <ActivityIndicator color="#fff" size="small" />
                                            : <Text style={s.avanzarBtnTx}>{av.label}</Text>}
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#F0F4F8',
    },
    empty: {
        padding: 24,
        alignItems: 'center',
    },
    emptyTx: {
        color: '#6B7280',
        fontSize: 14,
    },
    // Header
    header: {
        backgroundColor: '#0B1F3A',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    doctor: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
    },
    cliente: {
        color: '#CBD5E1',
        fontSize: 12,
        marginTop: 2,
    },
    estadoBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    badgeActiva: { backgroundColor: '#FDE68A' },
    badgePubli: { backgroundColor: '#C7D2FE' },
    estadoTx: {
        fontSize: 10,
        fontWeight: '800',
        color: '#0B1F3A',
        letterSpacing: 0.4,
    },
    progressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 10,
    },
    progressBar: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#00875A',
    },
    progressTx: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    // Nav btn
    navBtn: {
        backgroundColor: '#00875A',
        padding: 14,
        alignItems: 'center',
    },
    navBtnTx: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    // Timeline
    scroll: { flex: 1 },
    item: {
        flexDirection: 'row',
        padding: 12,
        backgroundColor: '#fff',
        marginHorizontal: 10,
        marginTop: 8,
        borderRadius: 10,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    itemActual: {
        backgroundColor: '#EFF6FF',
        borderLeftColor: '#3B82F6',
    },
    itemPast: {
        opacity: 0.6,
    },
    linea: {
        width: 32,
        alignItems: 'center',
    },
    dot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dotTx: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '800',
    },
    lineaV: {
        flex: 1,
        width: 2,
        backgroundColor: '#E5E7EB',
        marginTop: 4,
    },
    lineaVPast: {
        backgroundColor: '#00875A',
    },
    info: {
        flex: 1,
        marginLeft: 10,
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    distrito: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: '#0B1F3A',
    },
    estadoChip: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 4,
    },
    estadoChipTx: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    direccion: {
        fontSize: 12,
        color: '#4B5563',
        marginTop: 3,
    },
    hora: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
    },
    avanzarBtn: {
        marginTop: 10,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    avanzarBtnDisabled: {
        opacity: 0.6,
    },
    avanzarBtnTx: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
});
