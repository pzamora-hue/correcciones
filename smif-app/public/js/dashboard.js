// Lógica común de los paneles. Cada página declara su rol en <body data-rol="...">.
const message = document.getElementById('message');
const ROL_PAGINA = document.body.dataset.rol;
const PANEL_POR_ROL = { alumno: 'alumno.html', docente: 'docente.html' };

// Secciones que aún no están implementadas
const SECCIONES = {
  alumno: ['Resultados de pruebas', 'Pago de matrícula', 'Ubicación'],
  docente: ['Registro de notas', 'Ubicación']
};
const ETIQUETAS = {
  clases: 'Clases', cursos: 'Cursos', estudiantes: 'Estudiantes registrados',
  alumnos: 'Cuentas de estudiantes', tareas_pendientes: 'Tareas pendientes'
};

const celda = (valor) => { const td = document.createElement('td'); td.textContent = String(valor ?? ''); return td; };
function filaVacia(tbody, columnas, texto) {
  const tr = document.createElement('tr'); const td = document.createElement('td');
  td.colSpan = columnas; td.textContent = texto; tr.appendChild(td); tbody.appendChild(tr);
}

async function cargarPanel() {
  const res = await api.perfil();
  if (res.status === 401) { window.location.replace('login.html'); return false; }
  if (!res.ok) { message.textContent = res.data.message; message.className = 'alert alert-danger'; return false; }

  const u = res.data.data;
  // Si el rol de la sesión no es el de esta página, ir al panel correcto
  if (u.rol !== ROL_PAGINA) { window.location.replace(PANEL_POR_ROL[u.rol] || 'login.html'); return false; }

  document.getElementById('saludo').textContent = `Bienvenido, ${u.nombre}`;
  const badge = document.getElementById('rolBadge');
  badge.textContent = u.rol === 'docente' ? 'profesor' : 'estudiante';
  badge.classList.replace('text-bg-secondary', u.rol === 'docente' ? 'text-bg-warning' : 'text-bg-primary');

  const set = (id, v) => { document.getElementById(id).textContent = v || '—'; };
  set('dDni', u.dni); set('dEmail', u.email); set('dCelular', u.celular);
  set('dNombre', [u.nombre, u.apellidos].filter(Boolean).join(' '));
  if (u.rol === 'alumno') { set('dCiclo', u.ciclo); set('dModalidad', u.modalidad); }
  else { set('dEspecialidad', u.especialidad); }

  const grid = document.getElementById('secciones');
  (SECCIONES[u.rol] || []).forEach((nombre) => {
    const col = document.createElement('div'); col.className = 'col-6 col-md-4';
    const card = document.createElement('div'); card.className = 'card h-100 shadow-sm text-center';
    const body = document.createElement('div'); body.className = 'card-body py-4';
    const h = document.createElement('h3'); h.className = 'h6 fw-bold mb-1'; h.textContent = nombre;
    const sm = document.createElement('small'); sm.className = 'text-muted'; sm.textContent = 'Próximamente';
    body.append(h, sm); card.appendChild(body); col.appendChild(card); grid.appendChild(col);
  });
  return true;
}

// ---------- contadores ----------
async function cargarResumen() {
  const res = await api.resumen();
  const cont = document.getElementById('resumen');
  if (!res.ok || !cont) return;
  cont.replaceChildren();
  Object.entries(res.data.data).forEach(([clave, valor]) => {
    const col = document.createElement('div'); col.className = 'col-6 col-md-3';
    const card = document.createElement('div'); card.className = 'card shadow-sm text-center h-100';
    const body = document.createElement('div'); body.className = 'card-body';
    const n = document.createElement('div'); n.className = 'stat'; n.textContent = String(valor);
    const t = document.createElement('small'); t.className = 'text-muted'; t.textContent = ETIQUETAS[clave] || clave;
    body.append(n, t); card.appendChild(body); col.appendChild(card); cont.appendChild(col);
  });
}

