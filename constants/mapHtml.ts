/**
 * Inline HTML for the Leaflet map used by MapaDriver on native (APK).
 * Embedding it here makes the WebView self-contained — no dependency on the
 * deployed app.zuri.pe/map.html, which has historically been served stale.
 */
export const MAP_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>ZURI Map</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #d6d6d6;
            overflow: hidden;
        }
        #map {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        }
        .leaflet-control-attribution { display: none !important; }

        /* ── Driver marker ─────────────────────────────────────────── */
        .zuri-driver-icon {
            background: none !important;
            border: none !important;
            overflow: visible !important;
        }
        .driver-marker {
            position: relative;
            width: 48px;
            height: 64px;
        }
        /* Pulse ring — circular glow around the center of the car */
        .driver-marker .pulse {
            position: absolute;
            top: 50%;
            left: 50%;
            width: 40px;
            height: 40px;
            margin-top: -20px;
            margin-left: -20px;
            background: rgba(31, 41, 55, 0.18);
            border-radius: 50%;
            animation: zuriPulse 2s infinite;
            z-index: 0;
        }
        /* SVG car wrapper — centered, sits above pulse */
        .driver-marker .core {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 56px;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        /* Vehicle type badge — top-right of the marker */
        .driver-marker .badge {
            position: absolute;
            top: -4px;
            right: -4px;
            width: 22px;
            height: 22px;
            background: white;
            border: 2px solid #1F2937;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            line-height: 1;
            z-index: 2;
        }
        .driver-marker .badge:empty {
            display: none;
        }
        @keyframes zuriPulse {
            0%   { transform: scale(0.7); opacity: 0.9; }
            100% { transform: scale(1.5); opacity: 0;   }
        }

        /* ── Pins origen / destino (mockup APK 111) ──────────────── */
        .zuri-pin-wrap {
            background: none !important;
            border: none !important;
        }
        .zuri-pin {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            box-sizing: border-box;
        }
        .pin-origen  { background: #0e1726; }  /* oscuro */
        .pin-destino { background: #2f54eb; }  /* azul brand ZURI */
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        (function () {
            var DEFAULT_LAT  = -12.1462;
            var DEFAULT_LNG  = -76.9954;
            var DEFAULT_ZOOM = 16;

            var map = L.map('map', {
                zoomControl: false,
                attributionControl: false,
                dragging: true,
                touchZoom: true,
                scrollWheelZoom: false,
                doubleClickZoom: true,
            }).setView([DEFAULT_LAT, DEFAULT_LNG], DEFAULT_ZOOM);

            // OpenStreetMap estándar — vuelta al basemap original tras verificar que
            // Esri Light Gray no muestra nombres de calles (base sin labels) y
            // CARTO ahora exige API key. OSM sirve mapa detallado con rotulado
            // completo, gratis y sin key.
            // Orden path OSM: {z}/{x}/{y} (NO {z}/{y}/{x} como Esri).
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);

            // ── SVG car (top-down) — restaurado desde pre-APK111.
            // Beni pidió volver al auto (como antes). La rotación por heading
            // sigue funcionando via .core style.transform rotate(deg).
            var carSVG = \`<svg width="40" height="56" viewBox="0 0 40 56" fill="none" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="20" cy="50" rx="12" ry="4" fill="rgba(0,0,0,0.2)" />
  <polygon points="20,0 26,8 14,8" fill="#1a1a1a" stroke="white" stroke-width="1.2" />
  <rect x="10" y="8" width="20" height="38" rx="6" ry="6" fill="#1a1a1a" stroke="white" stroke-width="1.5" />
  <rect x="13" y="13" width="14" height="8" rx="2" fill="#93c5fd" opacity="0.85" stroke="#60a5fa" stroke-width="0.5" />
  <rect x="13" y="33" width="14" height="6" rx="2" fill="#60a5fa" opacity="0.6" stroke="#3b82f6" stroke-width="0.5" />
  <rect x="11" y="9" width="4" height="2.5" rx="1" fill="#fde047" stroke="#facc15" stroke-width="0.3" />
  <rect x="25" y="9" width="4" height="2.5" rx="1" fill="#fde047" stroke="#facc15" stroke-width="0.3" />
  <rect x="11" y="43" width="4" height="2" rx="0.8" fill="#ef4444" stroke="#dc2626" stroke-width="0.3" />
  <rect x="25" y="43" width="4" height="2" rx="0.8" fill="#ef4444" stroke="#dc2626" stroke-width="0.3" />
  <rect x="7" y="16" width="3" height="5" rx="1.5" fill="#1a1a1a" stroke="white" stroke-width="0.8" />
  <rect x="30" y="16" width="3" height="5" rx="1.5" fill="#1a1a1a" stroke="white" stroke-width="0.8" />
  <rect x="14" y="22" width="12" height="10" rx="2" fill="#2d2d2d" stroke="#404040" stroke-width="0.5" />
</svg>\`;

            var driverIcon = L.divIcon({
                html: '<div class="driver-marker"><div class="pulse"></div><div class="core">' + carSVG + '</div><div class="badge"></div></div>',
                className: 'zuri-driver-icon',
                iconSize: [48, 64],
                iconAnchor: [24, 56],
            });

            var marker = L.marker([DEFAULT_LAT, DEFAULT_LNG], { icon: driverIcon }).addTo(map);

            // ── Route polyline — casing blanco + línea brand ZURI ──
            var routePoints = [];
            var routeCasing = L.polyline([], {
                color: '#ffffff',
                weight: 8,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round',
            }).addTo(map);
            var routeLine = L.polyline([], {
                color: '#2f54eb',
                weight: 5,
                opacity: 0.95,
                lineJoin: 'round',
                lineCap: 'round',
            }).addTo(map);

            // ── Vehicle type badge emojis ──────────────────────────────
            var VEHICLE_EMOJIS = {
                'WHEELCHAIR': '♿',
                'OXYGEN':     '⛽',
                'STRETCHER':  '🛏️',
                'RAMP':       '🚐',
                'BARIATRIC':  '⚕️',
                'REGULAR':    '',
            };

            function updateBadge(vehicleType) {
                var badge = document.querySelector('.driver-marker .badge');
                if (badge) {
                    badge.textContent = VEHICLE_EMOJIS[vehicleType] || '';
                }
            }

            // ── Pins origen/destino (ocultos hasta recibir setPins) ──
            var pinOrigen = null;
            var pinDestino = null;

            // ── Resize & orientation ──────────────────────────────────
            setTimeout(function () { map.invalidateSize(); }, 100);
            setTimeout(function () { map.invalidateSize(); }, 500);
            window.addEventListener('resize', function () { map.invalidateSize(); });
            window.addEventListener('orientationchange', function () {
                setTimeout(function () { map.invalidateSize(); }, 200);
            });

            // ── Recibir mensajes desde la app driver (parent window) ──
            window.addEventListener('message', function (event) {
                var msg = event.data || {};

                if (msg.type === 'updateLocation' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                    var ll = [msg.lat, msg.lng];
                    marker.setLatLng(ll);
                    if (typeof msg.heading === "number" && !isNaN(msg.heading)) {
                        var core = document.querySelector(".driver-marker .core");
                        if (core) core.style.transform = "translateX(-50%) rotate(" + msg.heading + "deg)";
                    }
                    if (msg.recenter) {
                        map.flyTo(ll, msg.zoom || DEFAULT_ZOOM, { duration: 0.8 });
                    } else {
                        map.panTo(ll, { animate: true, duration: 0.5 });
                    }
                } else if (msg.type === 'recenter' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                    map.flyTo([msg.lat, msg.lng], msg.zoom || DEFAULT_ZOOM, { duration: 0.8 });
                } else if (msg.type === 'invalidate') {
                    map.invalidateSize();
                } else if (msg.type === 'updateVehicleType') {
                    updateBadge(msg.vehicleType);
                } else if (msg.type === 'addRoutePoint' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                    routePoints.push([msg.lat, msg.lng]);
                    routeCasing.setLatLngs(routePoints);
                    routeLine.setLatLngs(routePoints);
                } else if (msg.type === 'updateRoute' && Array.isArray(msg.points)) {
                    routePoints = msg.points.map(function(p) { return [p.lat, p.lng]; });
                    routeCasing.setLatLngs(routePoints);
                    routeLine.setLatLngs(routePoints);
                } else if (msg.type === 'clearRoute') {
                    routePoints = [];
                    routeCasing.setLatLngs([]);
                    routeLine.setLatLngs([]);
                } else if (msg.type === 'setPins') {
                    if (pinOrigen)  { map.removeLayer(pinOrigen);  pinOrigen  = null; }
                    if (pinDestino) { map.removeLayer(pinDestino); pinDestino = null; }
                    if (msg.origen && typeof msg.origen.lat === 'number') {
                        pinOrigen = L.marker([msg.origen.lat, msg.origen.lng], {
                            icon: L.divIcon({
                                html: '<div class="zuri-pin pin-origen"></div>',
                                className: 'zuri-pin-wrap',
                                iconSize: [22, 22],
                                iconAnchor: [11, 11],
                            }),
                        }).addTo(map);
                    }
                    if (msg.destino && typeof msg.destino.lat === 'number') {
                        pinDestino = L.marker([msg.destino.lat, msg.destino.lng], {
                            icon: L.divIcon({
                                html: '<div class="zuri-pin pin-destino"></div>',
                                className: 'zuri-pin-wrap',
                                iconSize: [22, 22],
                                iconAnchor: [11, 11],
                            }),
                        }).addTo(map);
                    }
                } else if (msg.type === 'clearPins') {
                    if (pinOrigen)  { map.removeLayer(pinOrigen);  pinOrigen  = null; }
                    if (pinDestino) { map.removeLayer(pinDestino); pinDestino = null; }
                }
            });

            // ── Notificar que el mapa está listo (web parent + RN WebView) ─
            try {
                window.parent.postMessage({ type: 'mapReady' }, '*');
            } catch (e) { /* ignore */ }
            try {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'mapReady' }));
                }
            } catch (e) { /* ignore */ }
        })();
    </script>
</body>
</html>`;
