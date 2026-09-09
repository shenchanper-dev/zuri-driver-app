import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidVisibility, AndroidCategory } from '@notifee/react-native';
import { driverApi } from './api';

type ForegroundNotificationCallback = (data: {
    title: string;
    body: string;
    payload: Record<string, any>;
}) => void;

let _foregroundCallback: ForegroundNotificationCallback | null = null;

export function setForegroundNotificationCallback(cb: ForegroundNotificationCallback | null) {
    _foregroundCallback = cb;
}

Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
        const tipo = (notification.request.content.data as any)?.tipo;
        const isServicePush = tipo === 'NUEVO_SERVICIO';
        return {
            shouldShowAlert: isServicePush ? !_foregroundCallback : true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: isServicePush ? !_foregroundCallback : true,
            shouldShowList: true,
        };
    },
});

const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

/**
 * Runs when a push arrives while the app is backgrounded or killed (Android).
 * Shows a full-screen "incoming service" notification via Notifee so the
 * driver sees the same accept/close card even without opening the app —
 * mirrors the incoming-ride pattern used by Uber/Didi/InDriver.
 */
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
        console.error('[zuri:notifications] Background task error:', error);
        return;
    }
    try {
        const notification = (data as any)?.notification;
        const payload = notification?.request?.content?.data as Record<string, any> | undefined;
        if (payload?.tipo === 'NUEVO_SERVICIO') {
            await displayFullScreenServiceNotification(payload);
        }
    } catch (taskError) {
        console.error('[zuri:notifications] Error handling background notification:', taskError);
    }
});

/**
 * Shows a full-screen incoming-service notification (Notifee), which on
 * Android launches straight to the app over the lock screen when the
 * driver has granted the "full screen notifications" permission (required
 * manually by the user on Android 14+). Falls back to a normal heads-up
 * notification when that permission isn't granted.
 */
export async function displayFullScreenServiceNotification(payload: Record<string, any>) {
    if (Platform.OS !== 'android') return;
    try {
        const doctor = payload.doctor || payload.doctor_nombre || payload.cliente || '';
        const fecha = payload.fecha || '';
        const hora = payload.hora || '';
        const distrito = payload.distrito || '';
        const bodyParts = [fecha, hora].filter(Boolean).join(' · ');

        await notifee.displayNotification({
            id: `servicio-${payload.serviceId ?? payload.detalle_id ?? Date.now()}`,
            title: 'SERVICIO ASIGNADO',
            body: [doctor, bodyParts, distrito].filter(Boolean).join('\n'),
            data: payload,
            android: {
                channelId: 'servicios-urgentes',
                importance: AndroidImportance.HIGH,
                category: AndroidCategory.CALL,
                visibility: AndroidVisibility.PUBLIC,
                autoCancel: false,
                ongoing: true,
                sound: 'default',
                vibrationPattern: [0, 500, 200, 500],
                fullScreenAction: {
                    id: 'default',
                    launchActivity: 'default',
                },
                pressAction: {
                    id: 'default',
                    launchActivity: 'default',
                },
            },
        });
    } catch (err) {
        console.error('[zuri:notifications] Error showing full-screen notification:', err);
    }
}

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

            await notifee.createChannel({
                id: 'servicios-urgentes',
                name: 'Servicios Urgentes',
                importance: AndroidImportance.HIGH,
                visibility: AndroidVisibility.PUBLIC,
                vibration: true,
                vibrationPattern: [0, 500, 200, 500],
                bypassDnd: true,
                sound: 'default',
            });

            try {
                await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
                console.log('[zuri:notifications] Background notification task registered');
            } catch (taskError) {
                console.warn('[zuri:notifications] Could not register background task:', taskError);
            }

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

        if (Platform.OS === 'android') {
            try {
                await notifee.requestPermission();
            } catch (permError) {
                console.warn('[zuri:notifications] Notifee permission request failed:', permError);
            }
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
    const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
        const content = notification.request.content;
        console.log('[zuri:notifications] Notification received (foreground):', content.body);
        if (_foregroundCallback) {
            _foregroundCallback({
                title: content.title ?? '',
                body: content.body ?? '',
                payload: (content.data as Record<string, any>) ?? {},
            });
        }
    });

    // Listen for notification taps — show popup when user opens app from notification
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
        const content = response.notification.request.content;
        const payload = (content.data as Record<string, any>) ?? {};
        console.log('[zuri:notifications] Notification tapped, tipo:', payload.tipo);
        if (payload.tipo === 'NUEVO_SERVICIO' && _foregroundCallback) {
            _foregroundCallback({
                title: content.title ?? 'SERVICIO ASIGNADO',
                body: content.body ?? '',
                payload,
            });
        }
    });

    // Return cleanup function
    return () => {
        notificationListener.remove();
        responseListener.remove();
    };
}


/**
 * Check if the app was opened from a notification tap (cold start).
 * Call once on mount to handle the case where user tapped a push
 * notification that opened the app from a killed state.
 */
export async function checkColdStartNotification(): Promise<void> {
    try {
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
            const content = response.notification.request.content;
            const payload = (content.data as Record<string, any>) ?? {};
            if (payload.tipo === 'NUEVO_SERVICIO' && _foregroundCallback) {
                console.log('[zuri:notifications] Cold-start notification detected, showing popup');
                _foregroundCallback({
                    title: content.title ?? 'SERVICIO ASIGNADO',
                    body: content.body ?? '',
                    payload,
                });
            }
        }
    } catch (err) {
        console.warn('[zuri:notifications] checkColdStartNotification error:', err);
    }
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
