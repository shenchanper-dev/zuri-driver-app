/**
 * ZURI Driver App - Notification Service
 * Handles local notifications for service assignments
 * Note: expo-notifications is not supported in Expo Go SDK 53+
 * This module gracefully handles the absence of notifications
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Check if we're running in Expo Go (notifications not supported)
const isExpoGo = Constants.appOwnership === 'expo';

// Dynamically import notifications only if not in Expo Go
let Notifications: typeof import('expo-notifications') | null = null;

async function loadNotifications() {
    if (!isExpoGo && Platform.OS !== 'web') {
        try {
            Notifications = await import('expo-notifications');
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: true,
                    shouldSetBadge: true,
                    shouldShowBanner: true,
                    shouldShowList: true,
                }),
            });

        } catch (error) {
            console.warn('⚠️ [Notifications] No disponible:', error);
        }
    } else {

    }
}

// Initialize on module load
loadNotifications();

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    if (!Notifications || Platform.OS === 'web') {

        return true;
    }

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('⚠️ [Notifications] Permiso denegado');
            return false;
        }

        return true;
    } catch (error) {
        console.warn('⚠️ [Notifications] Error solicitando permisos:', error);
        return true;
    }
}

/**
 * Show local notification for new service assignment
 */
export async function showServiceAssignedNotification(service: {
    codigo: string;
    pacienteNombre: string;
    origenDireccion: string;
}) {
    if (!Notifications) {

        return;
    }

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '🚗 Nuevo Servicio Asignado',
                body: `${service.pacienteNombre}\n📍 ${service.origenDireccion}`,
                data: { serviceId: service.codigo },
                sound: true,
                priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null,
        });
    } catch (error) {
        console.warn('⚠️ [Notifications] Error mostrando notificación:', error);
    }
}

/**
 * Show notification for service update
 */
export async function showServiceUpdatedNotification(message: string) {
    if (!Notifications) {

        return;
    }

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '📋 Actualización de Servicio',
                body: message,
                sound: false,
            },
            trigger: null,
        });
    } catch (error) {
        console.warn('⚠️ [Notifications] Error:', error);
    }
}

/**
 * Cancel all notifications
 */
export async function cancelAllNotifications() {
    if (!Notifications) return;

    try {
        await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
        console.warn('⚠️ [Notifications] Error cancelando:', error);
    }
}
