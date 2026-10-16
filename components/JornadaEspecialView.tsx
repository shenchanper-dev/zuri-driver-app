/**
 * JornadaEspecialView — Vista ESPECIAL para el conductor.
 *
 * APK 111:
 *  · PASO 1.A: BottomSheet self-contained + CTA anclado (BottomSheetFooter).
 *  · PASO 1.B: estado PRE-INICIO con jerarquia densa (eyebrow + chip ZURI
 *               ESPECIAL + tarjeta de jornada + hint + banner sugerencia).
 *
 * Datos consumidos (del backend, en servicios[0].jornada):
 *   turno, cliente_nombre, doctor_nombre,
 *   hora_inicio_planeada, hora_fin_planeada,
 *   paradas_declaradas, paradas_detectadas,
 *   inicio_real_at, fin_real_at, sugerencia_inicio_at,
 *   distrito (opcional — ver nota al final del archivo).
 *
 * NEMT no se toca: ese flujo sigue en JornadaActivaView con el BottomSheet
 * clasico del index.tsx.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
    ActivityIndicator, Alert,
} from 'react-native';
import BottomSheet, {
    BottomSheetFooter,
    BottomSheetScrollView,
    type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

interface JornadaFaseE {
    id: number;
    estado: 'PUBLICADA' | 'ACTIVA' | string;
    modo?: 'ESPECIAL' | 'NEMT';
    doctor_nombre: string | null;
    cliente_nombre: string | null;
    turno: string | null;
    inicio_real_at?: string | null;
    fin_real_at?: string | null;
    hora_inicio_planeada?: string | null;
    hora_fin_planeada?: string | null;
    paradas_declaradas?: number | null;
    paradas_detectadas?: number;
    sugerencia_inicio_at?: string | null;
    // PASO 1.B — campo opcional (ver nota al final del archivo).
    distrito?: string | null;
}

// ── Row helper para la tarjeta de jornada (PASO 1.B) ────────────────────
function JornadaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <View style={s.jrnRow}>
            <Text style={s.jrnRowIcon}>{icon}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.jrnRowLabel}>{label}</Text>
                <Text style={s.jrnRowValue} numberOfLines={1}>{value}</Text>
            </View>
        </View>
    );
}

export function JornadaEspecialView({ servicios, onRefresh }: Props) {
    const insets = useSafeAreaInsets();
    const jornada = (servicios[0]?.jornada as unknown) as JornadaFaseE | undefined;
    const jornadaId = jornada?.id;

    const [modalOpen, setModalOpen] = useState(false);
    const [paradasInput, setParadasInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [now, setNow] = useState(Date.now());

    const bsRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['16%', '46%', '86%'], []);

    // Cronometro: tick 1s solo cuando ACTIVA
    useEffect(() => {
        if (jornada?.estado !== 'ACTIVA') return;
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
    }, [jornada?.estado]);

    // ── Color progresivo (local) ────────────────────────────────────
    const currentLocation = useLocationStore(st => st.currentLocation);
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

    const handleIniciar = useCallback(() => {
        setParadasInput('');
        setModalOpen(true);
    }, []);

    const submitIniciar = useCallback(async (paradas?: number) => {
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
    }, [jornadaId, onRefresh]);

    const handleFinalizar = useCallback(() => {
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
                            const res: any = await driverApi.finalizarJornada(jornadaId);
                            const resumen = res?.resumen?.jornada;
                            if (resumen) {
                                const inicio = resumen.inicio_real_at
                                    ? new Date(resumen.inicio_real_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    : '—';
                                const fin = resumen.fin_real_at
                                    ? new Date(resumen.fin_real_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
                                    : '—';
                                const dur = resumen.duracion_min != null ? `${Math.floor(resumen.duracion_min/60)}h ${resumen.duracion_min%60}m` : '—';
                                Alert.alert(
                                    'Jornada completada',
                                    `Inicio: ${inicio}
Fin: ${fin}
Duracion: ${dur}
Declaradas: ${resumen.paradas_declaradas ?? '—'}
Detectadas: ${resumen.paradas_detectadas ?? 0}`,
                                    [{ text: 'Listo', onPress: () => onRefresh() }],
                                );
                            } else {
                                onRefresh();
                            }
                        } catch (e: any) {
                            Alert.alert('Error', e?.message || 'No se pudo finalizar.');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ],
        );
    }, [jornadaId, jornada?.paradas_detectadas, onRefresh]);

    // ── Empty state (sin jornada) — igual conserva el sheet ───────────────
    if (!jornada) {
        return (
            <BottomSheet
                ref={bsRef}
                snapPoints={snapPoints}
                index={1}
                enablePanDownToClose={false}
                enableOverDrag={false}
                handleIndicatorStyle={{ backgroundColor: '#CBD5E1', width: 48, height: 5 }}
                backgroundStyle={{ backgroundColor: '#FFFFFF' }}
            >
                <BottomSheetScrollView contentContainerStyle={s.emptyScroll}>
                    <Text style={s.emptyTx}>Sin jornada activa</Text>
                </BottomSheetScrollView>
            </BottomSheet>
        );
    }

    const esActiva = jornada.estado === 'ACTIVA';
    const esPublicada = jornada.estado === 'PUBLICADA';
    const inicioMs = jornada.inicio_real_at ? new Date(jornada.inicio_real_at).getTime() : null;
    const duracionTx = inicioMs ? fmtDur(now - inicioMs) : '—';

    // PASO 1.B — valores derivados del estado PRE-INICIO
    const clienteBadge = (jornada.cliente_nombre || 'JORNADA').toUpperCase();
    const horarioTx =
        jornada.hora_inicio_planeada && jornada.hora_fin_planeada
            ? `${jornada.hora_inicio_planeada} – ${jornada.hora_fin_planeada}`
            : jornada.hora_inicio_planeada
                ? `Desde ${jornada.hora_inicio_planeada}`
                : '—';
    const zonaTx = jornada.distrito ?? '—';
    const paradasTx = jornada.paradas_declaradas != null
        ? String(jornada.paradas_declaradas)
        : '—';

    // ── CTA anclado al borde inferior del sheet ──────────────────────────
    const renderFooter = useCallback((props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props} bottomInset={insets.bottom}>
            <View style={[s.footer, { paddingBottom: 14 }]}>
                {esPublicada ? (
                    <TouchableOpacity
                        style={[s.btn, s.btnPrimary, loading && s.btnDisabled]}
                        onPress={handleIniciar}
                        disabled={loading}
                        activeOpacity={0.9}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>Iniciar jornada</Text>}
                    </TouchableOpacity>
                ) : esActiva ? (
                    <TouchableOpacity
                        style={[s.btn, s.btnDanger, loading && s.btnDisabled]}
                        onPress={handleFinalizar}
                        disabled={loading}
                        activeOpacity={0.9}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTx}>Finalizar jornada</Text>}
                    </TouchableOpacity>
                ) : null}
            </View>
        </BottomSheetFooter>
    ), [insets.bottom, esPublicada, esActiva, loading, handleIniciar, handleFinalizar]);

    return (
        <>
            <BottomSheet
                ref={bsRef}
                snapPoints={snapPoints}
                index={1}
                enablePanDownToClose={false}
                enableOverDrag={false}
                handleIndicatorStyle={{ backgroundColor: '#CBD5E1', width: 48, height: 5 }}
                backgroundStyle={{ backgroundColor: '#FFFFFF' }}
                footerComponent={renderFooter}
            >
                <BottomSheetScrollView contentContainerStyle={s.scrollContent}>

                    {esPublicada ? (
                        // ─── PASO 1.B · ESTADO PRE-INICIO ────────────────────
                        <>
                            {/* Eyebrow + chip ZURI ESPECIAL */}
                            <View style={s.eyebrowRow}>
                                <Text style={s.eyebrow}>Tu jornada de hoy</Text>
                                <View style={s.chipZuri}>
                                    <Text style={s.chipZuriTx}>ZURI ESPECIAL</Text>
                                </View>
                            </View>
                            <Text style={s.turnoTitle}>
                                {jornada.turno ? `Turno ${jornada.turno}` : 'Jornada ESPECIAL'}
                            </Text>

                            {/* Tarjeta de jornada */}
                            <View style={s.jornadaCard}>
                                <View style={s.jornadaCardHead}>
                                    <View style={s.clienteBadge}>
                                        <Text style={s.clienteBadgeTx}>{clienteBadge}</Text>
                                    </View>
                                    <Text style={s.jornadaSub}>Transporte de personal médico</Text>
                                </View>

                                <View style={s.jornadaCardBody}>
                                    <JornadaRow icon="🕒" label="Horario planeado" value={horarioTx} />
                                    <View style={s.jrnSep} />
                                    <JornadaRow icon="📍" label="Zona" value={zonaTx} />
                                    <View style={s.jrnSep} />
                                    <JornadaRow icon="🧭" label="Paradas planeadas" value={paradasTx} />
                                    {jornada.doctor_nombre && (
                                        <>
                                            <View style={s.jrnSep} />
                                            <JornadaRow icon="🩺" label="Doctor" value={`Dr. ${jornada.doctor_nombre}`} />
                                        </>
                                    )}
                                </View>
                            </View>

                            {/* Hint "estás en línea" */}
                            <View style={s.hintBox}>
                                <View style={s.hintDot} />
                                <Text style={s.hintTx}>
                                    Estás en línea. Inicia cuando salgas de la cochera.
                                </Text>
                            </View>

                            {/* Banner sugerencia_inicio_at (GPS detectó movimiento) */}
                            {jornada.sugerencia_inicio_at && (
                                <View style={s.banner}>
                                    <Text style={s.bannerTx}>¿Ya iniciaste tu jornada?</Text>
                                </View>
                            )}
                        </>
                    ) : (
                        // ─── Estado ACTIVA — se rediseña en PASO 1.C ─────────
                        <>
                            <View style={s.header}>
                                <Text style={s.headerLabel}>JORNADA ACTIVA</Text>
                                <Text style={s.doctor} numberOfLines={1}>
                                    Dr. {jornada.doctor_nombre || '—'}
                                </Text>
                                <Text style={s.cliente} numberOfLines={1}>
                                    {jornada.cliente_nombre || 'Sin cliente'}
                                    {jornada.turno ? ` · Turno ${jornada.turno}` : ''}
                                </Text>
                            </View>

                            {/* T1.6: Banner recordatorio FIN (ACTIVA + hora_fin + 60 min pasado) */}
                            {jornada.hora_fin_planeada && (() => {
                                const [hh, mm] = jornada.hora_fin_planeada.split(':').map(Number);
                                const finPlan = new Date();
                                finPlan.setHours(hh, mm, 0, 0);
                                const vencido = Date.now() - finPlan.getTime() > 60 * 60 * 1000;
                                if (!vencido) return null;
                                return (
                                    <View style={[s.banner, { backgroundColor: '#FEE2E2', borderLeftColor: '#DC2626' }]}>
                                        <Text style={[s.bannerTx, { color: '#991B1B' }]}>¿Terminaste tu jornada? Supero la hora planeada en +60 min.</Text>
                                    </View>
                                );
                            })()}

                            {/* Cronometro + contadores + color parada */}
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

                </BottomSheetScrollView>
            </BottomSheet>

            {/* Modal: cuantas paradas (reusado de pre-APK111, idéntico) */}
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
        </>
    );
}

