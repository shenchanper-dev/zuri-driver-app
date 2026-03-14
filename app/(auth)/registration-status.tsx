import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';

const STATUS_CONFIG = {
    EN_PROCESO: {
        icon: 'time-outline',
        title: 'Verificación Pendiente',
        message: 'Tu registro está en proceso. Por favor verifica tu email.',
        color: '#f39c12',
        bgColor: '#fff3e0',
        action: 'Verificar Email',
        actionRoute: '/(auth)/verify-email',
    },
    PENDIENTE: {
        icon: 'hourglass-outline',
        title: 'En Revisión',
        message: 'Tu solicitud está siendo revisada por nuestro equipo. Te notificaremos pronto por email cuando sea aprobada.',
        color: '#00B5D8',
        bgColor: '#E0F2FE',
        action: 'Ir al Inicio',
        actionRoute: '/(auth)/login',
    },
    APROBADO: {
        icon: 'checkmark-circle-outline',
        title: '¡Felicitaciones!',
        message: 'Tu solicitud ha sido aprobada. Ya puedes iniciar sesión y comenzar a trabajar con ZURI.',
        color: '#00B5D8',
        bgColor: '#E0F2FE',
        action: 'Iniciar Sesión',
        actionRoute: '/(auth)/login',
    },
    RECHAZADO: {
        icon: 'close-circle-outline',
        title: 'Solicitud Rechazada',
        message: 'Lo sentimos, tu solicitud no fue aprobada. Revisa tu email para más detalles sobre el motivo.',
        color: '#e74c3c',
        bgColor: '#ffebee',
        action: 'Volver al Inicio',
        actionRoute: '/(auth)/login',
    },
};

export default function RegistrationStatus() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { estadoRegistro } = params;

    const status = (estadoRegistro as string) || 'PENDIENTE';
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDIENTE;

    const handleAction = () => {
        router.replace(config.actionRoute as any);
    };

    const handleContactSupport = () => {
        Alert.alert(
            '📞 Soporte',
            '¿Necesitas ayuda? Contáctanos:\n\nEmail: soporte@zuri.pe\nWhatsApp: +51 999 888 777',
            [{ text: 'Entendido' }]
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <LinearGradient
                colors={['#00B5D8', '#0891B2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.header}
            >
                <View style={styles.headerLeft} />
                <View style={styles.headerCenter}>
                    <Image
                        source={require('@/assets/logo-zuri.png')}
                        style={styles.logoImage}
                        resizeMode="contain"
                    />
                </View>
                <View style={styles.headerRight} />
            </LinearGradient>

            {/* Content */}
            <View style={styles.content}>
                {/* Status Icon */}
                <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
                    <Ionicons name={config.icon as any} size={64} color={config.color} />
                </View>

                {/* Title */}
                <Text style={[styles.title, { color: config.color }]}>{config.title}</Text>

                {/* Status Badge */}
                <View style={[styles.statusBadge, { backgroundColor: config.bgColor }]}>
                    <View style={[styles.statusDot, { backgroundColor: config.color }]} />
                    <Text style={[styles.statusText, { color: config.color }]}>{status}</Text>
                </View>

                {/* Message Card */}
                <View style={styles.messageCard}>
                    <Text style={styles.messageText}>{config.message}</Text>
                </View>

                {/* Info Items */}
                <View style={styles.infoSection}>
                    <View style={styles.infoItem}>
                        <Ionicons name="notifications-outline" size={20} color="#00B5D8" />
                        <Text style={styles.infoText}>Te notificaremos por email</Text>
                    </View>
                    <View style={styles.infoItem}>
                        <Ionicons name="time-outline" size={20} color="#00B5D8" />
                        <Text style={styles.infoText}>Revisión en 24-48 horas</Text>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleAction}
                    >
                        <LinearGradient
                            colors={['#00B5D8', '#0891B2']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.primaryButtonGradient}
                        >
                            <Text style={styles.primaryButtonText}>{config.action}</Text>
                            <Ionicons name="arrow-forward" size={20} color="#fff" />
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={handleContactSupport}
                    >
                        <Ionicons name="chatbubble-ellipses-outline" size={18} color="#00B5D8" />
                        <Text style={styles.secondaryButtonText}>Contactar Soporte</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerLeft: {
        width: 40,
    },
    headerCenter: {
        alignItems: 'center',
    },
    logoImage: {
        width: 120,
        height: 60,
    },
    headerRight: {
        width: 40,
    },
    content: {
        flex: 1,
        padding: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 16,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginBottom: 24,
        gap: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusText: {
        fontSize: 14,
        fontWeight: '600',
    },
    messageCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
        width: '100%',
    },
    messageText: {
        fontSize: 16,
        color: '#444',
        textAlign: 'center',
        lineHeight: 24,
    },
    infoSection: {
        width: '100%',
        marginBottom: 32,
        gap: 12,
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E0F2FE',
        padding: 16,
        borderRadius: 12,
        gap: 12,
    },
    infoText: {
        fontSize: 14,
        color: '#555',
    },
    actionsContainer: {
        width: '100%',
        gap: 12,
    },
    primaryButton: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    primaryButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
    },
    primaryButtonText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
    },
    secondaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    secondaryButtonText: {
        fontSize: 16,
        color: '#00B5D8',
        fontWeight: '500',
    },
});
