/**
 * JornadaEspecialView — Vista ESPECIAL para el conductor.
 *
 * NO muestra timeline de paradas (eso es NEMT). Muestra:
 *  - Estado 1 (PUBLICADA): "Tienes una jornada hoy" + boton INICIAR + modal paradas declaradas.
 *  - Estado 2 (ACTIVA): cronometro desde inicio_real_at + contador declaradas/detectadas +
 *    indicador de color progresivo (gris / amarillo / verde) segun minutos detenido local,
 *    + boton FINALIZAR.
 *
 * El color progresivo se calcula LOCALMENTE con el GPS del store. Es visual/estimado.
 * El backend (paradaDetector) tiene la verdad y actualiza paradas_detectadas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import type { Servicio } from '@/types/servicios';
import { driverApi } from '@/services/api';
import { useLocationStore } from '@/stores/location';

interface Props {
    servicios: Servicio[]; // Todos los servicios con la misma jornada (puede ser 1 en ESPECIAL)
    onRefresh: () => void;
}

// Distancia haversine en metros
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtDur(ms: number): string {
    if (ms < 0) ms = 0;
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtHora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Jornada con los campos de FASE E (vive dentro de servicio.jornada que extendimos)
interface JornadaFaseE {
    id: number;
    estado: 'PUBLICADA' | 'ACTIVA' | string;
    modo?: 'ESPECIAL' | 'NEMT';
    doctor_nombre: string | null;
    cliente_nombre: string | null;
    turno: string | null;
    inicio_real_at?: string | null;
    fin_real_at?: string | null;
    paradas_declaradas?: number | null;
    paradas_detectadas?: number;
    sugerencia_inicio_at?: string | null;
}

export function JornadaEspecialView({ servicios, onRefresh }: Props) {
    const jornada = (servicios[0]?.jornada as unknown) as JornadaFaseE | undefined;
    const jornadaId = jornada?.id;

    const [modalOpen, setModalOpen] = useState(false);
    const [paradasInput, setParadasInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [now, setNow] = useState(Date.now());

    // Cronometro: tick 1s solo cuando ACTIVA
    useEffect(() => {
        if (jornada?.estado !== 'ACTIVA') return;
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
    }, [jornada?.estado]);

    // ── Color progresivo (local) ────────────────────────────────────
    // Guardamos el "ancla" (ultima posicion donde empezo a estar quieto).
    // Si la ubicacion actual se mueve > 50m del ancla, se resetea el ancla.
    const currentLocation = useLocationStore(s => s.currentLocation);
    const [ancla, setAncla] = useState<{ lat: number; lng: number; since: number } | null>(null);

    useEffect(() => {
        if (!currentLocation) return;
        setAncla(prev => {
            if (!prev) {
                return { lat: currentLocation.latitude, lng: currentLocation.longitude, since: Date.now() };
            }
            const dist = haversineM(prev.lat, prev.lng, currentLocation.latitude, currentLocation.longitude);
            if (dist > 50) {
                return { lat: currentLocation.latitude, lng: currentLocation.longitude, since: Date.now() };
            }
            return prev;
        });
    }, [currentLocation?.latitude, currentLocation?.longitude]);

    const minutosDetenido = ancla ? Math.floor((now - ancla.since) / 60000) : 0;
    const gpsDisponible = !!currentLocation;

    const colorParada = useMemo(() => {
        if (jornada?.estado !== 'ACTIVA') return null;
        if (!gpsDisponible) return { bg: '#F3F4F6', fg: '#9CA3AF', label: 'Sin señal GPS' };
        if (minutosDetenido < 1) return { bg: '#F3F4F6', fg: '#6B7280', label: 'En movimiento' };
        if (minutosDetenido < 10) return { bg: '#F3F4F6', fg: '#6B7280', label: `Detenido ${minutosDetenido}m` };
        if (minutosDetenido < 15) return { bg: '#FEF3C7', fg: '#92400E', label: `Parada posible · ${minutosDetenido}m` };
        return { bg: '#D1FAE5', fg: '#065F46', label: `Con un paciente · ${minutosDetenido}m` };
    }, [jornada?.estado, minutosDetenido, gpsDisponible]);

    const handleIniciar = () => {
        setParadasInput('');
        setModalOpen(true);
    };

    const submitIniciar = async (paradas?: number) => {
        if (!jornadaId) return;
        setModalOpen(false);
        setLoading(true);
        try {
            await driverApi.iniciarJornada(jornadaId, paradas);
            onRefresh();
        } catch (e: any) {
            Alert.alert('Error', e?.message || 'No se pudo iniciar la jornada.');
        } finally {
            setLoading(false);
        }
    };

    const handleFinalizar = () => {
        if (!jornadaId) return;
        Alert.alert(
            'Finalizar jornada',
            `Paradas detectadas: ${jornada?.paradas_detectadas ?? 0}\n¿Confirmar fin de jornada?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Finalizar',
                    style: 'destructive',
                    onPress: async () => {
                        setLoading(true);
                        try {
                            await driverApi.finalizarJornada(jornadaId);
                            onRefresh();
                        } catch (e: any) {
                            Alert.alert('Error', e?.message || 'No se pudo finalizar.');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ],
        );
    };

    if (!jornada) {
        return (
            <View style={s.empty}><Text style={s.emptyTx}>Sin jornada activa</Text></View>
        );
    }

    const esActiva = jornada.estado === 'ACTIVA';
    const esPublicada = jornada.estado === 'PUBLICADA';

    const inicioMs = jornada.inicio_real_at ? new Date(jornada.inicio_real_at).getTime() : null;
    const duracionTx = inicioMs ? fmtDur(now - inicioMs) : '—';

    return (
        <View style={s.root}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
                {/* Header */}
                <View style={s.header}>
                    <Text style={s.headerLabel}>
                        {esActiva ? 'JORNADA ACTIVA' : 'TU JORNADA HOY'}
                    </Text>
                    <Text style={s.doctor} numberOfLines={1}>
                        Dr. {jornada.doctor_nombre || '—'}
                    </Text>
                    <Text style={s.cliente} numberOfLines={1}>
                        {jornada.cliente_nombre || 'Sin cliente'}
                        {jornada.turno ? ` · Turno ${jornada.turno}` : ''}
                    </Text>
                </View>

                {/* Banner sugerencia_inicio (PUBLICADA + GPS se movio) */}
                {esPublicada && jornada.sugerencia_inicio_at && (
                    <View style={s.banner}>
                        <Text style={s.bannerTx}>¿Ya iniciaste tu jornada?</Text>
                    </View>
                )}

                {/* Estado ACTIVA: cronometro + contadores + color parada */}
                {esActiva && (
                    <>
                        <View style={s.card}>
                            <Text style={s.cardLabel}>Inicio</Text>
                            <Text style={s.cardVal}>
                                {fmtHora(jornada.inicio_real_at)} · {duracionTx} en curso
                            </Text>
                        </View>

                        <View style={s.row}>
                            <View style={[s.card, s.rowCard]}>
                                <Text style={s.cardLabel}>Declaradas</Text>
                                <Text style={s.cardBig}>{jornada.paradas_declaradas ?? '—'}</Text>
                            </View>
                            <View style={[s.card, s.rowCard]}>
                                <Text style={s.cardLabel}>Detectadas</Text>
                                <Text style={s.cardBig}>{jornada.paradas_detectadas ?? 0}</Text>
                            </View>
                        </View>

                        {colorParada && (
                            <View style={[s.estadoParada, { backgroundColor: colorParada.bg }]}>
                                <Text style={[s.estadoParadaTx, { color: colorParada.fg }]}>
                                    {colorParada.label}
                                </Text>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>

            {/* Boton grande fijo abajo */}
            <View style={s.footer}>
                {esPublicada ? (
                    <TouchableOpacity
                        style={[s.btn, s.btnPrimary, loading && s.btnDisabled]}
                        onPress={handleIniciar}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>INICIAR JORNADA</Text>}
                    </TouchableOpacity>
                ) : esActiva ? (
                    <TouchableOpacity
                        style={[s.btn, s.btnDanger, loading && s.btnDisabled]}
                        onPress={handleFinalizar}
                        disabled={loading}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>FINALIZAR JORNADA</Text>}
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* Modal: cuantas paradas */}
            <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
                <View style={s.modalBg}>
                    <View style={s.modalCard}>
                        <Text style={s.modalTitle}>¿Cuántas paradas tienes hoy?</Text>
                        <Text style={s.modalHint}>Opcional. Puedes omitir.</Text>
                        <TextInput
                            value={paradasInput}
                            onChangeText={t => setParadasInput(t.replace(/[^0-9]/g, '').slice(0, 2))}
                            keyboardType="numeric"
                            placeholder="Ej: 9"
                            style={s.modalInput}
                            autoFocus
                        />
                        <View style={s.modalBtnRow}>
                            <TouchableOpacity style={[s.modalBtn, s.modalBtnGhost]} onPress={() => submitIniciar(undefined)}>
                                <Text style={s.modalBtnGhostTx}>Omitir</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[s.modalBtn, s.modalBtnPrimary]}
                                onPress={() => {
                                    const n = parseInt(paradasInput, 10);
                                    submitIniciar(Number.isFinite(n) && n > 0 ? Math.min(n, 20) : undefined);
                                }}
                            >
                                <Text style={s.modalBtnPrimaryTx}>Iniciar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F0F4F8' },
    empty: { padding: 24, alignItems: 'center' },
    emptyTx: { color: '#6B7280', fontSize: 14 },

    header: { marginBottom: 12 },
    headerLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#6B7280',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    doctor: { fontSize: 18, fontWeight: '800', color: '#0B1F3A' },
    cliente: { fontSize: 13, color: '#4B5563', marginTop: 2 },

    banner: {
        backgroundColor: '#FEF3C7',
        borderLeftWidth: 3,
        borderLeftColor: '#F59E0B',
        padding: 10,
        borderRadius: 6,
        marginBottom: 12,
    },
    bannerTx: { fontSize: 13, fontWeight: '700', color: '#92400E' },

    card: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 12,
        marginBottom: 10,
    },
    cardLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#6B7280',
        letterSpacing: 0.5,
    },
    cardVal: { fontSize: 15, fontWeight: '700', color: '#0B1F3A', marginTop: 4 },
    cardBig: { fontSize: 28, fontWeight: '800', color: '#0B1F3A', marginTop: 4, fontVariant: ['tabular-nums'] },

    row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    rowCard: { flex: 1 },

    estadoParada: {
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        marginTop: 2,
    },
    estadoParadaTx: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },

    footer: {
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        backgroundColor: '#fff',
    },
    btn: {
        paddingVertical: 16,
        borderRadius: 10,
        alignItems: 'center',
    },
    btnPrimary: { backgroundColor: '#00875A' },
    btnDanger: { backgroundColor: '#DC2626' },
    btnDisabled: { opacity: 0.6 },
    btnTx: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },

    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        width: '100%',
        maxWidth: 360,
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 20,
    },
    modalTitle: { fontSize: 16, fontWeight: '800', color: '#0B1F3A' },
    modalHint: { fontSize: 12, color: '#6B7280', marginTop: 4, marginBottom: 12 },
    modalInput: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        marginBottom: 16,
    },
    modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    modalBtnGhost: { backgroundColor: 'transparent' },
    modalBtnPrimary: { backgroundColor: '#00875A' },
    modalBtnGhostTx: { color: '#6B7280', fontWeight: '700' },
    modalBtnPrimaryTx: { color: '#fff', fontWeight: '800' },
});