// ---------- estudiante: cursos disponibles (antes se quedaba en "Cargando...") ----------
async function cargarCursosAlumno() {
  const tbody = document.getElementById('tablaCursosAlumno');
  if (!tbody) return;
  const res = await api.listarCursos();
  tbody.replaceChildren();
  const filas = res.ok ? res.data.data : [];
  if (filas.length === 0) return filaVacia(tbody, 4, res.ok ? 'Aún no hay cursos registrados.' : 'No se pudieron cargar los cursos.');
  filas.forEach((c) => {
    const tr = document.createElement('tr');
    tr.append(celda(c.codigo), celda(c.nombre), celda(c.creditos), celda(c.ciclo));
    tbody.appendChild(tr);
  });
}

// ---------- profesor: resumen de sus clases ----------
async function cargarClasesDocente() {
  const tbody = document.getElementById('tablaClasesDocente');
  if (!tbody) return;
  const res = await api.listarClases();
  tbody.replaceChildren();
  const filas = res.ok ? res.data.data : [];
  if (filas.length === 0) return filaVacia(tbody, 4, 'Aún no has creado clases.');
  filas.forEach((c) => {
    const tr = document.createElement('tr');
    tr.append(celda(c.nombre), celda(textoHorario(c)), celda(c.total_alumnos), celda(c.total_tareas));
    tbody.appendChild(tr);
  });
}

// ---------- estudiante: horario (sus clases) ----------
async function cargarClasesAlumno() {
  const tbody = document.getElementById('tablaClasesAlumno');
  if (!tbody) return;
  const res = await api.listarClases();
  tbody.replaceChildren();
  const filas = res.ok ? res.data.data : [];
  if (filas.length === 0) return filaVacia(tbody, 3, 'Todavía no estás inscrito en ninguna clase.');
  filas.forEach((c) => {
    const tr = document.createElement('tr');
    tr.append(celda(textoHorario(c)), celda(c.nombre), celda(c.docente));
    tbody.appendChild(tr);
  });
}

// ---------- estudiante: sus tareas (solo puede marcarlas como hechas) ----------
async function cargarTareasAlumno() {
  const cont = document.getElementById('listaTareas');
  if (!cont) return;
  const res = await api.misTareas();
  cont.replaceChildren();
  const tareas = res.ok ? res.data.data : [];
  if (tareas.length === 0) { cont.textContent = 'No tienes tareas asignadas.'; return; }
  tareas.forEach((t) => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-start gap-3';
    const info = document.createElement('div');
    const titulo = document.createElement('div'); titulo.className = 'fw-bold'; titulo.textContent = t.titulo;
    const meta = document.createElement('small'); meta.className = 'text-muted d-block';
    meta.textContent = `${t.clase}${t.fecha_limite ? ' · Entrega: ' + t.fecha_limite : ''}`;
    info.append(titulo, meta);
    if (t.descripcion) { const d = document.createElement('div'); d.className = 'small'; d.textContent = t.descripcion; info.appendChild(d); }
    item.appendChild(info);
    if (t.hecha) {
      const ok = document.createElement('span'); ok.className = 'badge text-bg-success align-self-center'; ok.textContent = 'Hecha ✔';
      item.appendChild(ok);
    } else {
      const b = document.createElement('button'); b.className = 'btn btn-sm btn-smif-azul text-nowrap';
      b.textContent = 'Marcar como hecha';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await api.marcarTareaHecha(t.id);
        if (!r.ok) { alert(r.data.message || 'No se pudo marcar la tarea'); b.disabled = false; return; }
        await cargarTareasAlumno(); await cargarResumen();
      });
      item.appendChild(b);
    }
    cont.appendChild(item);
  });
}

document.getElementById('logoutButton').addEventListener('click', async () => {
  await api.logout();
  window.location.href = 'login.html';
});

cargarPanel().then((ok) => {
  if (!ok) return;
  cargarResumen(); cargarCursosAlumno(); cargarClasesDocente(); cargarClasesAlumno(); cargarTareasAlumno();
});
