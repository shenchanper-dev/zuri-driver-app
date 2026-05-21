import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { driverApi } from './api';

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

/**
 * Setup notification channel for Android (required for SDK 54+)
 * MAX importance ensures high priority notifications break through DND
 */
export async function setupNotificationChannel() {
    if (Platform.OS === 'android') {
        try {
            await Notifications.setNotificationChannelAsync('servicios-urgentes', {
                name: 'Servicios Urgentes',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 500, 200, 500],
                enableVibrate: true,
                bypassDnd: true,
                showBadge: true,
                lightColor: '#00875A',
            });
            console.log('[zuri:notifications] Channel servicios-urgentes configured');
        } catch (error) {
            console.error('[zuri:notifications] Error setting up channel:', error);
        }
    }
}

/**
 * Request notification permissions and register for push notifications
 * Returns the push token if successful, null otherwise
 */
export async function registerForPushNotifications(): Promise<string | null> {
    try {
        // Check if device supports notifications
        if (!Device.isDevice) {
            console.warn('[zuri:notifications] Not a physical device — push disabled');
            return null;
        }

        // Request permission
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        if (finalStatus !== 'granted') {
            console.warn('[zuri:notifications] Push permission denied');
            return null;
        }

        // Get push token
        const token = await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId ?? '0eae9dfa-a897-445d-89b0-9cdb74ea905c',
        });
        console.log('[zuri:notifications] Got push token:', token.data.substring(0, 40) + '...');

        // Send token to backend
        try {
            await driverApi.registerPushToken(token.data);
            console.log('[zuri:notifications] Push token registered with backend');
        } catch (error) {
            console.error('[zuri:notifications] Failed to register token with backend:', error);
        }

        return token.data;

    } catch (error) {
        console.error('[zuri:notifications] Error registering for push:', error);
        return null;
    }
}

/**
 * Setup notification response listeners
 */
export function setupNotificationListeners(): () => void {
    // Listen for notifications when app is in foreground
    const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
        console.log('[zuri:notifications] Notification received (foreground):', notification.request.content.body);
    });

    // Listen for notification taps
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        console.log('[zuri:notifications] Notification tapped:', response.notification.request.content.data);
        // Could implement deep linking here if needed
    });

    // Return cleanup function
    return () => {
        notificationListener.remove();
        responseListener.remove();
    };
}

/**
 * Legacy support: Show local notification for new service assignment
 */
export async function showServiceAssignedNotification(service: {
    codigo: string;
    pacienteNombre: string;
    origenDireccion: string;
}) {
    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: '🚗 Nuevo Servicio Asignado',
                body: `${service.pacienteNombre}\n📍 ${service.origenDireccion}`,
                data: { serviceId: service.codigo },
                sound: 'default',
                priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: null,
        });
    } catch (error) {
        console.warn('[zuri:notifications] Error showing notification:', error);
    }
}
