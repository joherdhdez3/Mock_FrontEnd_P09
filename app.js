'use strict';

/*
  Monitor de notificaciones de productos (práctica 9).

  Solo el microservicio de Productos dispara notificaciones, así que esta
  pantalla espera exactamente dos eventos:
    - producto_creado
    - producto_actualizado

  Formato esperado del mensaje (el de la especificación):
    { "evento": "producto_creado", "datos": { "id": "...", "name": "...", "price": 450.0 } }

  Cualquier otro evento, o un mensaje que no sea JSON, se muestra marcado como
  "no esperado" para que sea fácil detectar una implementación que se aparta
  de la especificación.
*/

const EVENTOS = {
  producto_creado:      { clase: 'creado',      titulo: 'Producto creado',      contador: 'creados' },
  producto_actualizado: { clase: 'actualizado', titulo: 'Producto actualizado', contador: 'actualizados' },
};

const MAX_EVENTOS = 100;               // para que la lista no crezca sin límite
const CLAVE_URL = 'mock-notificaciones:url';

const $ = (id) => document.getElementById(id);

const el = {
  estado: $('estado'),
  detalle: $('detalle'),
  form: $('form-conexion'),
  url: $('url'),
  token: $('token'),
  btnConectar: $('btn-conectar'),
  btnDesconectar: $('btn-desconectar'),
  btnLimpiar: $('btn-limpiar'),
  lista: $('lista-eventos'),
  vacioEventos: $('vacio-eventos'),
  vacioProductos: $('vacio-productos'),
  tablaScroll: $('tabla-scroll'),
  tabla: $('tabla-productos'),
  contadores: {
    creados: $('n-creados'),
    actualizados: $('n-actualizados'),
    otros: $('n-otros'),
  },
};

let socket = null;
const productos = new Map();           // id -> último estado conocido del producto
const conteo = { creados: 0, actualizados: 0, otros: 0 };

/* ---------- Utilidades ---------- */

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;   // textContent: nunca interpreta HTML
  return nodo;
}

function horaActual() {
  return new Date().toLocaleTimeString('es-MX', { hour12: false });
}

