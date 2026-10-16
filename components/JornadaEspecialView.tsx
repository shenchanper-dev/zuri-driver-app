/**
 * JornadaEspecialView — Vista ESPECIAL para el conductor.
 *
 * APK 111:
 *  · PASO 1.A: BottomSheet self-contained + CTA anclado (BottomSheetFooter).
 *  · PASO 1.B: estado PRE-INICIO (eyebrow + tarjeta + hint).
 *  · PASO 1.C: estado ACTIVA (hero cronómetro + métricas + timeline).
 *  · PASO 1.D: estado RESUMEN post-finalizar (check + grid + CTA Listo).
 *
 * NEMT no se toca: ese flujo sigue en JornadaActivaView.
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
    servicios: Servicio[];
    onRefresh: () => void;
}

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

function fmtDurMin(min: number | null | undefined): string {
    if (min == null) return '—';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtHora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtFechaLarga(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', {
        weekday: 'long', day: 'numeric', month: 'long',
    });
}

interface ParadaDetectada {
    id: number;
    lat?: number;
    lng?: number;
    inicio_at: string | null;
    confirmada_at?: string | null;
    cerrada_at?: string | null;
    duracion_min?: number | null;
    estado?: string | null;
    direccion_aprox?: string | null;
    distrito_aprox?: string | null;
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
    distrito?: string | null;
    paradas_detectadas_list?: ParadaDetectada[];
}

// Payload del backend al finalizar (POST /api/v3/jornadas/:id/finalizar).
interface JornadaResumenApi {
    id?: number;
    cliente_nombre?: string | null;
    turno?: string | null;
    inicio_real_at?: string | null;
    fin_real_at?: string | null;
    duracion_min?: number | null;
    paradas_declaradas?: number | null;
    paradas_detectadas?: number;
}

// ── Helpers UI ──────────────────────────────────────────────────────────
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

function MetricTile({ label, value, big = true }: { label: string; value: string; big?: boolean }) {
    return (
        <View style={s.metricCard}>
            <Text style={s.metricCardLabel}>{label}</Text>
            <Text style={big ? s.metricCardValueBig : s.metricCardValueSmall} numberOfLines={1}>
                {value}
            </Text>
        </View>
    );
}

// PASO 1.D — tile del grid de resumen (2 por fila, radius 15, label + value).
function ResumenTile({ label, value }: { label: string; value: string }) {
    return (
        <View style={s.resumenTile}>
            <Text style={s.resumenLabel}>{label}</Text>
            <Text style={s.resumenValue} numberOfLines={1}>{value}</Text>
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

    // PASO 1.D — resumen local post-finalizar (sobrevive hasta tap "Listo").
    const [resumenJornada, setResumenJornada] = useState<JornadaResumenApi | null>(null);

    const bsRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ['16%', '46%', '86%'], []);

    useEffect(() => {
        if (jornada?.estado !== 'ACTIVA') return;
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
    }, [jornada?.estado]);

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

    const movimiento = useMemo(() => {
        if (jornada?.estado !== 'ACTIVA') return null;
        if (!gpsDisponible) {
            return { bg: '#F3F4F6', fg: '#737f90', dot: '#9CA3AF', label: 'Sin señal GPS' };
        }
        if (minutosDetenido < 1) {
            return { bg: '#e6f6ee', fg: '#0b7d4e', dot: '#0f9d63', label: 'En movimiento' };
        }
        const zona = jornada?.distrito ? ` en ${jornada.distrito}` : '';
        if (minutosDetenido < 15) {
            return {
                bg: '#fdf2dd', fg: '#8a5a0b', dot: '#e8920a',
                label: `Detenido ${minutosDetenido}m${zona}`,
            };
        }
        return {
            bg: '#e6f6ee', fg: '#0b7d4e', dot: '#0f9d63',
            label: `Con un paciente · ${minutosDetenido}m${zona}`,
        };
    }, [jornada?.estado, minutosDetenido, gpsDisponible, jornada?.distrito]);

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

    // PASO 1.D — Confirmación → finalizar → mostrar RESUMEN (sin Alert extra).
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
                            const resumen = res?.resumen?.jornada as JornadaResumenApi | undefined;
                            // Fallback: si el backend no devuelve resumen, armamos uno con lo que tenemos.
                            setResumenJornada(resumen ?? {
                                cliente_nombre: jornada?.cliente_nombre ?? null,
                                turno: jornada?.turno ?? null,
                                inicio_real_at: jornada?.inicio_real_at ?? null,
                                fin_real_at: new Date().toISOString(),
                                duracion_min: jornada?.inicio_real_at
                                    ? Math.floor((Date.now() - new Date(jornada.inicio_real_at).getTime()) / 60000)
                                    : null,
                                paradas_declaradas: jornada?.paradas_declaradas ?? null,
                                paradas_detectadas: jornada?.paradas_detectadas ?? 0,
                            });
                        } catch (e: any) {
                            Alert.alert('Error', e?.message || 'No se pudo finalizar.');
                        } finally {
                            setLoading(false);
                        }
                    },
                },
            ],
        );
    }, [jornadaId, jornada, onRefresh]);

    // PASO 1.D — Tap "Listo" → cierra resumen y refresca estado padre
    const handleListo = useCallback(() => {
        setResumenJornada(null);
        onRefresh();
    }, [onRefresh]);

    // ── Empty state ────────────────────────────────────────────────
    // Si hay resumen local → se renderiza más abajo (sobrevive al cambio de jornada).
    if (!jornada && !resumenJornada) {
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

    const esActiva = jornada?.estado === 'ACTIVA';
    const esPublicada = jornada?.estado === 'PUBLICADA';
    const esResumen = !!resumenJornada;
    const inicioMs = jornada?.inicio_real_at ? new Date(jornada.inicio_real_at).getTime() : null;
    const duracionTx = inicioMs ? fmtDur(now - inicioMs) : '—';

    const clienteBadge = (jornada?.cliente_nombre || 'JORNADA').toUpperCase();
    const horarioTx =
        jornada?.hora_inicio_planeada && jornada?.hora_fin_planeada
            ? `${jornada.hora_inicio_planeada} – ${jornada.hora_fin_planeada}`
            : jornada?.hora_inicio_planeada
                ? `Desde ${jornada.hora_inicio_planeada}`
                : '—';
    const zonaTx = jornada?.distrito ?? '—';
    const paradasTx = jornada?.paradas_declaradas != null
        ? String(jornada.paradas_declaradas)
        : '—';

    const paradasList: ParadaDetectada[] = Array.isArray(jornada?.paradas_detectadas_list)
        ? jornada!.paradas_detectadas_list!
        : [];

    // ── CTA anclado — label + color según estado ──────────────────────────
    const renderFooter = useCallback((props: BottomSheetFooterProps) => (
        <BottomSheetFooter {...props} bottomInset={insets.bottom}>
            <View style={[s.footer, { paddingBottom: 14 }]}>
                {esResumen ? (
                    <TouchableOpacity
                        style={[s.btn, s.btnBrand]}
                        onPress={handleListo}
                        activeOpacity={0.9}
                    >
                        <Text style={s.btnTx}>Listo</Text>
                    </TouchableOpacity>
                ) : esPublicada ? (
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
    ), [insets.bottom, esResumen, esPublicada, esActiva, loading, handleListo, handleIniciar, handleFinalizar]);

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

                    {esResumen && resumenJornada ? (
                        // ─── PASO 1.D · ESTADO RESUMEN ───────────────────────
                        <>
                            <View style={s.successBlock}>
                                <View style={s.checkCircle}>
                                    <Text style={s.checkCircleTx}>✓</Text>
                                </View>
                                <Text style={s.successTitle}>Jornada finalizada</Text>
                                <Text style={s.successSub} numberOfLines={2}>
                                    {resumenJornada.cliente_nombre || 'Jornada ESPECIAL'}
                                    {resumenJornada.turno ? ` · Turno ${resumenJornada.turno}` : ''}
                                </Text>
                                <Text style={s.successFecha}>
                                    {fmtFechaLarga(resumenJornada.fin_real_at ?? resumenJornada.inicio_real_at)}
                                </Text>
                            </View>

                            {/* Grid 2x3: Duración / Inicio / Fin / Declaradas / Detectadas */}
                            <View style={s.resumenGrid}>
                                <ResumenTile
                                    label="Duración total"
                                    value={fmtDurMin(resumenJornada.duracion_min)}
                                />
                                <ResumenTile
                                    label="Inicio"
                                    value={fmtHora(resumenJornada.inicio_real_at)}
                                />
                                <ResumenTile
                                    label="Fin"
                                    value={fmtHora(resumenJornada.fin_real_at)}
                                />
                                <ResumenTile
                                    label="Declaradas"
                                    value={resumenJornada.paradas_declaradas != null ? String(resumenJornada.paradas_declaradas) : '—'}
                                />
                                <ResumenTile
                                    label="Detectadas"
                                    value={String(resumenJornada.paradas_detectadas ?? 0)}
                                />
                            </View>

                            <Text style={s.resumenHint}>
                                La jornada queda disponible en Historial.
                            </Text>
                        </>
                    ) : esPublicada && jornada ? (
                        // ─── PASO 1.B · ESTADO PRE-INICIO ────────────────────
                        <>
                            <View style={s.eyebrowRow}>
                                <Text style={s.eyebrow}>Tu jornada de hoy</Text>
                                <View style={s.chipZuri}>
                                    <Text style={s.chipZuriTx}>ZURI ESPECIAL</Text>
                                </View>
                            </View>
                            <Text style={s.turnoTitle}>
                                {jornada.turno ? `Turno ${jornada.turno}` : 'Jornada ESPECIAL'}
                            </Text>

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

                            <View style={s.hintBox}>
                                <View style={s.hintDot} />
                                <Text style={s.hintTx}>
                                    Estás en línea. Inicia cuando salgas de la cochera.
                                </Text>
                            </View>

                            {jornada.sugerencia_inicio_at && (
                                <View style={s.banner}>
                                    <Text style={s.bannerTx}>¿Ya iniciaste tu jornada?</Text>
                                </View>
                            )}
                        </>
                    ) : esActiva && jornada ? (
                        // ─── PASO 1.C · ESTADO ACTIVO ────────────────────────
                        <>
                            <View style={s.eyebrowRow}>
                                <Text style={[s.eyebrow, { color: '#0f9d63' }]}>JORNADA ACTIVA</Text>
                                <View style={s.chipZuri}>
                                    <Text style={s.chipZuriTx}>ZURI ESPECIAL</Text>
                                </View>
                            </View>
                            <Text style={s.turnoTitle} numberOfLines={1}>
                                {jornada.cliente_nombre || 'Sin cliente'}
                                {jornada.turno ? ` · Turno ${jornada.turno}` : ''}
                            </Text>

                            <View style={s.hero}>
                                <Text style={s.heroLabel}>En curso</Text>
                                <Text style={s.heroValue}>{duracionTx}</Text>
                                <Text style={s.heroSub}>
                                    Inicio {fmtHora(jornada.inicio_real_at)}
                                </Text>
                            </View>

                            <View style={s.metricRow}>
                                <MetricTile
                                    label="Declaradas"
                                    value={jornada.paradas_declaradas != null ? String(jornada.paradas_declaradas) : '—'}
                                />
                                <MetricTile
                                    label="Detectadas"
                                    value={String(jornada.paradas_detectadas ?? 0)}
                                />
                                <MetricTile
                                    label="Zona"
                                    value={jornada.distrito ?? '—'}
                                    big={false}
                                />
                            </View>

                            {movimiento && (
                                <View style={[s.movementBox, { backgroundColor: movimiento.bg }]}>
                                    <View style={[s.movementDot, { backgroundColor: movimiento.dot }]} />
                                    <Text style={[s.movementTx, { color: movimiento.fg }]} numberOfLines={1}>
                                        {movimiento.label}
                                    </Text>
                                </View>
                            )}

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

                            <Text style={s.sectionTitle}>Paradas detectadas</Text>
                            {paradasList.length === 0 ? (
                                <View style={s.timelineEmpty}>
                                    <Text style={s.timelineEmptyTx}>
                                        Las paradas aparecerán aquí cuando el GPS las detecte.
                                    </Text>
                                </View>
                            ) : (
                                <View style={s.timeline}>
                                    {paradasList.map((p, i) => {
                                        const esUltimo = i === paradasList.length - 1;
                                        const cerrada = !!p.cerrada_at;
                                        const zonaP = p.distrito_aprox || p.direccion_aprox || 'Parada';
                                        const dur = p.duracion_min != null ? `${p.duracion_min}m` : '—';
                                        return (
                                            <View key={p.id} style={s.timelineRow}>
                                                <View style={s.timelineDotCol}>
                                                    <View style={[
                                                        s.timelineDot,
                                                        cerrada ? s.timelineDotDone : s.timelineDotActive,
                                                    ]} />
                                                    {!esUltimo && <View style={s.timelineLine} />}
                                                </View>
                                                <View style={s.timelineBody}>
                                                    <Text style={s.timelineZona} numberOfLines={1}>{zonaP}</Text>
                                                    <Text style={s.timelineMeta}>
                                                        {fmtHora(p.inicio_at)} · {dur}
                                                    </Text>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </>
                    ) : null}

                </BottomSheetScrollView>
            </BottomSheet>

            {/* Modal paradas (reusado) */}
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
 * NOTA deuda — campos opcionales del backend driver:
 *   · `distrito` (jornada.distrito_nombre) → fila Zona.
 *   · `paradas_detectadas_list` → timeline ACTIVA.
 * Admin `/api/v3/jornadas/activas` ya los expone; portar al endpoint del
 * driver (`/api/driver/servicios`) para habilitar la vista completa.
 */

const s = StyleSheet.create({
    scrollContent: { padding: 16, paddingBottom: 120 },
    emptyScroll: { padding: 24, alignItems: 'center' },
    emptyTx: { color: '#6B7280', fontSize: 14 },

    eyebrowRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 4,
    },
    eyebrow: {
        fontSize: 11, fontWeight: '700', color: '#737f90',
        letterSpacing: 0.6, textTransform: 'uppercase',
    },
    chipZuri: {
        backgroundColor: '#eaeffc', borderRadius: 999,
        paddingHorizontal: 10, paddingVertical: 4,
    },
    chipZuriTx: {
        fontSize: 10, fontWeight: '800', color: '#2f54eb', letterSpacing: 0.8,
    },
    turnoTitle: {
        fontSize: 22, fontWeight: '800', color: '#0e1726',
        letterSpacing: -0.3, marginBottom: 14,
    },

    // ── Tarjeta de jornada ────────────────────────────────────────────
    jornadaCard: {
        backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1,
        borderColor: '#eef1f7', marginBottom: 14, overflow: 'hidden',
        shadowColor: '#0e1726', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    jornadaCardHead: {
        paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10,
        borderBottomWidth: 1, borderBottomColor: '#f1f4f9',
    },
    clienteBadge: {
        alignSelf: 'flex-start', backgroundColor: '#0e1726',
        borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6,
    },
    clienteBadgeTx: {
        fontSize: 10, fontWeight: '800', color: '#ffffff', letterSpacing: 0.8,
    },
    jornadaSub: { fontSize: 13, fontWeight: '600', color: '#3a4656' },
    jornadaCardBody: { paddingHorizontal: 14, paddingVertical: 4 },
    jrnRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
    jrnRowIcon: { fontSize: 17, width: 24, textAlign: 'center' },
    jrnRowLabel: {
        fontSize: 11, fontWeight: '700', color: '#737f90',
        letterSpacing: 0.4, textTransform: 'uppercase',
    },
    jrnRowValue: {
        fontSize: 15, fontWeight: '700', color: '#0e1726',
        marginTop: 1, fontVariant: ['tabular-nums'],
    },
    jrnSep: { height: 1, backgroundColor: '#f1f4f9' },

    hintBox: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        padding: 12, borderRadius: 12, backgroundColor: '#e6f6ee', marginBottom: 10,
    },
    hintDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#0f9d63' },
    hintTx: { fontSize: 13, fontWeight: '600', color: '#065f46', flex: 1 },

    banner: {
        backgroundColor: '#FEF3C7', borderLeftWidth: 3, borderLeftColor: '#F59E0B',
        padding: 10, borderRadius: 6, marginBottom: 12,
    },
    bannerTx: { fontSize: 13, fontWeight: '700', color: '#92400E' },

    // ── ACTIVA — hero + métricas + movimiento + timeline ─────────────
    hero: {
        backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1,
        borderColor: '#eef1f7', paddingVertical: 18, paddingHorizontal: 20,
        marginBottom: 10, alignItems: 'flex-start',
        shadowColor: '#0e1726', shadowOpacity: 0.04, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    heroLabel: {
        fontSize: 11, fontWeight: '700', color: '#737f90',
        letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4,
    },
    heroValue: {
        fontSize: 44, fontWeight: '800', color: '#0e1726',
        letterSpacing: -1, lineHeight: 48, fontVariant: ['tabular-nums'],
    },
    heroSub: {
        fontSize: 13, fontWeight: '600', color: '#737f90',
        marginTop: 4, fontVariant: ['tabular-nums'],
    },
    metricRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    metricCard: {
        flex: 1, backgroundColor: '#ffffff', borderRadius: 15,
        borderWidth: 1, borderColor: '#eef1f7',
        paddingVertical: 12, paddingHorizontal: 12,
    },
    metricCardLabel: {
        fontSize: 10, fontWeight: '700', color: '#737f90',
        letterSpacing: 0.5, textTransform: 'uppercase',
    },
    metricCardValueBig: {
        fontSize: 24, fontWeight: '800', color: '#0e1726',
        marginTop: 4, fontVariant: ['tabular-nums'],
    },
    metricCardValueSmall: {
        fontSize: 14, fontWeight: '700', color: '#0e1726', marginTop: 4,
    },
    movementBox: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 12, paddingHorizontal: 14,
        borderRadius: 12, marginBottom: 14,
    },
    movementDot: { width: 10, height: 10, borderRadius: 5 },
    movementTx: { fontSize: 14, fontWeight: '700', flex: 1 },
    sectionTitle: {
        fontSize: 12, fontWeight: '800', color: '#737f90',
        letterSpacing: 0.6, textTransform: 'uppercase',
        marginTop: 4, marginBottom: 8,
    },
    timelineEmpty: {
        padding: 16, borderRadius: 12, backgroundColor: '#f6f8fb',
        borderWidth: 1, borderColor: '#eef1f7', borderStyle: 'dashed' as any,
    },
    timelineEmptyTx: {
        fontSize: 13, color: '#737f90', textAlign: 'center', lineHeight: 18,
    },
    timeline: { marginTop: 2 },
    timelineRow: { flexDirection: 'row', gap: 10 },
    timelineDotCol: { width: 20, alignItems: 'center' },
    timelineDot: {
        width: 12, height: 12, borderRadius: 6, marginTop: 4,
        borderWidth: 2, borderColor: '#ffffff',
    },
    timelineDotDone: { backgroundColor: '#0f9d63' },
    timelineDotActive: { backgroundColor: '#2f54eb' },
    timelineLine: {
        flex: 1, width: 2, backgroundColor: '#eef1f7',
        marginTop: 2, marginBottom: 2,
    },
    timelineBody: { flex: 1, paddingBottom: 14 },
    timelineZona: { fontSize: 14, fontWeight: '700', color: '#0e1726' },
    timelineMeta: {
        fontSize: 12, fontWeight: '600', color: '#737f90',
        marginTop: 2, fontVariant: ['tabular-nums'],
    },

    // ── PASO 1.D — RESUMEN ──────────────────────────────────────────
    successBlock: {
        alignItems: 'center', paddingTop: 8, paddingBottom: 16,
    },
    checkCircle: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: '#e6f6ee',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
        borderWidth: 2, borderColor: '#0f9d63',
    },
    checkCircleTx: {
        fontSize: 32, fontWeight: '800', color: '#0f9d63',
        lineHeight: 36,
    },
    successTitle: {
        fontSize: 20, fontWeight: '800', color: '#0e1726',
        letterSpacing: -0.3,
    },
    successSub: {
        fontSize: 14, fontWeight: '600', color: '#3a4656',
        marginTop: 6, textAlign: 'center',
    },
    successFecha: {
        fontSize: 12, fontWeight: '600', color: '#737f90',
        marginTop: 2, textTransform: 'capitalize',
    },
    resumenGrid: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 10,
        marginTop: 4,
    },
    resumenTile: {
        flexBasis: '48%', flexGrow: 1,
        backgroundColor: '#ffffff', borderRadius: 15,
        borderWidth: 1, borderColor: '#eef1f7',
        paddingVertical: 14, paddingHorizontal: 14,
    },
    resumenLabel: {
        fontSize: 10, fontWeight: '700', color: '#737f90',
        letterSpacing: 0.5, textTransform: 'uppercase',
    },
    resumenValue: {
        fontSize: 22, fontWeight: '800', color: '#0e1726',
        marginTop: 4, fontVariant: ['tabular-nums'],
    },
    resumenHint: {
        fontSize: 12, fontWeight: '600', color: '#737f90',
        textAlign: 'center', marginTop: 14,
    },

    // ── Footer anclado (CTA) ────────────────────────────────────────
    footer: {
        paddingHorizontal: 16, paddingTop: 10, backgroundColor: '#fff',
    },
    btn: {
        paddingVertical: 16, borderRadius: 16, alignItems: 'center',
        shadowColor: '#0e1726', shadowOpacity: 0.08, shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 }, elevation: 2,
    },
    btnPrimary: { backgroundColor: '#0f9d63' },   // iniciar
    btnDanger:  { backgroundColor: '#e04646' },   // finalizar
    btnBrand:   { backgroundColor: '#2f54eb' },   // listo (resumen)
    btnDisabled: { opacity: 0.6 },
    btnTx: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

    // ── Modal paradas ──────────────────────────────────────────────
    modalBg: {
        flex: 1, backgroundColor: 'rgba(15,23,42,0.55)',
        alignItems: 'center', justifyContent: 'center', padding: 24,
    },
    modalCard: {
        width: '100%', maxWidth: 360, backgroundColor: '#fff',
        borderRadius: 14, padding: 20,
    },
    modalTitle: { fontSize: 16, fontWeight: '800', color: '#0B1F3A' },
    modalHint: { fontSize: 12, color: '#6B7280', marginTop: 4, marginBottom: 12 },
    modalInput: {
        borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8,
        padding: 12, fontSize: 16, marginBottom: 16,
    },
    modalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    modalBtnGhost: { backgroundColor: 'transparent' },
    modalBtnPrimary: { backgroundColor: '#0f9d63' },
    modalBtnGhostTx: { color: '#6B7280', fontWeight: '700' },
    modalBtnPrimaryTx: { color: '#fff', fontWeight: '800' },
});
