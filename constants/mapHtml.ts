/**
 * Inline HTML for the MapLibre GL map used by MapaDriver on native (APK).
 * Embedding it here makes the WebView self-contained — no dependency on the
 * deployed app.zuri.pe/map.html, which has historically been served stale.
 *
 * APK 115 — migración Leaflet → MapLibre GL JS + OpenFreeMap Positron:
 *   - Vector tiles (vía style v8) servidos por tiles.openfreemap.org (sin key).
 *   - Librería MapLibre GL JS v4.7.1 pineada desde cdnjs (hashable).
 *   - Smoke test de WebGL + mapError como fallback explícito si el WebView
 *     no soporta WebGL (muy raro en Android ≥7).
 *   - API de postMessage retro-compatible: `updateLocation`/`setLocation`,
 *     `recenter`, `addRoutePoint`/`updateRoute`/`clearRoute`,
 *     `setPins`/`clearPins`, `invalidate`. MapaDriver.tsx NO se toca.
 */
export const MAP_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <title>ZURI Map</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script src="https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <style>
        html, body {
            margin: 0; padding: 0; width: 100%; height: 100%;
            background: #e8ecf0; overflow: hidden;
        }
        #map {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        }
        /* Ocultar controles por defecto / attribution (uso interno). */
        .maplibregl-ctrl-attrib,
        .maplibregl-ctrl-bottom-right,
        .maplibregl-ctrl-bottom-left,
        .maplibregl-ctrl-top-right,
        .maplibregl-ctrl-top-left { display: none !important; }

        /* ── Driver marker (DOM sobre el canvas) ──────────────────────── */
        .driver-marker {
            position: relative; width: 48px; height: 64px; pointer-events: none;
        }
        .driver-marker .pulse {
            position: absolute; top: 50%; left: 50%;
            width: 40px; height: 40px;
            margin-top: -20px; margin-left: -20px;
            background: rgba(31, 41, 55, 0.18);
            border-radius: 50%;
            animation: zuriPulse 2s infinite;
            z-index: 0;
        }
        .driver-marker .core {
            position: absolute; top: 0; left: 50%;
            transform: translateX(-50%);
            width: 40px; height: 56px;
            z-index: 1;
            display: flex; align-items: center; justify-content: center;
        }
        .driver-marker .badge {
            position: absolute; top: -4px; right: -4px;
            width: 22px; height: 22px;
            background: white; border: 2px solid #1F2937;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; line-height: 1; z-index: 2;
        }
        .driver-marker .badge:empty { display: none; }
        @keyframes zuriPulse {
            0%   { transform: scale(0.7); opacity: 0.9; }
            100% { transform: scale(1.5); opacity: 0;   }
        }

        /* ── Pins origen / destino ─────────────────────────────────── */
        .zuri-pin {
            width: 22px; height: 22px; border-radius: 50%;
            border: 3px solid #ffffff;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            box-sizing: border-box;
        }
        .pin-origen  { background: #0e1726; }
        .pin-destino { background: #2f54eb; }

        /* ── Fallback banner si no hay WebGL ───────────────────────── */
        #fallback {
            display: none;
            position: absolute; inset: 0;
            background: #e8ecf0; color: #0e1726;
            align-items: center; justify-content: center;
            padding: 20px; text-align: center;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px; font-weight: 600;
        }
        #fallback.on { display: flex; }
    </style>
</head>
<body>
    <div id="map"></div>
    <div id="fallback">Este dispositivo no soporta mapas vectoriales (sin WebGL).</div>
    <script>
        (function () {
            var DEFAULT_LAT  = -12.1462;
            var DEFAULT_LNG  = -76.9954;
            var DEFAULT_ZOOM = 15;

            // ── SVG car top-down (restaurado APK 114; igual al admin RealTimeDriverMap) ──
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

            // ── Vehicle type badge emojis ──────────────────────────────
            var VEHICLE_EMOJIS = {
                WHEELCHAIR: '♿', OXYGEN: '⛽', STRETCHER: '🛏️',
                RAMP: '🚐', BARIATRIC: '⚕️', REGULAR: '',
            };

            // ── Mensajeria map → parent ────────────────────────────────
            function postToParent(msg) {
                try {
                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
                    }
                } catch (e) { /* ignore */ }
                try {
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage(msg, '*');
                    }
                } catch (e) { /* ignore */ }
            }

            // ── Smoke test WebGL (MapLibre v4+ no expone supported()) ─
            function hasWebGL() {
                try {
                    var cnv = document.createElement('canvas');
                    return !!(window.WebGLRenderingContext && (
                        cnv.getContext('webgl') || cnv.getContext('experimental-webgl')
                    ));
                } catch (e) { return false; }
            }

            if (!hasWebGL() || typeof maplibregl === 'undefined') {
                var reason = typeof maplibregl === 'undefined'
                    ? 'maplibre-gl.js no cargo (red?)'
                    : 'WebGL no soportado';
                document.getElementById('fallback').classList.add('on');
                postToParent({ type: 'mapError', reason: reason });
                return;
            }

            // ── Init MapLibre ──────────────────────────────────────────
            var map;
            try {
                map = new maplibregl.Map({
                    container: 'map',
                    style: 'https://tiles.openfreemap.org/styles/positron',
                    center: [DEFAULT_LNG, DEFAULT_LAT],
                    zoom: DEFAULT_ZOOM,
                    attributionControl: false,
                    pitchWithRotate: false,
                    dragRotate: false,
                    touchZoomRotate: true,
                });
            } catch (e) {
                document.getElementById('fallback').classList.add('on');
                postToParent({ type: 'mapError', reason: 'maplibre init failed: ' + (e && e.message || e) });
                return;
            }

            map.on('error', function (e) {
                var msg = (e && e.error && e.error.message) || 'map error';
                postToParent({ type: 'mapWarn', reason: msg });
            });

            // ── Driver marker (HTMLElement con pulse + .core rotatorio) ─
            var driverEl = document.createElement('div');
            driverEl.className = 'driver-marker';
            driverEl.innerHTML =
                '<div class="pulse"></div>' +
                '<div class="core">' + carSVG + '</div>' +
                '<div class="badge"></div>';
            var driverMarker = new maplibregl.Marker({
                element: driverEl,
                anchor: 'center',
                rotationAlignment: 'map', // noop porque rotamos manualmente .core
            }).setLngLat([DEFAULT_LNG, DEFAULT_LAT]);

            // ── Pins origen / destino (dormidos hasta setPins) ─────────
            var pinOrigen = null;
            var pinDestino = null;
            function makePinEl(cls) {
                var d = document.createElement('div');
                d.className = 'zuri-pin ' + cls;
                return d;
            }

            // ── Route layers (casing blanco + line brand ZURI) ─────────
            var routePoints = [];
            function routeGeoJSON() {
                return {
                    type: 'FeatureCollection',
                    features: [{
                        type: 'Feature',
                        geometry: { type: 'LineString', coordinates: routePoints },
                        properties: {},
                    }],
                };
            }

            function setupRouteLayers() {
                if (map.getSource('zuri-route')) return;
                map.addSource('zuri-route', { type: 'geojson', data: routeGeoJSON() });
                map.addLayer({
                    id: 'zuri-route-casing',
                    type: 'line',
                    source: 'zuri-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.95 },
                });
                map.addLayer({
                    id: 'zuri-route-line',
                    type: 'line',
                    source: 'zuri-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round' },
                    paint: { 'line-color': '#2f54eb', 'line-width': 5, 'line-opacity': 0.95 },
                });
            }

            function updateRouteSource() {
                var src = map.getSource('zuri-route');
                if (src) src.setData(routeGeoJSON());
            }

            // ── On load: montar marker + rutas + notificar listo ───────
            map.on('load', function () {
                driverMarker.addTo(map);
                setupRouteLayers();
                postToParent({ type: 'mapReady', engine: 'maplibre', webgl: true, version: maplibregl.version || '4.7.1' });
            });

            // ── Resize & orientation ───────────────────────────────────
            setTimeout(function () { try { map.resize(); } catch (e) {} }, 100);
            setTimeout(function () { try { map.resize(); } catch (e) {} }, 500);
            window.addEventListener('resize', function () { try { map.resize(); } catch (e) {} });
            window.addEventListener('orientationchange', function () {
                setTimeout(function () { try { map.resize(); } catch (e) {} }, 200);
            });

            function updateBadge(vehicleType) {
                var badge = driverEl.querySelector('.badge');
                if (badge) badge.textContent = VEHICLE_EMOJIS[vehicleType] || '';
            }

            function applyHeading(heading) {
                if (typeof heading !== 'number' || isNaN(heading)) return;
                var core = driverEl.querySelector('.core');
                if (core) core.style.transform = 'translateX(-50%) rotate(' + heading + 'deg)';
            }

            // ── Mensajes parent → map (API compatible con MapaDriver.tsx) ─
            window.addEventListener('message', function (event) {
                var msg = event.data || {};
                if (typeof msg === 'string') {
                    try { msg = JSON.parse(msg); } catch (e) { return; }
                }

                // updateLocation (alias: setLocation)
                if ((msg.type === 'updateLocation' || msg.type === 'setLocation')
                    && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                    var ll = [msg.lng, msg.lat];
                    driverMarker.setLngLat(ll);
                    applyHeading(msg.heading);
                    if (msg.recenter) {
                        map.flyTo({ center: ll, zoom: msg.zoom || DEFAULT_ZOOM, duration: 800 });
                    } else {
                        map.panTo(ll, { duration: 500 });
                    }
                    return;
                }

                if (msg.type === 'recenter' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                    map.flyTo({ center: [msg.lng, msg.lat], zoom: msg.zoom || DEFAULT_ZOOM, duration: 800 });
                    return;
                }

                if (msg.type === 'invalidate') {
                    try { map.resize(); } catch (e) {}
                    return;
                }

                if (msg.type === 'updateVehicleType') {
                    updateBadge(msg.vehicleType);
                    return;
                }

                if (msg.type === 'addRoutePoint'
                    && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
                    routePoints.push([msg.lng, msg.lat]);
                    updateRouteSource();
                    return;
                }

                if (msg.type === 'updateRoute' && Array.isArray(msg.points)) {
                    routePoints = msg.points.map(function (p) { return [p.lng, p.lat]; });
                    updateRouteSource();
                    return;
                }

                if (msg.type === 'clearRoute') {
                    routePoints = [];
                    updateRouteSource();
                    return;
                }

                if (msg.type === 'setPins') {
                    if (pinOrigen)  { pinOrigen.remove();  pinOrigen  = null; }
                    if (pinDestino) { pinDestino.remove(); pinDestino = null; }
                    if (msg.origen && typeof msg.origen.lat === 'number') {
                        pinOrigen = new maplibregl.Marker({ element: makePinEl('pin-origen'), anchor: 'center' })
                            .setLngLat([msg.origen.lng, msg.origen.lat]).addTo(map);
                    }
                    if (msg.destino && typeof msg.destino.lat === 'number') {
                        pinDestino = new maplibregl.Marker({ element: makePinEl('pin-destino'), anchor: 'center' })
                            .setLngLat([msg.destino.lng, msg.destino.lat]).addTo(map);
                    }
                    return;
                }

                if (msg.type === 'clearPins') {
                    if (pinOrigen)  { pinOrigen.remove();  pinOrigen  = null; }
                    if (pinDestino) { pinDestino.remove(); pinDestino = null; }
                    return;
                }
            });

        })();
    </script>
</body>
</html>`;
