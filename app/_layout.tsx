/**
 * ZURI Driver App - Root Layout
 * Handles authentication flow and theme setup
 */

import { useEffect, useState, ErrorInfo, Component, ReactNode, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Text, TouchableOpacity, Platform } from 'react-native';
import { useAuthStore } from '@/stores/auth';
import { Ionicons } from '@expo/vector-icons';
import { setupNotificationChannel, setupNotificationListeners } from '@/services/notifications';

// Error Boundary para capturar errores
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Error capturado:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <View style={errorStyles.container}>
                    <Ionicons name="alert-circle" size={64} color="#cc0000" />
                    <Text style={errorStyles.title}>Algo salió mal</Text>
                    <Text style={errorStyles.message}>{this.state.error?.message}</Text>
                    <TouchableOpacity
                        style={errorStyles.button}
                        onPress={() => this.setState({ hasError: false, error: null })}
                    >
                        <Text style={errorStyles.buttonText}>Reintentar</Text>
                    </TouchableOpacity>
                </View>
            );
        }
        return this.props.children;
    }
}

const errorStyles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f5f5f5' },
    title: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 10, marginTop: 20 },
    message: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 30 },
    button: { backgroundColor: '#0066CC', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 8 },
    buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

function RootLayoutContent() {
    const router = useRouter();
    const segments = useSegments();
    const { isAuthenticated, checkAuth, checkBiometrics } = useAuthStore();
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Iniciando...');
    const [initError, setInitError] = useState<string | null>(null);

    const initialize = useCallback(async () => {
        let isMounted = true;
        let timeoutId: number;


        setIsLoading(true);
        setInitError(null);
        setLoadingMessage('Verificando dispositivo...');

        const startTime = Date.now();

        try {
            // Timeout absoluto de seguridad (15 segundos para móviles lentos)
            timeoutId = setTimeout(() => {
                if (isMounted && isLoading) {
                    console.warn('⏰ [RootLayout] Timeout máximo alcanzado');
                    setInitError('La conexión está tardando demasiado. Verifica tu internet.');
                    setIsLoading(false);
                }
            }, 15000);

            // 1. Verificar Biometría (rápido)
            if (Platform.OS !== 'web') {
                try {
                    setLoadingMessage('Verificando hardware...');
                    await checkBiometrics();

                } catch (bioErr: any) {
                    console.warn('⚠️ [RootLayout] Error en biometría (no crítico):', bioErr.message);
                }
            }

            if (!isMounted) return;

            // 2. Verificar Sesión (puede tardar por red)

            setLoadingMessage('Conectando con el servidor...');

            // Usamos un Promise.race interno para la red específicamente
            const authPromise = checkAuth();
            const networkTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Network Timeout')), 12000)
            );

            await Promise.race([authPromise, networkTimeout]);



        } catch (error: any) {
            console.error('❌ [RootLayout] Error durante la inicialización:', error.message);
            if (isMounted) {
                const msg = error.message === 'Network Timeout'
                    ? 'No se pudo conectar con el servidor. Verifica tu conexión.'
                    : error.message;
                setInitError(msg);
            }
        } finally {
            clearTimeout(timeoutId!);
            if (isMounted && !initError) { // Solo finalizar carga si no hubo error

                setIsLoading(false);
            }
        }
    }, [checkAuth, checkBiometrics]);

    // Initial load
    useEffect(() => {
        initialize();
    }, []);

    // Setup notification channel (Android) + listeners
    useEffect(() => {
        const setup = async () => {
            try {
                await setupNotificationChannel();
                setupNotificationListeners();
            } catch (error) {
                console.warn('[RootLayout] Error setting up notifications:', error);
            }
        };
        setup();
    }, []);

    // Handle routing based on auth state
    useEffect(() => {
        if (isLoading || initError) return;

        const inAuthGroup = segments[0] === '(auth)';
        const inTabsGroup = segments[0] === '(tabs)';

        // Si está autenticado y NO está en tabs (login, /togu, +not-found, etc.) -> ir a tabs
        if (isAuthenticated && !inTabsGroup) {
            router.replace('/(tabs)');
        } else if (!isAuthenticated && !inAuthGroup) {
            router.replace('/(auth)/login');
        }
    }, [isAuthenticated, segments, isLoading, initError]);

    // Error screen with Retry
    if (initError) {
        return (
            <View style={styles.container}>
                <Ionicons name="cloud-offline" size={64} color="#fff" style={{ marginBottom: 20 }} />
                <Text style={styles.errorTitle}>Error de Conexión</Text>
                <Text style={styles.errorText}>{initError}</Text>
                <TouchableOpacity
                    style={styles.retryButton}
                    onPress={initialize}
                >
                    <Text style={styles.retryButtonText}>Reintentar Conexión</Text>
                </TouchableOpacity>

                {/* Opción de emergencia para ir al login si falla la sesión */}
                <TouchableOpacity
                    style={styles.textButton}
                    onPress={() => {
                        setInitError(null);
                        setIsLoading(false);
                        router.replace('/(auth)/login');
                    }}
                >
                    <Text style={styles.textButtonLabel}>Ir al Inicio de Sesión</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Loading screen
    if (isLoading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
        );
    }

    return (
        <>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: {
                        backgroundColor: '#0066CC',
                    },
                    headerTintColor: '#fff',
                    headerTitleStyle: {
                        fontWeight: 'bold',
                    },
                    contentStyle: {
                        backgroundColor: '#f5f5f5',
                    },
                }}
            >
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
        </>
    );
}

export default function RootLayout() {
    return (
        <ErrorBoundary>
            <RootLayoutContent />
        </ErrorBoundary>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0066CC', // Brand color default
        padding: 32,
    },
    loadingText: {
        color: '#fff',
        marginTop: 20,
        fontSize: 16,
        fontWeight: '500',
    },
    errorTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 10,
    },
    errorText: {
        color: '#rgba(255,255,255,0.9)',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 22,
    },
    retryButton: {
        backgroundColor: '#fff',
        paddingHorizontal: 30,
        paddingVertical: 14,
        borderRadius: 12,
        width: '100%',
        alignItems: 'center',
        marginBottom: 16,
    },
    retryButtonText: {
        color: '#0066CC',
        fontSize: 16,
        fontWeight: 'bold',
    },
    textButton: {
        padding: 10,
    },
    textButtonLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
        textDecorationLine: 'underline',
    }
});
