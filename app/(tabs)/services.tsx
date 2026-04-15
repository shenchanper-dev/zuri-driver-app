/**
 * ZURI Driver App - Services Screen
 * Flujo completo bidireccional: asignación → aceptar/rechazar → estados del viaje
 * Para APK nativo Android (EAS Build)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Vibration,
    Modal,
    ScrollView,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { driverApi } from '@/services/api';
import { socket } from '@/services/socket';
import { showServiceAssignedNotification, requestNotificationPermissions } from '@/services/notifications';

// ============================================================================
// TIPOS
// ============================================================================

interface Service {
    id: number;
    codigo: string;
    estado: string;
    fuente: 'SERVICIO' | 'PROGRAMACION'; // tabla de origen
    tipoServicio: string;
    prioridad: string;
    fechaHora: string;
    tiempoEstimado: number | null;
    distanciaEstimada: number | null;
    // Para programaciones
    doctor_nombre?: string;
    turno?: string;
    hora_inicio?: string;
    hora_fin?: string;
    paciente: {
        nombre: string;
        telefono?: string;
        observaciones?: string;
    };
    origen: { direccion: string; latitud: number; longitud: number; referencia?: string };
    destino: { direccion: string; latitud: number; longitud: number; referencia?: string };
    clinica: { nombre: string; telefono?: string };
    timestamps?: {
        asignado?: string;
        aceptado?: string;
        iniciado?: string;
        finalizado?: string;
    };
}

// Asignación de programacion_detalle (diferente estructura)
interface ProgramacionAsignada {
    id: number;
    tipo: 'programacion_detalle';
    codigo: string;
    doctor: string;
    cliente: string;
    turno: string;
    horaInicio: string;
    horaFin: string;
    fecha: string;
    ubicacion: string;
    distrito: string;
    prioridad: string;
}

type TabType = 'pendientes' | 'activos' | 'historial';

// ============================================================================
// CONSTANTES
// ============================================================================

const COUNTDOWN_SEGUNDOS = 30;

const ESTADOS_PENDIENTE = ['ASIGNADO'];
const ESTADOS_ACTIVO = ['ACEPTADO', 'EN_CAMINO', 'EN_ORIGEN', 'EN_TRANSPORTE', 'EN_DESTINO'];
const ESTADOS_HISTORIAL = ['COMPLETADO', 'CANCELADO', 'INCIDENTE'];

const ESTADO_LABEL: Record<string, string> = {
    ASIGNADO: '🔔 Pendiente',
    ACEPTADO: '✅ Aceptado',
    EN_CAMINO: '🚗 En camino',
    EN_ORIGEN: '📍 En origen',
    EN_TRANSPORTE: '👨‍⚕️ Paciente abordo',
    EN_DESTINO: '🏁 En destino',
    COMPLETADO: '✅ Completado',
    CANCELADO: '❌ Cancelado',
    INCIDENTE: '⚠️ Incidente',
};

// Uber Health palette
const COLORS = {
    primary: '#00A878',
    primaryDark: '#007A58',
    surface: '#FFFFFF',
    surfaceAlt: '#F8FAFB',
    border: '#E8EDF2',
    textPrimary: '#1A2332',
    textSecondary: '#6B7A8D',
    shadow: 'rgba(0,0,0,0.08)',
};

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
    ASIGNADO:      { bg: '#FFF8E7', text: '#92400E' },
    ACEPTADO:      { bg: '#F0FDF4', text: '#15803D' },
    EN_CAMINO:     { bg: '#EFF6FF', text: '#1D4ED8' },
    EN_ORIGEN:     { bg: '#FFF7ED', text: '#C2410C' },
    EN_TRANSPORTE: { bg: '#F5F3FF', text: '#6D28D9' },
    EN_DESTINO:    { bg: '#ECFDF5', text: '#065F46' },
    COMPLETADO:    { bg: '#F0FDF4', text: '#166534' },
    CANCELADO:     { bg: '#FEF2F2', text: '#DC2626' },
    INCIDENTE:     { bg: '#FEF2F2', text: '#DC2626' },
};

const ESTADO_COLOR: Record<string, string> = {
    ASIGNADO: '#F59E0B',
    ACEPTADO: '#10B981',
    EN_CAMINO: '#3B82F6',
    EN_ORIGEN: '#F97316',
    EN_TRANSPORTE: '#8B5CF6',
    EN_DESTINO: '#059669',
    COMPLETADO: '#059669',
    CANCELADO: '#EF4444',
    INCIDENTE: '#DC2626',
};

const SIGUIENTE_ESTADO: Record<string, { label: string; estado: string; icon: string }> = {
    ACEPTADO: { label: 'Iniciar viaje', estado: 'EN_CAMINO', icon: 'navigate' },
    EN_CAMINO: { label: 'Llegué al origen', estado: 'EN_ORIGEN', icon: 'location' },
    EN_ORIGEN: { label: 'Paciente abordo', estado: 'EN_TRANSPORTE', icon: 'person-add' },
    EN_TRANSPORTE: { label: 'Llegué al destino', estado: 'EN_DESTINO', icon: 'flag' },
    EN_DESTINO: { label: 'Completar servicio', estado: 'COMPLETADO', icon: 'checkmark-circle' },
};

const PASOS_VIAJE = [
    { estado: 'ACEPTADO', label: 'Aceptado' },
    { estado: 'EN_CAMINO', label: 'En camino' },
    { estado: 'EN_ORIGEN', label: 'En origen' },
    { estado: 'EN_TRANSPORTE', label: 'Abordo' },
    { estado: 'EN_DESTINO', label: 'En destino' },
    { estado: 'COMPLETADO', label: 'Completado' },
];

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function ServicesScreen() {
    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('pendientes');

    // Notificación de nueva asignación (programacion_detalle)
    const [nuevaAsignacion, setNuevaAsignacion] = useState<ProgramacionAsignada | null>(null);
    const [showModalAsignacion, setShowModalAsignacion] = useState(false);
    const [countdown, setCountdown] = useState(COUNTDOWN_SEGUNDOS);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Nagging interval: reaparece cada 3 min si conductor no acepta
    const nagIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Cargar servicios ────────────────────────────────────────────────────
    const loadServices = useCallback(async () => {
        try {
            const response = await driverApi.getServices({ estado: 'all' });
            if (response.success) {
                setServices(response.servicios || []);
            }
        } catch (e) {
            console.error('[Services] loadServices error:', e);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    }, []);

    // ── Countdown para nueva asignación ────────────────────────────────────
    const iniciarCountdown = useCallback(() => {
        setCountdown(COUNTDOWN_SEGUNDOS);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    // NO rechazar — solo cerrar el modal; nagging lo reabrirá en 3 min
                    setShowModalAsignacion(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const limpiarCountdown = useCallback(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    }, []);

    // ── Nagging: reabre el modal cada 3 min con vibración ──────────────────
    const clearNagging = useCallback(() => {
        if (nagIntervalRef.current) {
            clearInterval(nagIntervalRef.current);
            nagIntervalRef.current = null;
        }
    }, []);

    const startNagging = useCallback((asignacion: ProgramacionAsignada) => {
        clearNagging();
        nagIntervalRef.current = setInterval(() => {
            Vibration.vibrate([0, 400, 200, 400, 200, 400]);
            setNuevaAsignacion(asignacion);
            setShowModalAsignacion(true);
            iniciarCountdown();
        }, 3 * 60 * 1000); // 3 minutos
    }, [clearNagging, iniciarCountdown]);

    // ── Socket events ───────────────────────────────────────────────────────
    useEffect(() => {
        requestNotificationPermissions();
        loadServices();

        socket.on('service:assigned', (data: any) => {
            console.log('📋 [Socket] service:assigned:', data);
            Vibration.vibrate([0, 500, 200, 500, 200, 500]);

            // Si viene de programacion_detalle
            if (data.tipo === 'programacion_detalle') {
                const asignacion = data as ProgramacionAsignada;
                setNuevaAsignacion(asignacion);
                setShowModalAsignacion(true);
                setActiveTab('pendientes');
                iniciarCountdown();
                startNagging(asignacion);
            } else {
                // Servicio clásico (tabla servicios)
                loadServices();
                if (data.paciente?.nombre) {
                    showServiceAssignedNotification({
                        codigo: data.codigo || 'Nuevo Servicio',
                        pacienteNombre: data.paciente.nombre,
                        origenDireccion: data.origen?.direccion || 'Ver detalles',
                    });
                }
            }
        });

        socket.on('service:updated', () => {
            loadServices();
        });

        return () => {
            socket.off('service:assigned');
            socket.off('service:updated');
            limpiarCountdown();
            clearNagging();
        };
    }, [loadServices, iniciarCountdown, limpiarCountdown, startNagging, clearNagging]);

    // ── Filtros por tab ─────────────────────────────────────────────────────
    const serviciosFiltrados = services.filter(s => {
        if (activeTab === 'pendientes') return ESTADOS_PENDIENTE.includes(s.estado);
        if (activeTab === 'activos') return ESTADOS_ACTIVO.includes(s.estado);
        return ESTADOS_HISTORIAL.includes(s.estado);
    });

    const countPendientes = services.filter(s => ESTADOS_PENDIENTE.includes(s.estado)).length
        + (nuevaAsignacion ? 1 : 0);
    const countActivos = services.filter(s => ESTADOS_ACTIVO.includes(s.estado)).length;

    // ── Acciones servicios clásicos ─────────────────────────────────────────
    const handleAceptar = async (service: Service) => {
        Alert.alert(
            'Aceptar Servicio',
            `¿Aceptar servicio para ${service.paciente.nombre}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Aceptar ✅',
                    onPress: async () => {
                        const res = await driverApi.acceptService(service.id);
                        if (res.success) {
                            loadServices();
                            setActiveTab('activos');
                        } else {
                            Alert.alert('Error', res.error || 'No se pudo aceptar');
                        }
                    },
                },
            ]
        );
    };

    const handleRechazar = (service: Service) => {
        Alert.alert(
            'Rechazar Servicio',
            'Selecciona el motivo:',
            [
                { text: 'Fuera de zona', onPress: () => doRechazar(service, 'Fuera de zona') },
                { text: 'Vehículo con falla', onPress: () => doRechazar(service, 'Vehículo con falla') },
                { text: 'Otro motivo', onPress: () => doRechazar(service, 'Otro') },
                { text: 'Cancelar', style: 'cancel' },
            ]
        );
    };

    const doRechazar = async (service: Service, motivo: string) => {
        const res = await driverApi.rejectService(service.id, motivo);
        if (res.success) {
            loadServices();
        } else {
            Alert.alert('Error', res.error || 'No se pudo rechazar');
        }
    };

    const handleAvanzarEstado = async (service: Service) => {
        const siguiente = SIGUIENTE_ESTADO[service.estado];
        if (!siguiente) return;

        // Mapear estado BD → accion para programacion_detalles
        const accionProgramacion: Record<string, 'EN_CAMINO' | 'EN_ORIGEN' | 'EN_TRANSPORTE' | 'EN_DESTINO' | 'COMPLETAR'> = {
            EN_CAMINO: 'EN_CAMINO',
            EN_ORIGEN: 'EN_ORIGEN',
            EN_TRANSPORTE: 'EN_TRANSPORTE',
            EN_DESTINO: 'EN_DESTINO',
            COMPLETADO: 'COMPLETAR',
        };

        Alert.alert(
            siguiente.label,
            `¿Confirmar: "${siguiente.label}"?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Confirmar',
                    onPress: async () => {
                        let res: any;
                        if (service.fuente === 'PROGRAMACION') {
                            const accion = accionProgramacion[siguiente.estado];
                            if (!accion) return;
                            res = await driverApi.avanzarProgramacion(service.id, accion);
                        } else {
                            res = await driverApi.updateServiceStatus(service.id, siguiente.estado);
                        }
                        if (res.success) {
                            loadServices();
                            if (siguiente.estado === 'COMPLETADO') setActiveTab('historial');
                        } else {
                            Alert.alert('Error', res.error || 'No se pudo actualizar');
                        }
                    },
                },
            ]
        );
    };

    // ── Acciones programacion_detalle ───────────────────────────────────────
    const handleAceptarProgramacion = async () => {
        if (!nuevaAsignacion) return;
        limpiarCountdown();
        clearNagging();
        const res = await driverApi.responderProgramacion(nuevaAsignacion.id, 'ACEPTAR');
        if (res.success) {
            Alert.alert('✅ Aceptado', `Servicio aceptado: ${nuevaAsignacion.doctor}`);
            setNuevaAsignacion(null);
            setShowModalAsignacion(false);
            loadServices();
        } else {
            Alert.alert('Error', res.error || 'No se pudo aceptar');
        }
    };

    // ── Render: modal de nueva asignación (programacion_detalle) ───────────
    const renderNuevaAsignacion = () => {
        if (!nuevaAsignacion || !showModalAsignacion) return null;
        const segundos = String(countdown % 60).padStart(2, '0');
        const minutos = String(Math.floor(countdown / 60)).padStart(2, '0');
        const urgente = countdown <= 10;

        return (
            <Modal visible transparent animationType="slide" statusBarTranslucent>
                <View style={styles.modalOverlay}>
                    <View style={styles.asignacionCard}>
                        {/* Header */}
                        <View style={styles.asignacionHeader}>
                            <Text style={styles.asignacionTitleLabel}>🔔 NUEVO SERVICIO ASIGNADO</Text>
                        </View>

                        {/* Info */}
                        <View style={styles.asignacionBody}>
                            <InfoRow icon="person" text={`Dr. ${nuevaAsignacion.doctor}`} bold />
                            <InfoRow icon="business" text={nuevaAsignacion.cliente || '—'} />
                            {nuevaAsignacion.turno ? (
                                <InfoRow icon="time" text={`${nuevaAsignacion.turno}: ${nuevaAsignacion.horaInicio?.slice(0, 5)} — ${nuevaAsignacion.horaFin?.slice(0, 5)}`} />
                            ) : (
                                <InfoRow icon="time" text={`${nuevaAsignacion.horaInicio?.slice(0, 5)} — ${nuevaAsignacion.horaFin?.slice(0, 5)}`} />
                            )}
                            {nuevaAsignacion.distrito ? (
                                <InfoRow icon="location" text={nuevaAsignacion.distrito} />
                            ) : null}
                            {nuevaAsignacion.ubicacion ? (
                                <InfoRow icon="map" text={nuevaAsignacion.ubicacion} />
                            ) : null}
                            {nuevaAsignacion.codigo ? (
                                <InfoRow icon="document" text={nuevaAsignacion.codigo} />
                            ) : null}
                        </View>

                        {/* Countdown */}
                        <View style={[styles.countdownRow, urgente && styles.countdownUrgente]}>
                            <Ionicons name="timer-outline" size={18} color={urgente ? '#DC2626' : '#F59E0B'} />
                            <Text style={[styles.countdownText, urgente && styles.countdownUrgenteText]}>
                                {' '}Responder en: {minutos}:{segundos}
                            </Text>
                        </View>

                        {/* Nota: sin botón de rechazo — el servicio reaparecerá cada 3 min */}
                        <Text style={styles.nagHint}>El servicio volverá a notificarte si no aceptas</Text>

                        {/* Botón ACEPTAR (único) */}
                        <View style={styles.asignacionBotones}>
                            <TouchableOpacity
                                style={[styles.btnAccion, styles.btnAceptar]}
                                onPress={handleAceptarProgramacion}
                            >
                                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                                <Text style={styles.btnAceptarText}>ACEPTAR SERVICIO</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
    };

    // ── Render: tarjeta de servicio clásico ────────────────────────────────
    const renderService = ({ item }: { item: Service }) => {
        const siguiente = SIGUIENTE_ESTADO[item.estado];
        const esPendiente = item.estado === 'ASIGNADO';
        const estadoActualIdx = PASOS_VIAJE.findIndex(p => p.estado === item.estado);

        const statusCfg = STATUS_CONFIG[item.estado] || { bg: '#F3F4F6', text: '#374151' };
        const accentColor = item.estado === 'ASIGNADO' ? '#F59E0B'
            : ESTADOS_ACTIVO.includes(item.estado) ? COLORS.primary
            : '#E5E7EB';

        return (
            <View style={[styles.serviceCard, { borderLeftColor: accentColor }]}>
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <Text style={[styles.statusText, { color: statusCfg.text }]}>{ESTADO_LABEL[item.estado] || item.estado}</Text>
                    </View>
                    <Text style={styles.serviceCode}>{item.codigo}</Text>
                </View>

                {/* Médico / Paciente */}
                <View style={styles.patientRow}>
                    <Ionicons name={item.fuente === 'PROGRAMACION' ? 'medkit' : 'person'} size={20} color="#333" />
                    <View style={styles.patientInfo}>
                        <Text style={styles.patientName}>{item.paciente.nombre}</Text>
                        {item.fuente === 'PROGRAMACION' && item.hora_inicio && (
                            <Text style={styles.patientPhone}>
                                {item.turno ? `Turno ${item.turno} · ` : ''}{item.hora_inicio} — {item.hora_fin}
                            </Text>
                        )}
                        {item.paciente.telefono && (
                            <Text style={styles.patientPhone}>{item.paciente.telefono}</Text>
                        )}
                        {item.paciente.observaciones ? (
                            <Text style={styles.patientObs} numberOfLines={1}>
                                ⚠️ {item.paciente.observaciones}
                            </Text>
                        ) : null}
                    </View>
                    {item.fuente === 'PROGRAMACION' && (
                        <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            <Text style={{ fontSize: 10, color: '#1D4ED8', fontWeight: '700' }}>PROG</Text>
                        </View>
                    )}
                </View>

                {/* Direcciones */}
                <View style={styles.addressSection}>
                    <View style={styles.addressRow}>
                        <View style={styles.addressDot} />
                        <Text style={styles.addressText} numberOfLines={2}>{item.origen.direccion}</Text>
                    </View>
                    <View style={styles.addressLine} />
                    <View style={styles.addressRow}>
                        <View style={[styles.addressDot, styles.destinationDot]} />
                        <Text style={styles.addressText} numberOfLines={2}>{item.destino.direccion}</Text>
                    </View>
                </View>

                {/* Meta */}
                <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                        <Ionicons name="time-outline" size={15} color="#666" />
                        <Text style={styles.metaText}>{item.tiempoEstimado || '--'} min</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="navigate-outline" size={15} color="#666" />
                        <Text style={styles.metaText}>{item.distanciaEstimada?.toFixed(1) || '--'} km</Text>
                    </View>
                    <View style={styles.metaItem}>
                        <Ionicons name="medical-outline" size={15} color="#666" />
                        <Text style={styles.metaText} numberOfLines={1}>{item.clinica.nombre}</Text>
                    </View>
                </View>

                {/* Progreso del viaje (solo activos) */}
                {ESTADOS_ACTIVO.includes(item.estado) && (
                    <View style={styles.progresoContainer}>
                        {PASOS_VIAJE.map((paso, idx) => {
                            const completado = idx < estadoActualIdx;
                            const actual = idx === estadoActualIdx;
                            return (
                                <View key={paso.estado} style={styles.pasoRow}>
                                    <View style={[
                                        styles.pasoDot,
                                        completado && styles.pasoDotCompletado,
                                        actual && styles.pasoDotActual,
                                    ]}>
                                        {completado && <Ionicons name="checkmark" size={10} color="#fff" />}
                                    </View>
                                    <Text style={[
                                        styles.pasoLabel,
                                        actual && styles.pasoLabelActual,
                                        completado && styles.pasoLabelCompletado,
                                    ]}>
                                        {paso.label}
                                    </Text>
                                </View>
                            );
                        })}
                    </View>
                )}

                {/* Acciones */}
                {esPendiente && (
                    <View style={styles.actionsRow}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.rejectButton]}
                            onPress={() => handleRechazar(item)}
                        >
                            <Ionicons name="close" size={18} color="#EF4444" />
                            <Text style={styles.rejectText}>Rechazar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.acceptButton]}
                            onPress={() => handleAceptar(item)}
                        >
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.acceptText}>Aceptar</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {siguiente && !esPendiente && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.primaryButton, { marginTop: 8 }]}
                        onPress={() => handleAvanzarEstado(item)}
                    >
                        <Ionicons name={siguiente.icon as any} size={18} color="#fff" />
                        <Text style={styles.primaryText}>{siguiente.label}</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    // ── Render principal ─────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            {/* Tabs */}
            <View style={styles.tabs}>
                <TabBtn
                    label="📋 PENDIENTES"
                    badge={countPendientes}
                    active={activeTab === 'pendientes'}
                    onPress={() => setActiveTab('pendientes')}
                />
                <TabBtn
                    label="🚗 ACTIVOS"
                    badge={countActivos}
                    active={activeTab === 'activos'}
                    onPress={() => setActiveTab('activos')}
                />
                <TabBtn
                    label="✅ HISTORIAL"
                    active={activeTab === 'historial'}
                    onPress={() => setActiveTab('historial')}
                />
            </View>

            {/* Lista */}
            {isLoading ? (
                <ActivityIndicator size="large" color="#0066CC" style={styles.loader} />
            ) : (
                <FlatList
                    data={serviciosFiltrados}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderService}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={() => { setRefreshing(true); loadServices(); }}
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Ionicons name="document-outline" size={64} color="#ccc" />
                            <Text style={styles.emptyText}>
                                {activeTab === 'pendientes' ? 'Sin servicios pendientes' :
                                    activeTab === 'activos' ? 'Sin servicios activos' :
                                        'Sin historial'}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* Modal nueva asignación */}
            {renderNuevaAsignacion()}
        </View>
    );
}

