/* =========================================================
   MANDADITO · app.js (Paso 2)
   Mapa, GPS, pines A/B arrastrables, ruta OSRM, geocerca Turf, tarifa.
   ========================================================= */

// ---------- Configuración ----------
const CENTRO = [10.1620, -68.0077];                 // [lat, lng]
// Zona activa de ejemplo [lat, lng]. Ajústala con tus límites reales.
const ZONA = [[10.2150,-68.0700],[10.2150,-67.9300],[10.1000,-67.9300],[10.1000,-68.0700]];
const TARIFA = { base: 1.00, kmIncluidos: 1.5, porKmExtra: 0.35 };
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';

// Polígono Turf: usa [lng, lat] y el anillo debe cerrarse (primer punto = último)
const anillo = ZONA.map(([lat, lng]) => [lng, lat]);
anillo.push(anillo[0]);
const zonaTurf = turf.polygon([anillo]);
const dentroZona = ll => turf.booleanPointInPolygon(turf.point([ll.lng, ll.lat]), zonaTurf);

// ---------- Atajos del DOM ----------
const $ = id => document.getElementById(id);
const dock = $('dock');

// ---------- Mapa: OpenStreetMap estándar (gratis, SIN API key) ----------
// Attribution a la esquina superior derecha (bajo la barra) para que el panel inferior no la tape.
const map = L.map('map', { zoomControl: false, attributionControl: false }).setView(CENTRO, 12);
L.control.attribution({ position: 'topright', prefix: false }).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const zonaLayer = L.polygon(ZONA, {
  color: '#14A36B', weight: 2, dashArray: '6 6', fillColor: '#14A36B', fillOpacity: 0.06, interactive: false,
}).addTo(map);

// Encuadra dejando espacio libre para la barra superior y el bottom sheet
const encuadrar = bounds => map.fitBounds(bounds, {
  paddingTopLeft: [20, 24], paddingBottomRight: [20, dock.offsetHeight + 30],
});
encuadrar(zonaLayer.getBounds());

// ---------- Estado ----------
const estado = {
  rol: 'cliente',
  objetivo: 'A',                       // qué punto se coloca con el próximo toque
  puntos: { A: null, B: null },        // L.LatLng
  marcadores: { A: null, B: null },
  ruta: null, rutaBorde: null,
  km: 0, precio: 0,
  token: 0,                            // evita que una respuesta vieja pise una nueva
  ctrl: null,
  yo: null,                            // última ubicación GPS
};

// ---------- Utilidades de UI ----------
let toastTimer;
function aviso(msg, ok = false) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (ok ? ' ok' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}
const fmtCoord = ll => `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;

// ---------- Pines A/B arrastrables ----------
function crearPin(tipo) {
  return L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 41],
    html: `<div class="pin pin-${tipo.toLowerCase()}"><span>${tipo}</span></div>`,
  });
}

function seleccionarObjetivo(tipo) {
  estado.objetivo = tipo;
  $('row-A').classList.toggle('is-target', tipo === 'A');
  $('row-B').classList.toggle('is-target', tipo === 'B');
}

function setPunto(tipo, ll) {
  ll = L.latLng(ll);
  estado.puntos[tipo] = ll;
  if (estado.marcadores[tipo]) {
    estado.marcadores[tipo].setLatLng(ll);
  } else {
    const m = L.marker(ll, { icon: crearPin(tipo), draggable: true, autoPan: true }).addTo(map);
    m.on('dragend', () => { estado.puntos[tipo] = m.getLatLng(); actualizar(); });
    estado.marcadores[tipo] = m;
  }
  // Avanza solo al punto que falta (A → B)
  const otro = tipo === 'A' ? 'B' : 'A';
  if (!estado.puntos[otro]) seleccionarObjetivo(otro);
  actualizar();
}

// Tocar el mapa coloca el punto seleccionado (solo en rol Cliente)
map.on('click', e => { if (estado.rol === 'cliente') setPunto(estado.objetivo, e.latlng); });
$('row-A').addEventListener('click', () => seleccionarObjetivo('A'));
$('row-B').addEventListener('click', () => seleccionarObjetivo('B'));

// ---------- Geolocalización ("Mi ubicación") ----------
let marcadorYo, circuloPrecision;
const btnGps = $('btn-gps');

btnGps.addEventListener('click', () => {
  if (!('geolocation' in navigator)) return aviso('Tu navegador no permite usar la ubicación.');
  btnGps.classList.add('loading');
  navigator.geolocation.getCurrentPosition(pos => {
    btnGps.classList.remove('loading');
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    estado.yo = ll;
    if (!marcadorYo) {
      marcadorYo = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false, zIndexOffset: -100,
      }).addTo(map);
      circuloPrecision = L.circle(ll, { radius: pos.coords.accuracy, color: '#2F7BF5', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
    } else {
      marcadorYo.setLatLng(ll); circuloPrecision.setLatLng(ll).setRadius(pos.coords.accuracy);
    }
    map.flyTo(ll, 16, { duration: 0.8 });
    if (estado.rol === 'cliente') $('gps-actions').hidden = false;   // ofrece usarla como A o B
    if (!dentroZona(ll)) aviso('Estás fuera de la zona de servicio de Valencia.');
  }, err => {
    btnGps.classList.remove('loading');
    aviso(err.code === 1
      ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador.'
      : 'No pudimos obtener tu ubicación. Intenta de nuevo al aire libre.');
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
});

// Botones "Usar como recogida / entrega"
document.querySelectorAll('[data-usar]').forEach(b =>
  b.addEventListener('click', () => { if (estado.yo) setPunto(b.dataset.usar, estado.yo); }));

// ---------- Actualización general (textos, geocerca, ruta) ----------
function actualizar() {
  const { A, B } = estado.puntos;
  $('txt-origen').textContent  = A ? `Punto marcado (${fmtCoord(A)})` : 'Toca el mapa para marcar';
  $('txt-destino').textContent = B ? `Punto marcado (${fmtCoord(B)})` : 'Toca el mapa para marcar';

  if (!A || !B) { limpiarRuta(); return resetTarifa('Marca recogida y entrega'); }

  // Validación de geocerca con Turf.js
  const fuera = [];
  if (!dentroZona(A)) fuera.push('la recogida');
  if (!dentroZona(B)) fuera.push('la entrega');
  if (fuera.length) {
    limpiarRuta();
    mostrarAviso(`Fuera de la zona de servicio: mueve ${fuera.join(' y ')} dentro del área verde.`);
    return resetTarifa('Fuera de zona');
  }
  mostrarAviso('');
  pedirRuta(A, B);
}

function mostrarAviso(txt) { const a = $('aviso'); a.textContent = txt; a.hidden = !txt; }

function resetTarifa(txt) {
  $('trip').textContent = txt; $('precio').textContent = '$0.00';
  $('precio').classList.remove('calc'); $('btn-solicitar').disabled = true; estado.precio = 0;
}

function limpiarRuta() {
  if (estado.ctrl) estado.ctrl.abort();
  [estado.ruta, estado.rutaBorde].forEach(l => l && map.removeLayer(l));
  estado.ruta = estado.rutaBorde = null;
}

// ---------- Ruta con OSRM ----------
async function pedirRuta(A, B) {
  const mio = ++estado.token;
  if (estado.ctrl) estado.ctrl.abort();
  estado.ctrl = new AbortController();
  $('precio').classList.add('calc'); $('btn-solicitar').disabled = true; $('trip').textContent = 'Calculando ruta…';

  let km, min, coords = null, aprox = false;
  try {
    const url = `${OSRM_URL}${A.lng},${A.lat};${B.lng},${B.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { signal: estado.ctrl.signal });
    const d = await r.json();
    if (d.code !== 'Ok') throw new Error('Sin ruta');
    km = d.routes[0].distance / 1000;
    min = Math.max(1, Math.round(d.routes[0].duration / 60));
    coords = d.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch (e) {
    if (e.name === 'AbortError') return;                    // llegó una petición más nueva
    // Respaldo: línea recta × 1.35 (aprox. de calles) si OSRM no responde
    km = turf.distance([A.lng, A.lat], [B.lng, B.lat]) * 1.35;
    aprox = true; min = null;
  }
  if (mio !== estado.token) return;

  dibujarRuta(coords || [[A.lat, A.lng], [B.lat, B.lng]], aprox);
  estado.km = km;
  estado.precio = calcularTarifa(km);
  $('trip').textContent = `${aprox ? '≈ ' : ''}${km.toFixed(1)} km${min ? ' · ' + min + ' min' : ''}${aprox ? ' (aprox.)' : ''}`;
  animarPrecio(estado.precio);
  $('btn-solicitar').disabled = false;
}

