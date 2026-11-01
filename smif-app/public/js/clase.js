const claseId = new URLSearchParams(window.location.search).get('id');
const form = document.getElementById('formTarea');
const tabla = document.getElementById('tablaTareas');
const message = document.getElementById('message');
const btnGuardar = document.getElementById('btnGuardar');
const btnCancelar = document.getElementById('btnCancelar');
const formTitulo = document.getElementById('formTitulo');
const $ = (id) => document.getElementById(id);
let tareas = [];

function msg(texto, tipo) {
  message.textContent = texto || '';
  const clase = { error: 'danger', success: 'success' }[tipo] || 'secondary';
  message.className = texto ? `alert alert-${clase} mt-3 mb-0` : 'd-none';
}
function manejarAcceso(res) {
  if (res.status === 401) { window.location.href = 'login.html'; return true; }
  if (res.status === 403) { window.location.href = 'panel.html'; return true; }
  if (res.status === 404 || res.status === 400) { window.location.href = 'clases.html'; return true; }   // clase inexistente o ID inválido
  return false;
}
function boton(texto, clase, fn) {
  const b = document.createElement('button');
  b.className = `btn btn-sm ${clase}`; b.textContent = texto; b.addEventListener('click', fn);
  return b;
}

async function cargarClase() {
  const res = await api.obtenerClase(claseId);
  if (manejarAcceso(res)) return false;
  if (!res.ok) { msg(res.data.message || 'No se pudo cargar la clase', 'error'); return false; }
  const c = res.data.data;
  $('tituloClase').textContent = c.nombre;
  $('detalleClase').textContent = `${textoHorario(c)} · ${c.alumnos.length} alumno(s)`;
  const ul = $('listaAlumnos'); ul.replaceChildren();
  if (c.alumnos.length === 0) { ul.textContent = 'Sin alumnos asignados.'; return true; }
  c.alumnos.forEach((a) => { const li = document.createElement('li'); li.textContent = `${a.apellidos}, ${a.nombre}`; ul.appendChild(li); });
  return true;
}

function filaTarea(t) {
  const tr = document.createElement('tr');
  const celdaTitulo = document.createElement('td');
  const strong = document.createElement('strong'); strong.textContent = t.titulo;
  celdaTitulo.appendChild(strong);
  if (t.descripcion) { const sm = document.createElement('div'); sm.className = 'small text-muted'; sm.textContent = t.descripcion; celdaTitulo.appendChild(sm); }
  const limite = document.createElement('td'); limite.textContent = t.fecha_limite || '—';
  const hechas = document.createElement('td'); hechas.textContent = `${t.hechas} / ${t.total}`;
  const acc = document.createElement('td'); acc.className = 'text-nowrap';
  acc.append(boton('Estado', 'btn-outline-secondary me-1', () => alternarEstado(t.id, tr)),
             boton('Editar', 'btn-outline-primary me-1', () => editar(t.id)),
             boton('Eliminar', 'btn-outline-danger', () => eliminar(t.id)));
  tr.append(celdaTitulo, limite, hechas, acc);
  return tr;
}

async function cargarTareas() {
  const res = await api.tareasDeClase(claseId);
  if (manejarAcceso(res)) return;
  if (!res.ok) return msg(res.data.message || 'No se pudieron cargar las tareas', 'error');
  tareas = res.data.data;
  tabla.replaceChildren();
  if (tareas.length === 0) {
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 4; td.textContent = 'Esta clase todavía no tiene tareas.'; tr.appendChild(td); tabla.appendChild(tr); return;
  }
  tareas.forEach((t) => tabla.appendChild(filaTarea(t)));
}

// Muestra / oculta quién hizo la tarea
async function alternarEstado(id, tr) {
  const siguiente = tr.nextElementSibling;
  if (siguiente && siguiente.dataset.estadoDe === String(id)) { siguiente.remove(); return; }
  const res = await api.estadoTarea(id);
  if (manejarAcceso(res)) return;
  if (!res.ok) return msg(res.data.message || 'No se pudo obtener el estado', 'error');
  const fila = document.createElement('tr'); fila.dataset.estadoDe = String(id);
  const td = document.createElement('td'); td.colSpan = 4; td.className = 'bg-light';
  if (res.data.data.length === 0) td.textContent = 'No hay alumnos en la clase.';
  res.data.data.forEach((a) => {
    const div = document.createElement('div');
    div.textContent = `${a.hecha ? '✔' : '○'} ${a.apellidos}, ${a.nombre} — ${a.hecha ? 'hecha' : 'pendiente'}`;
    td.appendChild(div);
  });
  fila.appendChild(td); tr.after(fila);
}

function editar(id) {
  const t = tareas.find((x) => x.id === id);
  if (!t) return;
  $('id').value = t.id; $('titulo').value = t.titulo; $('descripcion').value = t.descripcion || ''; $('fecha').value = t.fecha_limite || '';
  formTitulo.textContent = 'Editar tarea'; btnGuardar.textContent = 'Guardar cambios';
  btnCancelar.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function limpiar() {
  form.reset(); $('id').value = '';
  formTitulo.textContent = 'Nueva tarea'; btnGuardar.textContent = 'Crear tarea';
  btnCancelar.classList.add('hidden');
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const datos = { titulo: $('titulo').value.trim(), descripcion: $('descripcion').value.trim(), fecha_limite: $('fecha').value };
  if (!datos.titulo) return msg('El título es obligatorio', 'error');
  const id = $('id').value;
  btnGuardar.disabled = true;
  const res = id ? await api.actualizarTarea(id, datos) : await api.crearTarea(claseId, datos);
  btnGuardar.disabled = false;
  if (res.status === 401 || res.status === 403) return manejarAcceso(res);
  if (!res.ok) return msg(res.data.message || 'Error en la operación', 'error');
  msg(res.data.message, 'success'); limpiar(); await cargarTareas();
});

async function eliminar(id) {
  if (!confirm('¿Eliminar esta tarea?')) return;
  const res = await api.eliminarTarea(id);
  if (res.status === 401 || res.status === 403) return manejarAcceso(res);
  if (!res.ok) return msg(res.data.message, 'error');
  msg(res.data.message, 'success'); await cargarTareas();
}

btnCancelar.addEventListener('click', limpiar);
$('logoutButton').addEventListener('click', async () => { await api.logout(); window.location.href = 'login.html'; });
if (!claseId) window.location.href = 'clases.html';
else cargarClase().then((ok) => { if (ok) cargarTareas(); });