function formatearPrecio(valor) {
  if (valor === undefined || valor === null || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatearEstado(valor) {
  if (valor === true) return 'Activo';
  if (valor === false) return 'Inactivo';
  return '—';
}

/* Los frameworks pueden nombrar los campos en inglés (name, price) o en
   español (nombre, precio). Aquí se aceptan ambos para no bloquear la prueba. */
function normalizar(datos) {
  const d = datos && typeof datos === 'object' ? datos : {};
  return {
    id: d.id ?? null,
    nombre: d.name ?? d.nombre,
    precio: d.price ?? d.precio,
    estado: d.status ?? d.estado,
  };
}

/* ---------- Estado de la conexión ---------- */

function setEstado(tipo, texto, detalle = '') {
  el.estado.className = `estado estado-${tipo}`;
  el.estado.textContent = texto;
  el.detalle.textContent = detalle;
}

function bloquearCampos(conectado) {
  el.url.disabled = conectado;
  el.token.disabled = conectado;
  el.btnConectar.disabled = conectado;
  el.btnDesconectar.disabled = !conectado;
}

function construirUrl() {
  const url = new URL(el.url.value.trim());       // lanza si la URL no es válida
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('La URL debe empezar con ws:// o wss://');
  }
  const token = el.token.value.trim();
  if (token) url.searchParams.set('token', token); // el JWT viaja en el handshake
  return url.toString();
}

function conectar(evento) {
  evento.preventDefault();
  if (socket) return;

  let destino;
  try {
    destino = construirUrl();
  } catch (error) {
    setEstado('desconectado', 'Desconectado', error.message);
    return;
  }

  guardarUrl();
  setEstado('conectando', 'Conectando…');
  bloquearCampos(true);

  const ws = new WebSocket(destino);
  socket = ws;
  let abierto = false;

  ws.addEventListener('open', () => {
    abierto = true;
    setEstado('conectado', 'Conectado', 'Esperando eventos de productos.');
  });

  ws.addEventListener('message', (e) => recibir(e.data));

  ws.addEventListener('close', (e) => {
    socket = null;
    bloquearCampos(false);

    let detalle;
    if (!abierto) {
      detalle = 'No se pudo abrir la conexión. Revisa que el Gateway esté en ejecución, ' +
                'que la URL sea correcta y que el token sea válido.';
    } else if (e.code === 1000) {
      detalle = 'Conexión cerrada.';
    } else if (e.code === 1008) {
      detalle = 'El servidor cerró la conexión por política (1008). Revisa el token.';
    } else {
      detalle = `Se perdió la conexión (código ${e.code}).`;
    }
    setEstado('desconectado', 'Desconectado', detalle);
  });
}

function desconectar() {
  if (socket) socket.close(1000, 'Cierre solicitado por el usuario');
}

/* ---------- Recepción de mensajes ---------- */

function recibir(texto) {
  const hora = horaActual();

  let mensaje;
  try {
    mensaje = JSON.parse(texto);
  } catch {
    conteo.otros++;
    agregarEvento({
      clase: 'otro', titulo: 'Mensaje no válido', hora,
      resumen: 'El mensaje no es JSON.',
      crudo: String(texto),
    });
    return finalizarRecepcion();
  }

  const nombreEvento = mensaje?.evento ?? mensaje?.event;
  const datos = mensaje?.datos ?? mensaje?.data;
  const definicion = EVENTOS[nombreEvento];

  if (!definicion) {
    conteo.otros++;
    agregarEvento({
      clase: 'otro', titulo: 'Evento no esperado', hora,
      resumen: `Llegó «${nombreEvento ?? 'sin nombre'}». Esta práctica solo define ` +
               'producto_creado y producto_actualizado.',
      crudo: JSON.stringify(mensaje, null, 2),
    });
    return finalizarRecepcion();
  }

  conteo[definicion.contador]++;
  const producto = normalizar(datos);
  const conocido = producto.id !== null && productos.has(String(producto.id));

  const evento = {
    clase: definicion.clase,
    titulo: definicion.titulo,
    hora,
    resumen: describirProducto(producto),
    id: producto.id,
    crudo: JSON.stringify(mensaje, null, 2),
  };

  if (producto.id === null) {
    evento.aviso = 'Los datos no incluyen «id»; no se pudo actualizar la tabla.';
  } else {
    if (definicion.clase === 'actualizado' && !conocido) {
      evento.nota = 'Este producto no se había visto antes; la tabla solo muestra los campos que llegaron en este evento.';
    }
    actualizarTabla(producto, definicion, hora);
  }

  agregarEvento(evento);
  finalizarRecepcion();
}

function describirProducto(p) {
  const partes = [];
  if (p.nombre !== undefined) partes.push(String(p.nombre));
  if (p.precio !== undefined) partes.push(`precio ${formatearPrecio(p.precio)}`);
  if (p.estado === true || p.estado === false) partes.push(p.estado ? 'activo' : 'inactivo');
  return partes.length ? partes.join(', ') : 'Sin datos del producto.';
}

/* ---------- Pintar la lista de eventos ---------- */

function agregarEvento(e) {
  const item = crear('li', `evento evento-${e.clase} nuevo`);

  const cabecera = crear('div', 'evento-cabecera');
  cabecera.append(crear('span', 'tipo', e.titulo), crear('time', '', e.hora));
  item.append(cabecera, crear('p', 'evento-resumen', e.resumen));

  if (e.id !== undefined && e.id !== null) item.append(crear('p', 'id', `id ${e.id}`));
  if (e.aviso) item.append(crear('p', 'aviso', e.aviso));
  if (e.nota) item.append(crear('p', 'nota', e.nota));

  const detalles = crear('details');
  detalles.append(crear('summary', '', 'Ver mensaje completo'), crear('pre', '', e.crudo));
  item.append(detalles);

  el.lista.prepend(item);                          // el más reciente arriba
  while (el.lista.children.length > MAX_EVENTOS) el.lista.lastElementChild.remove();
}

/* ---------- Tabla de productos ---------- */

function actualizarTabla(p, definicion, hora) {
  const clave = String(p.id);
  const previo = productos.get(clave) ?? {};
  const actual = { ...previo, id: p.id, ultimo: definicion, hora };

  // En una actualización parcial solo llegan algunos campos: se conservan los anteriores.
  for (const campo of ['nombre', 'precio', 'estado']) {
    if (p[campo] !== undefined) actual[campo] = p[campo];
  }

  productos.delete(clave);                         // al reinsertar, queda como el más reciente
  productos.set(clave, actual);
  pintarTabla(clave);
}

function pintarTabla(claveResaltada) {
  el.tabla.replaceChildren();

  for (const [clave, p] of [...productos.entries()].reverse()) {
    const fila = crear('tr', `fila-${p.ultimo.clase}`);
    if (clave === claveResaltada) fila.classList.add('nuevo');

    const ultimo = crear('td');
    ultimo.append(crear('span', `etiqueta etiqueta-${p.ultimo.clase}`, p.ultimo.clase === 'creado' ? 'Creado' : 'Actualizado'),
                  document.createTextNode(' '),
                  crear('time', '', p.hora));

    fila.append(
      crear('td', 'id-celda', String(p.id)),
      crear('td', '', p.nombre !== undefined ? String(p.nombre) : '—'),
      crear('td', 'num', formatearPrecio(p.precio)),
      crear('td', '', formatearEstado(p.estado)),
      ultimo,
    );
    el.tabla.append(fila);
  }
}

/* ---------- Contadores, vacíos y limpieza ---------- */

function finalizarRecepcion() {
  el.contadores.creados.textContent = conteo.creados;
  el.contadores.actualizados.textContent = conteo.actualizados;
  el.contadores.otros.textContent = conteo.otros;
  actualizarVacios();
}

function actualizarVacios() {
  const hayEventos = el.lista.children.length > 0;
  el.vacioEventos.hidden = hayEventos;
  el.lista.hidden = !hayEventos;

  const hayProductos = productos.size > 0;
  el.vacioProductos.hidden = hayProductos;
  el.tablaScroll.hidden = !hayProductos;
}

function limpiar() {
  el.lista.replaceChildren();
  el.tabla.replaceChildren();
  productos.clear();
  conteo.creados = conteo.actualizados = conteo.otros = 0;
  finalizarRecepcion();
}

/* ---------- Persistencia de la URL (el token nunca se guarda) ---------- */

function guardarUrl() {
  try { localStorage.setItem(CLAVE_URL, el.url.value.trim()); } catch { /* sin almacenamiento */ }
}

function cargarUrl() {
  try {
    const guardada = localStorage.getItem(CLAVE_URL);
    if (guardada) el.url.value = guardada;
  } catch { /* sin almacenamiento */ }
}

/* ---------- Inicio ---------- */

cargarUrl();
el.form.addEventListener('submit', conectar);
el.btnDesconectar.addEventListener('click', desconectar);
el.btnLimpiar.addEventListener('click', limpiar);
setEstado('desconectado', 'Desconectado');
finalizarRecepcion();
