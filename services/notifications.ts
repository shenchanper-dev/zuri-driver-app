import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
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

// ── Expo notification handler (legacy, se quita en PASO 5) ───────────
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

// ── Expo background task (legacy, se quita en PASO 5) ────────────────
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND_NOTIFICATION_TASK';

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

// ── FCM background handler (top-level, fuera de componentes) ─────────
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[zuri:fcm] Background message:', remoteMessage.messageId);
    const data = remoteMessage.data as Record<string, any> | undefined;
    if (!data) return;

    if (data.tipo === 'NUEVO_SERVICIO' || data.tipo === 'SERVICIO_CANCELADO') {
        await displayFullScreenServiceNotification(data);
    } else {
        await notifee.displayNotification({
            title: data.title || 'ZURI',
            body: data.body || '',
            data,
            android: {
                channelId: data.channelId || 'servicios-urgentes',
                importance: AndroidImportance.HIGH,
                sound: 'default',
                pressAction: { id: 'default' },
            },
        });
    }
});

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
            title: payload.title || 'SERVICIO ASIGNADO',
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

// ── FCM registration (nativo) ────────────────────────────────────────
export async function registerForFcmPushNotifications(): Promise<string | null> {
    try {
        if (!Device.isDevice) {
            console.warn('[zuri:fcm] Not a physical device — push disabled');
            return null;
        }

        const authStatus = await messaging().requestPermission();
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (!enabled) {
            console.warn('[zuri:fcm] Push permission denied');
            return null;
        }

        if (Platform.OS === 'android') {
            try { await notifee.requestPermission(); }
            catch (e) { console.warn('[zuri:fcm] Notifee permission request failed:', e); }
        }

        const fcmToken = await messaging().getToken();
        console.log('[zuri:fcm] Got FCM token:', fcmToken.substring(0, 20) + '...');

        try {
            await driverApi.registerPushToken(fcmToken);
            console.log('[zuri:fcm] FCM token registered with backend');
        } catch (error) {
            console.error('[zuri:fcm] Failed to register FCM token:', error);
        }

        messaging().onTokenRefresh(async (newToken) => {
            console.log('[zuri:fcm] Token refreshed:', newToken.substring(0, 20) + '...');
            try { await driverApi.registerPushToken(newToken); }
            catch (e) { console.warn('[zuri:fcm] Token refresh register failed:', e); }
        });

        return fcmToken;
    } catch (error) {
        console.error('[zuri:fcm] Error registering for FCM push:', error);
        return null;
    }
}

// ── FCM foreground listener ──────────────────────────────────────────
export function setupFcmForegroundListener(): () => void {
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
        console.log('[zuri:fcm] Foreground message:', remoteMessage.messageId);
        const data = remoteMessage.data as Record<string, any> | undefined;
        if (!data) return;

        if (data.tipo === 'NUEVO_SERVICIO') {
            if (_foregroundCallback) {
                _foregroundCallback({
                    title: data.title || 'SERVICIO ASIGNADO',
                    body: data.body || '',
                    payload: data,
                });
            } else {
                await displayFullScreenServiceNotification(data);
            }
        } else if (data.tipo === 'SERVICIO_CANCELADO') {
            await displayFullScreenServiceNotification(data);
            if (_foregroundCallback) {
                _foregroundCallback({
                    title: data.title || 'SERVICIO CANCELADO',
                    body: data.body || '',
                    payload: data,
                });
            }
        } else if (data.tipo === 'chat_message') {
            await notifee.displayNotification({
                title: data.title || 'Mensaje',
                body: data.body || '',
                data,
                android: {
                    channelId: data.channelId || 'servicios-urgentes',
                    importance: AndroidImportance.HIGH,
                    sound: 'default',
                    pressAction: { id: 'default' },
                },
            });
        }
    });

    return unsubscribe;
}

// ── Expo push registration (legacy, se reemplaza en PASO 4) ──────────
export async function registerForPushNotifications(): Promise<string | null> {
    try {
        if (!Device.isDevice) {
            console.warn('[zuri:notifications] Not a physical device — push disabled');
            return null;
        }

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

        const token = await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId ?? '0eae9dfa-a897-445d-89b0-9cdb74ea905c',
        });
        console.log('[zuri:notifications] Got push token:', token.data.substring(0, 40) + '...');

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

    return () => {
        notificationListener.remove();
        responseListener.remove();
    };
}

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
