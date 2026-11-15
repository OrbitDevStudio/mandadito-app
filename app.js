/* =========================================================
   MANDADITO · app.js  (Paso 1: mapa + polígono + selector de rol)
   En el Paso 2 añadimos: marcadores A/B, OSRM, Turf y tarifa.
   ========================================================= */

// ---------- Constantes ----------
const CENTRO_VALENCIA = [10.1620, -68.0077];   // [lat, lng]

// Polígono de ZONA ACTIVA de ejemplo (aprox. Valencia urbana).
// Formato Leaflet: [lat, lng]. Ajústalo luego con tus límites reales.
const ZONA_ACTIVA = [
  [10.2150, -68.0700],
  [10.2150, -67.9300],
  [10.1000, -67.9300],
  [10.1000, -68.0700],
];

// ---------- Mapa ----------
// zoomControl desactivado: en celular se hace pinch-zoom y ahorra espacio.
const map = L.map('map', { zoomControl: false }).setView(CENTRO_VALENCIA, 12);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

// Dibuja la zona de servicio
const zonaLayer = L.polygon(ZONA_ACTIVA, {
  color: '#1F9D6B', weight: 2, fillColor: '#1F9D6B', fillOpacity: 0.08,
}).addTo(map);
map.fitBounds(zonaLayer.getBounds());

// ---------- Selector de rol (solo pruebas) ----------
const botonesRol = document.querySelectorAll('.role');
const paneles = {
  cliente:    document.getElementById('panel-cliente'),
  motorizado: document.getElementById('panel-motorizado'),
  admin:      document.getElementById('panel-admin'),
};

function cambiarRol(rol) {
  botonesRol.forEach(b => {
    const activo = b.dataset.role === rol;
    b.classList.toggle('is-active', activo);
    b.setAttribute('aria-selected', activo);
  });
  Object.entries(paneles).forEach(([nombre, el]) => { el.hidden = nombre !== rol; });
  // Al cambiar el alto del panel, Leaflet debe recalcular el tamaño del mapa
  setTimeout(() => map.invalidateSize(), 50);
}
botonesRol.forEach(b => b.addEventListener('click', () => cambiarRol(b.dataset.role)));

// ---------- Interruptor "Disponible" (visual; se conecta a Firebase en Paso 3) ----------
const chkDisp = document.getElementById('chk-disponible');
const txtDisp = document.getElementById('txt-disponible');
chkDisp.addEventListener('change', () => {
  txtDisp.textContent = chkDisp.checked ? 'Disponible' : 'No disponible';
});