// ── Componente auxiliar: botón de tab ──────────────────────────────────────
function TabBtn({ label, badge, active, onPress }: {
    label: string; badge?: number; active: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            style={[styles.tab, active && styles.tabActive]}
            onPress={onPress}
        >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            {badge != null && badge > 0 && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>{badge}</Text>
                </View>
            )}
        </TouchableOpacity>
    );
}

// ── Componente auxiliar: fila de info ──────────────────────────────────────
function InfoRow({ icon, text, bold }: { icon: string; text: string; bold?: boolean }) {
    return (
        <View style={styles.infoRow}>
            <Ionicons name={icon as any} size={16} color="#475569" />
            <Text style={[styles.infoText, bold && styles.infoTextBold]} numberOfLines={2}>{text}</Text>
        </View>
    );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f7fa' },

    // Tabs
    tabs: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
        paddingHorizontal: 4,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        gap: 4,
    },
    tabActive: { borderBottomWidth: 2, borderBottomColor: '#00A878' },
    tabText: { fontSize: 11, color: '#9ca3af', fontWeight: '600', textAlign: 'center' },
    tabTextActive: { color: '#00A878' },
    badge: {
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

    loader: { marginTop: 40 },
    listContent: { padding: 12, paddingBottom: 100 },

    // Service card
    serviceCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 8,
        elevation: 3,
        borderLeftWidth: 4,
        borderLeftColor: '#E5E7EB',
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    statusText: { fontSize: 11, fontWeight: '700' },
    serviceCode: { fontSize: 11, color: '#9ca3af', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

    patientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
    patientInfo: { flex: 1 },
    patientName: { fontSize: 17, fontWeight: '700', color: '#1A2332' },
    patientPhone: { fontSize: 13, color: '#6b7280', marginTop: 2 },
    patientObs: { fontSize: 12, color: '#F59E0B', marginTop: 2 },

    addressSection: { marginBottom: 10, paddingLeft: 4 },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    addressDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#9ca3af', marginTop: 5 },
    destinationDot: { backgroundColor: '#00A878' },
    addressLine: { width: 2, height: 18, backgroundColor: '#e5e7eb', marginLeft: 4, marginVertical: 2 },
    addressText: { flex: 1, fontSize: 13, color: '#4b5563', lineHeight: 18 },

    metaRow: { flexDirection: 'row', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginBottom: 10 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
    metaText: { fontSize: 12, color: '#6b7280' },

    // Progreso del viaje
    progresoContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'nowrap' },
    pasoRow: { alignItems: 'center', flex: 1 },
    pasoDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    pasoDotCompletado: { backgroundColor: '#10B981' },
    pasoDotActual: { backgroundColor: '#00A878', borderWidth: 2, borderColor: '#6EE7B7' },
    pasoLabel: { fontSize: 9, color: '#9ca3af', textAlign: 'center' },
    pasoLabelActual: { color: '#00A878', fontWeight: '700' },
    pasoLabelCompletado: { color: '#10B981' },

    // Acciones
    actionsRow: { flexDirection: 'row', gap: 10 },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 11,
        borderRadius: 12,
    },
    rejectButton: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
    rejectText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
    acceptButton: { backgroundColor: '#00A878' },
    acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    primaryButton: { backgroundColor: '#00A878' },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    // Empty state
    emptyState: { alignItems: 'center', paddingTop: 60 },
    emptyText: { fontSize: 15, color: '#9ca3af', marginTop: 16 },

    // Modal overlay
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'flex-end',
    },

    // Nueva asignación card
    asignacionCard: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
        paddingBottom: 32,
    },
    asignacionHeader: {
        backgroundColor: '#00A878',
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    asignacionTitleLabel: { color: '#fff', fontWeight: '800', fontSize: 16, letterSpacing: 0.5 },
    asignacionBody: { padding: 20, gap: 10 },
    countdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        marginHorizontal: 20,
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginBottom: 16,
    },
    countdownUrgente: {
        backgroundColor: '#FEF2F2',
        borderColor: '#FECACA',
    },
    countdownUrgenteText: { color: '#DC2626' },
    countdownText: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
    asignacionBotones: { flexDirection: 'row', gap: 14, paddingHorizontal: 20 },
    btnAccion: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    btnAceptar: { backgroundColor: '#00A878', flex: 1 },
    btnAceptarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    nagHint: {
        textAlign: 'center',
        fontSize: 12,
        color: '#9CA3AF',
        marginHorizontal: 20,
        marginBottom: 16,
        fontStyle: 'italic',
    },

    // Info rows (nueva asignación)
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    infoText: { flex: 1, fontSize: 14, color: '#374151', lineHeight: 20 },
    infoTextBold: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
});
