import * as Device from 'expo-device';
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
            console.log('[zuri:notifications] Channel servicios-urgentes configured');
        } catch (error) {
            console.error('[zuri:notifications] Error setting up channel:', error);
        }
    }
}

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

export function setupNotificationListeners(): () => void {
    return () => {};
}

export async function checkColdStartNotification(): Promise<void> {
    // Cold-start from Notifee tap is handled in _layout.tsx via notifee.getInitialNotification()
}
