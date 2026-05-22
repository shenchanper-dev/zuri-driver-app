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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth';
import { useLocationStore } from '@/stores/location';
import { socket } from '@/services/socket';
import { COLORS, RADIUS, SHADOW } from '@/constants/theme';

export default function ProfileScreen() {
    const router = useRouter();
    const { conductor, logout } = useAuthStore();
    const { stopTracking } = useLocationStore();

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
                            await stopTracking();
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
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 24,
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
});
