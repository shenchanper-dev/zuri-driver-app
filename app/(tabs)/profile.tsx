import React, { useState } from 'react';
import Constants from 'expo-constants';
/**
 * ZURI Driver App - Profile Screen
 */

import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Image,
    Alert,
    ActivityIndicator,
    Modal,
    Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { driverApi } from '@/services/api';
// Refactor tracking-nativo-auto: 'Terminar turno' llama a stopNativeTracking + logout
import { stopNativeTracking } from '@/services/nativeTracking';
import { socket } from '@/services/socket';
import { secureStorage, TOKEN_KEY } from '@/services/storage';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';

export default function ProfileScreen() {
    const router = useRouter();
    const { conductor, logout } = useAuthStore();
    const { isTracking } = useLocationStore();
    const [isToggling, setIsToggling] = useState(false);
    // BLOQUE 2 (2026-09-25): modal profesional post-finalizar-jornada
    const [modalVisible, setModalVisible] = useState(false);
    const [finalizacionHora, setFinalizacionHora] = useState('');
    const [finalizacionFecha, setFinalizacionFecha] = useState('');

    // BLOQUE 2 (2026-09-25): "Finalizar jornada" — Uber-like flow.
    // 1. Query servicios pendientes al server.
    // 2. Alert de confirmacion con warning si N>0.
    // 3. POST /api/v3/finalizar-jornada -> registra hora_fin_real + tipo_cierre.
    // 4. Modal profesional bloqueante.
    // 5. Al presionar Cerrar: stopNativeTracking + logout + navigate a login.
    const handleFinalizarJornada = async () => {
        if (isToggling) return;

        let serviciosPendientes = 0;
        try {
            const token = await secureStorage.getItem(TOKEN_KEY);
            const apiBase = process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api';
            const res = await fetch(`${apiBase}/v3/servicios-pendientes/${conductor?.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                serviciosPendientes = data?.count ?? 0;
            }
        } catch (err) {
            console.warn('[Profile] servicios-pendientes fetch failed:', err);
        }

        const alertMsg = serviciosPendientes > 0
            ? `⚠️ Tienes ${serviciosPendientes} servicio${serviciosPendientes === 1 ? '' : 's'} pendiente${serviciosPendientes === 1 ? '' : 's'}.\n\nConfirma que has terminado tu jornada de hoy.`
            : 'Confirma que has terminado tu jornada de hoy.';

        Alert.alert(
            '¿Finalizar tu jornada?',
            alertMsg,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sí, finalicé',
                    onPress: async () => {
                        setIsToggling(true);
                        try {
                            const token = await secureStorage.getItem(TOKEN_KEY);
                            const apiBase = process.env.EXPO_PUBLIC_API_URL || 'https://admin.zuri.pe/api';
                            const res = await fetch(`${apiBase}/v3/finalizar-jornada`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({
                                    conductor_id: conductor?.id,
                                    servicios_pendientes: serviciosPendientes,
                                }),
                            });
                            const data = await res.json();
                            if (!res.ok || !data?.success) {
                                Alert.alert('No se pudo finalizar', data?.error ?? 'Error desconocido.');
                                setIsToggling(false);
                                return;
                            }
                            const t = new Date(data.timestamp);
                            setFinalizacionHora(t.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }));
                            setFinalizacionFecha(t.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }));
                            setModalVisible(true);
                        } catch (err: any) {
                            Alert.alert('Error de red', String(err?.message ?? err));
                            setIsToggling(false);
                        }
                    },
                },
            ]
        );
    };

    // Modal Cerrar: stopNativeTracking + logout + navigate.
    const handleCerrarModal = async () => {
        try {
            await stopNativeTracking();
            try { await driverApi.updateProfile({ estadoServicio: 'DESCONECTADO' }); } catch {}
            socket.disconnect();
            await logout();
        } catch (e) {
            console.warn('[Profile] Error al cerrar tras finalizar:', e);
        } finally {
            setModalVisible(false);
            setIsToggling(false);
            router.replace('/(auth)/login');
        }
    };

    const handleLogout = () => {
        Alert.alert(
            'Cerrar Sesión',
            '¿Estás seguro de que deseas cerrar sesión?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cerrar Sesión',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // 1. Disconnect WebSocket
                            socket.disconnect();
                            // 2. Stop GPS tracking
                            // Refactor tracking-nativo-auto: logout de auth.ts ya llama stopNativeTracking
                            // 3. Clear auth store + token
                            await logout();
                            // 4. Clear web storage (PWA)
                            if (typeof window !== 'undefined') {
                                localStorage.clear();
                                sessionStorage.clear();
                            }
                        } catch (e) {
                            console.error('[Logout] Error:', e);
                        }
                        // 5. Always redirect to login
                        router.replace('/(auth)/login');
                    },
                },
            ]
        );
    };

    return (
        <>
        <ScrollView style={styles.container}>
            {/* Profile Header */}
            <View style={styles.header}>
                <View style={styles.avatarContainer}>
                    {conductor?.foto ? (
                        <Image source={{ uri: conductor.foto }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {conductor?.nombres?.charAt(0) || 'C'}
                                {conductor?.apellidos?.charAt(0) || ''}
                            </Text>
                        </View>
                    )}
                    <TouchableOpacity style={styles.editAvatarButton}>
                        <Ionicons name="camera" size={16} color="#fff" />
                    </TouchableOpacity>
                </View>

                <Text style={styles.name}>
                    {conductor?.nombreCompleto || `${conductor?.nombres} ${conductor?.apellidos}`}
                </Text>
                <Text style={styles.dni}>DNI: {conductor?.dni}</Text>

                <View style={styles.ratingContainer}>
                    <Ionicons name="star" size={20} color="#F59E0B" />
                    <Text style={styles.rating}>
                        {conductor?.metricas?.calificacion?.toFixed(1) || '--'}
                    </Text>
                    <Text style={styles.ratingSubtext}>
                        ({conductor?.metricas?.totalServicios || 0} servicios)
                    </Text>
                </View>
            </View>

            {/* Info Sections */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contacto</Text>
                <View style={styles.infoRow}>
                    <Ionicons name="call-outline" size={20} color="#666" />
                    <Text style={styles.infoText}>{conductor?.contacto?.celular1 || '--'}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Ionicons name="mail-outline" size={20} color="#666" />
                    <Text style={styles.infoText}>{conductor?.contacto?.email || '--'}</Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Licencia</Text>
                <View style={styles.infoRow}>
                    <Ionicons name="card-outline" size={20} color="#666" />
                    <Text style={styles.infoText}>
                        {conductor?.licencia?.numero || '--'} ({conductor?.licencia?.categoria || '--'})
                    </Text>
                </View>
                <View style={styles.infoRow}>
                    <Ionicons name="calendar-outline" size={20} color="#666" />
                    <Text style={styles.infoText}>
                        Vence: {conductor?.licencia?.vencimiento ?
                            new Date(conductor.licencia.vencimiento).toLocaleDateString('es-PE') : '--'}
                    </Text>
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Vehículo</Text>
                <View style={styles.vehicleCard}>
                    <Text style={styles.vehiclePlate}>{conductor?.vehiculo?.placa || '---'}</Text>
                    <Text style={styles.vehicleInfo}>
                        {conductor?.vehiculo?.marca} {conductor?.vehiculo?.modelo}
                    </Text>
                    <Text style={styles.vehicleColor}>
                        Color: {conductor?.vehiculo?.color || '--'}
                    </Text>
                </View>
            </View>

            {/* Settings */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Configuración</Text>

                <TouchableOpacity style={styles.menuItem}>
                    <Ionicons name="notifications-outline" size={24} color="#333" />
                    <Text style={styles.menuText}>Notificaciones</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                    <Ionicons name="finger-print-outline" size={24} color="#333" />
                    <Text style={styles.menuText}>Seguridad</Text>
                    <View style={styles.menuBadge}>
                        <Text style={styles.menuBadgeText}>
                            {conductor?.app?.biometriaEnabled ? 'Activo' : 'Inactivo'}
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                    <Ionicons name="help-circle-outline" size={24} color="#333" />
                    <Text style={styles.menuText}>Ayuda</Text>
                    <Ionicons name="chevron-forward" size={20} color="#ccc" />
                </TouchableOpacity>
            </View>

            {/* BLOQUE 2 (2026-09-25): boton Finalizar Jornada (verde) */}
            <TouchableOpacity
                style={[styles.connectionButton, styles.finalizarButton]}
                onPress={handleFinalizarJornada}
                disabled={isToggling}
                activeOpacity={0.85}
            >
                {isToggling ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <>
                        <Ionicons name="checkmark-circle" size={22} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={styles.finalizarButtonText}>Finalizar jornada</Text>
                    </>
                )}
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={24} color="#EF4444" />
                <Text style={styles.logoutText}>Cerrar Sesión</Text>
            </TouchableOpacity>

            {/* App Version */}
            <Text style={styles.version}>
                ZURI Conductor v{Constants.expoConfig?.version ?? '1.0.5'}
            </Text>
        </ScrollView>

        {/* BLOQUE 2 (2026-09-25): modal profesional post-finalizar-jornada. Bloqueante. */}
        <Modal
            visible={modalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => { /* no-op: bloqueante hasta Cerrar */ }}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalCard}>
                    <View style={styles.modalIconWrap}>
                        <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                    </View>
                    <Text style={styles.modalTitle}>Jornada finalizada</Text>
                    <Text style={styles.modalBody}>
                        Gracias por tu colaboración y cumplimiento de jornada.
                    </Text>
                    <Text style={styles.modalBody}>
                        Cualquier comunicación de parte de la administración
                        te la haremos saber lo más pronto posible.
                    </Text>
                    <Text style={styles.modalFooter}>
                        ZURI · {finalizacionFecha} · {finalizacionHora}
                    </Text>
                    <TouchableOpacity
                        style={styles.modalButton}
                        onPress={handleCerrarModal}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.modalButtonText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.bg,
    },
    header: {
        backgroundColor: COLORS.primary,
        paddingTop: 48,
        paddingBottom: 32,
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: '#fff',
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: '#fff',
    },
    avatarText: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#fff',
    },
    editAvatarButton: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginTop: 12,
    },
    dni: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4,
    },
    ratingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 12,
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: RADIUS.pill,
    },
    rating: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#fff',
    },
    ratingSubtext: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
    },
    section: {
        backgroundColor: COLORS.card,
        marginTop: 12,
        marginHorizontal: 16,
        borderRadius: RADIUS.md,
        paddingHorizontal: 16,
        paddingVertical: 16,
        ...SHADOW.card,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: COLORS.textMuted,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    infoText: {
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    vehicleCard: {
        backgroundColor: COLORS.bg,
        padding: 16,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
    },
    vehiclePlate: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.info,
        letterSpacing: 2,
    },
    vehicleInfo: {
        fontSize: 16,
        color: COLORS.textPrimary,
        marginTop: 4,
    },
    vehicleColor: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 4,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        gap: 12,
    },
    menuText: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    menuBadge: {
        backgroundColor: '#E6F0FF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: RADIUS.sm,
    },
    menuBadgeText: {
        fontSize: 12,
        color: COLORS.info,
    },
    connectionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 24,
        marginHorizontal: 16,
        paddingVertical: 14,
        borderRadius: RADIUS.md,
        borderWidth: 1.5,
    },
    connectionButtonOnline: {
        backgroundColor: '#FFF5F5',
        borderColor: '#FCA5A5',
    },
    connectionButtonOffline: {
        backgroundColor: '#F0FDF4',
        borderColor: '#86EFAC',
    },
    connectionDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    dotOnline: { backgroundColor: '#22C55E' },
    dotOffline: { backgroundColor: '#9CA3AF' },
    connectionText: {
        fontSize: 15,
        fontWeight: '600',
    },
    connectionTextOnline: { color: '#EF4444' },
    connectionTextOffline: { color: '#16A34A' },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 12,
        marginHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: '#FFEBE6',
        borderRadius: RADIUS.md,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.danger,
    },
    version: {
        textAlign: 'center',
        fontSize: 12,
        color: COLORS.textMuted,
        marginTop: 24,
        marginBottom: 40,
    },
    // BLOQUE 2 finalizar
    finalizarButton: {
        backgroundColor: '#10B981',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    finalizarButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    // Modal profesional
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 28,
        width: '100%',
        maxWidth: 380,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    modalIconWrap: {
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 16,
        textAlign: 'center',
    },
    modalBody: {
        fontSize: 15,
        color: '#374151',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 12,
    },
    modalFooter: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 12,
        marginBottom: 24,
        textAlign: 'center',
    },
    modalButton: {
        backgroundColor: '#10B981',
        paddingVertical: 14,
        paddingHorizontal: 48,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 160,
    },
    modalButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
