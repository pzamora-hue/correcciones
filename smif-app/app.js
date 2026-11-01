require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');
const { COOKIE_NAME } = require('./config/constants');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const estudianteRoutes = require('./routes/estudianteRoutes');
const cursoRoutes = require('./routes/cursoRoutes');
const claseRoutes = require('./routes/claseRoutes');
const tareaRoutes = require('./routes/tareaRoutes');
const { pageGuard } = require('./middleware/authMiddleware');
const initDb = require('./data/initDb');
const seed = require('./data/seed');

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

if (!process.env.SESSION_SECRET) {
  if (isProd) {
    console.error('Falta SESSION_SECRET en las variables de entorno');
    process.exit(1);
  }
  // En desarrollo no bloqueamos el arranque: se genera una clave temporal
  // (las sesiones se pierden al reiniciar). Crea un archivo .env para fijarla.
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('⚠ Falta SESSION_SECRET: usando una clave temporal de desarrollo. Copia .env.example a .env.');
}
if (!process.env.ADMIN_KEY) {
  console.warn('⚠ Falta ADMIN_KEY: no se podrán registrar profesores hasta definirla en .env.');
}

const app = express();
app.disable('x-powered-by');
if (isProd) app.set('trust proxy', 1);   // Render/Railway terminan HTTPS en un proxy

app.use((req, res, next) => {
  if (isProd) {
    // Fuerza HTTPS (el proxy informa el protocolo original) y activa HSTS
    if (req.headers['x-forwarded-proto'] === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  next();
});

// Comprobación de salud para la plataforma (Render healthCheckPath)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok' });
  } catch (e) {
    res.status(503).json({ status: 'db_error' });
  }
});

app.use(express.json({ limit: '10kb' }));

// Sesiones persistidas en PostgreSQL (tabla "session"): sobreviven a reinicios y despliegues
app.use(
  session({
    store: new pgSession({ pool, createTableIfMissing: true }),
    name: COOKIE_NAME,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 1000 * 60 * 60 * 2
    }
  })
);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/estudiantes', estudianteRoutes);
app.use('/api/cursos', cursoRoutes);
app.use('/api/clases', claseRoutes);
app.use('/api/tareas', tareaRoutes);
app.use('/api', userRoutes);
app.use('/api', (req, res) => {
  res.status(404).json({ status: 'fail', message: 'Ruta no encontrada' });
});

// Páginas por rol: el servidor las entrega solo a quien corresponde.
const pagina = (nombre) => (req, res) => res.sendFile(path.join(__dirname, 'public', nombre));
app.get('/panel.html',       pageGuard(),          pagina('panel.html'));
app.get('/alumno.html',      pageGuard('alumno'),  pagina('alumno.html'));
app.get('/docente.html',     pageGuard('docente'), pagina('docente.html'));
app.get('/estudiantes.html', pageGuard('docente'), pagina('estudiantes.html'));
app.get('/cursos.html',      pageGuard('docente'), pagina('cursos.html'));
app.get('/clases.html',      pageGuard('docente'), pagina('clases.html'));
app.get('/clase.html',       pageGuard('docente'), pagina('clase.html'));

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'fail', message: 'JSON inválido' });
  }
  console.error(err);
  res.status(500).json({ status: 'fail', message: 'Error interno del servidor' });
});

// Usuarios de prueba: por defecto solo en desarrollo; en producción solo con SEED_DEMO=true
const debeSembrar = process.env.SEED_DEMO
  ? process.env.SEED_DEMO === 'true'
  : !isProd;

// Traduce los errores típicos de PostgreSQL a un consejo concreto
function explicarErrorDb(error) {
  const e = (error.errors && error.errors[0]) || error;   // AggregateError (IPv4/IPv6)
  const texto = `${e.message || ''} ${e.code || ''}`;
  if (e.code === 'ECONNREFUSED') return 'PostgreSQL no está activo o el host/puerto (DB_HOST, DB_PORT) es incorrecto.';
  if (e.code === '28P01' || /password must be a string|SASL/i.test(texto)) return 'Contraseña de PostgreSQL incorrecta o vacía: revisa DB_PASSWORD en el archivo .env.';
  if (e.code === '3D000') return `La base de datos "${process.env.DB_NAME}" no existe. Créala con: CREATE DATABASE ${process.env.DB_NAME};`;
  return null;
}

initDb()
  .then(() => (debeSembrar ? seed() : console.log('Usuarios de prueba desactivados (SEED_DEMO).')))
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SMIF ejecutándose en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('No se pudo iniciar:', error.message || error.code || error);
    const consejo = explicarErrorDb(error);
    if (consejo) console.error('→', consejo);
    process.exit(1);
  });