/**
 * NOTA PASO 1.B — campo `distrito`:
 * JornadaInfo (types/servicios.ts) todavía no lo exporta. Mientras tanto
 * la UI muestra "—" si no viene. Para completar la fila "Zona" con el
 * distrito real: en el backend `/api/driver/servicios` incluir el campo
 * `jornadas.distrito_nombre` en la jornada embedded. (Fuera del alcance
 * de este sub-step; agrega al PASO 2 o a backend por separado.)
 */

const s = StyleSheet.create({
    scrollContent: {
        padding: 16,
        // El footer anclado ocupa ~84px (btn 56 + padding 10+14 + safe-area).
        // Reservamos ese espacio al final para que el scroll no quede bajo el CTA.
        paddingBottom: 120,
    },
    emptyScroll: {
        padding: 24,
        alignItems: 'center',
    },
    emptyTx: { color: '#6B7280', fontSize: 14 },

    // ── Header ACTIVA (legacy, se rediseña en 1.C) ──────────────────────
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

    // ── PASO 1.B — Eyebrow + chip ZURI + turno title ───────────────────
    eyebrowRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    eyebrow: {
        fontSize: 11,
        fontWeight: '700',
        color: '#737f90',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
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
    turnoTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#0e1726',
        letterSpacing: -0.3,
        marginBottom: 14,
    },

    // ── PASO 1.B — Tarjeta de jornada ──────────────────────────────────
    jornadaCard: {
        backgroundColor: '#ffffff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#eef1f7',
        marginBottom: 14,
        overflow: 'hidden',
        shadowColor: '#0e1726',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    jornadaCardHead: {
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f4f9',
    },
    clienteBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#0e1726',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 6,
    },
    clienteBadgeTx: {
        fontSize: 10,
        fontWeight: '800',
        color: '#ffffff',
        letterSpacing: 0.8,
    },
    jornadaSub: {
        fontSize: 13,
        fontWeight: '600',
        color: '#3a4656',
    },
    jornadaCardBody: {
        paddingHorizontal: 14,
        paddingVertical: 4,
    },
    jrnRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 10,
    },
    jrnRowIcon: {
        fontSize: 17,
        width: 24,
        textAlign: 'center',
    },
    jrnRowLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: '#737f90',
        letterSpacing: 0.4,
        textTransform: 'uppercase',
    },
    jrnRowValue: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0e1726',
        marginTop: 1,
        fontVariant: ['tabular-nums'],
    },
    jrnSep: {
        height: 1,
        backgroundColor: '#f1f4f9',
    },

    // ── PASO 1.B — Hint "estás en línea" ───────────────────────────────
    hintBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#e6f6ee',
        marginBottom: 10,
    },
    hintDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0f9d63',
    },
    hintTx: {
        fontSize: 13,
        fontWeight: '600',
        color: '#065f46',
        flex: 1,
    },

    // ── Banner amarillo (sugerencia_inicio_at) ─────────────────────────
    banner: {
        backgroundColor: '#FEF3C7',
        borderLeftWidth: 3,
        borderLeftColor: '#F59E0B',
        padding: 10,
        borderRadius: 6,
        marginBottom: 12,
    },
    bannerTx: { fontSize: 13, fontWeight: '700', color: '#92400E' },

    // ── Cards estado ACTIVA (legacy, se rediseña en 1.C) ───────────────
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

    // ── Footer anclado (CTA) — compartido con 1.A ──────────────────────
    footer: {
        paddingHorizontal: 16,
        paddingTop: 10,
        backgroundColor: '#fff',
    },
    btn: {
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#0e1726',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    btnPrimary: { backgroundColor: '#0f9d63' },
    btnDanger: { backgroundColor: '#e04646' },
    btnDisabled: { opacity: 0.6 },
    btnTx: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

    // ── Modal paradas (idéntico a pre-APK111) ──────────────────────────
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
    modalBtnPrimary: { backgroundColor: '#0f9d63' },
    modalBtnGhostTx: { color: '#6B7280', fontWeight: '700' },
    modalBtnPrimaryTx: { color: '#fff', fontWeight: '800' },
});