function dibujarRuta(latlngs, aprox) {
  limpiarRuta();
  estado.rutaBorde = L.polyline(latlngs, { color: '#fff', weight: 9, opacity: 0.95, interactive: false }).addTo(map);
  estado.ruta = L.polyline(latlngs, { color: '#0F2236', weight: 5, dashArray: aprox ? '2 10' : null, lineCap: 'round', interactive: false }).addTo(map);
  encuadrar(estado.ruta.getBounds());
}

// ---------- Tarifa: $1.00 hasta 1.5 km + $0.35 por km adicional ----------
function calcularTarifa(km) {
  const extra = Math.max(0, km - TARIFA.kmIncluidos);
  return Math.round((TARIFA.base + extra * TARIFA.porKmExtra) * 100) / 100;
}

// Animación de conteo del precio
function animarPrecio(destino) {
  const el = $('precio'); el.classList.remove('calc', 'pop'); void el.offsetWidth; el.classList.add('pop');
  const t0 = performance.now(), dur = 450;
  (function paso(t) {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = '$' + (destino * (1 - Math.pow(1 - p, 3))).toFixed(2);
    if (p < 1) requestAnimationFrame(paso); else el.textContent = '$' + destino.toFixed(2);
  })(t0);
}

// ---------- Solicitar (guardado real en Firebase: Paso 3) ----------
$('btn-solicitar').addEventListener('click', () => {
  const pedido = {
    origen: estado.puntos.A, destino: estado.puntos.B,
    km: +estado.km.toFixed(2), precio: estado.precio, detalle: $('pedido-detalle').value.trim(),
  };
  console.log('Pedido listo:', pedido);
  aviso('Pedido listo. En el Paso 3 se guardará en Firebase.', true);
});

// ---------- Selector de rol (solo pruebas) ----------
const botonesRol = document.querySelectorAll('.role');
const paneles = { cliente: $('panel-cliente'), motorizado: $('panel-motorizado'), admin: $('panel-admin') };
botonesRol.forEach(b => b.addEventListener('click', () => {
  estado.rol = b.dataset.role;
  botonesRol.forEach(x => { const on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-selected', on); });
  Object.entries(paneles).forEach(([n, el]) => { el.hidden = n !== estado.rol; });
}));

// Interruptor "Disponible" (visual; Firebase en Paso 3)
$('chk-disponible').addEventListener('change', e => {
  $('txt-disponible').textContent = e.target.checked ? 'Disponible' : 'No disponible';
});

// Bottom sheet: tocar la manija lo minimiza o expande
$('handle').addEventListener('click', () => $('sheet').classList.toggle('is-min'));
