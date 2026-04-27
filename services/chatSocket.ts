/**
 * Cliente del namespace /chat — separado del socket GPS principal.
 * Se conecta a la MISMA URL de producción (https://app.zuri.pe) pero
 * al namespace /chat. Auth vía handshake.auth con autorTipo/autorId/autorNombre.
 */
import { io, Socket } from 'socket.io-client';

const PROD_URL = 'https://app.zuri.pe';
const DEV_URL  = process.env.EXPO_PUBLIC_SOCKET_URL || 'wss://admin.zuri.pe';
const CHAT_URL = typeof window !== 'undefined' && window.location?.hostname !== 'localhost'
    ? PROD_URL
    : DEV_URL;

export interface MensajeChat {
    id: number;
    conversacion_id: number;
    autor_tipo: 'CONDUCTOR' | 'ADMIN' | 'USUARIO' | 'SISTEMA';
    autor_id: number | null;
    autor_nombre: string;
    contenido: string;
    tipo: 'TEXTO' | 'IMAGEN' | 'UBICACION' | 'SISTEMA';
    adjunto_url: string | null;
    leido_en: string | null;
    enviado_en: string;
}

export interface ChatHistoryEvent {
    conversacionId: number;
    mensajes: MensajeChat[];
}

export interface ChatTypingEvent {
    autorTipo: 'CONDUCTOR' | 'ADMIN';
    autorNombre: string;
    isTyping: boolean;
}

export interface ChatReadUpdateEvent {
    conversacionId: number;
    hasta: number;
    lectorTipo: 'CONDUCTOR' | 'ADMIN';
}

class ChatSocketManager {
    private socket: Socket | null = null;
    private currentServicioId: number | null = null;

    connect(autorId: number, autorNombre: string): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.socket?.connected) {
                resolve(true);
                return;
            }

            // Limpiar socket previo desconectado
            if (this.socket) {
                this.socket.removeAllListeners();
                this.socket.disconnect();
                this.socket = null;
            }

            this.socket = io(`${CHAT_URL}/chat`, {
                transports: ['websocket', 'polling'],
                auth: {
                    autorTipo: 'CONDUCTOR',
                    autorId,
                    autorNombre,
                },
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 10000,
            });

            const onConnect = () => {
                console.log('[chat] connected');
                if (this.currentServicioId) {
                    this.socket?.emit('chat:join', { servicioId: this.currentServicioId });
                }
                resolve(true);
            };

            const onError = (err: any) => {
                console.warn('[chat] connect_error:', err?.message || err);
                resolve(false);
            };

            this.socket.once('connect', onConnect);
            this.socket.once('connect_error', onError);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.disconnect();
            this.socket = null;
            this.currentServicioId = null;
        }
    }

    join(servicioId: number) {
        this.currentServicioId = servicioId;
        if (this.socket?.connected) {
            this.socket.emit('chat:join', { servicioId });
        }
    }

    sendMessage(servicioId: number, contenido: string, tipo: 'TEXTO' | 'IMAGEN' | 'UBICACION' = 'TEXTO'): boolean {
        if (!this.socket?.connected) return false;
        this.socket.emit('chat:message', { servicioId, contenido, tipo });
        return true;
    }

    markRead(conversacionId: number, hasta: number) {
        if (!this.socket?.connected) return;
        this.socket.emit('chat:read', { conversacionId, hasta });
    }

    setTyping(servicioId: number, isTyping: boolean) {
        if (!this.socket?.connected) return;
        this.socket.emit('chat:typing', { servicioId, isTyping });
    }

    on(event: 'chat:history',      cb: (data: ChatHistoryEvent) => void): void;
    on(event: 'chat:message:new',  cb: (data: { mensaje: MensajeChat }) => void): void;
    on(event: 'chat:read:update',  cb: (data: ChatReadUpdateEvent) => void): void;
    on(event: 'chat:typing',       cb: (data: ChatTypingEvent) => void): void;
    on(event: string, cb: (...args: any[]) => void): void {
        this.socket?.on(event, cb);
    }

    off(event: string, cb?: (...args: any[]) => void) {
        if (cb) this.socket?.off(event, cb);
        else this.socket?.off(event);
    }

    isConnected(): boolean {
        return this.socket?.connected ?? false;
    }
}

export const chatSocket = new ChatSocketManager();
