// Genera un JWT de personal SOLO para desarrollo, mientras no exista el
// login del módulo de Usuarios (CRM-RF-18).
//
// Uso:
//   npm run token:dev -- --usuario 1 --rol administrador --sedes 1,2 --admin-general
//
// El id de usuario debe existir en la tabla `usuario` (se usa como FK en
// pagos, bitácora, etc.). Ver database/sqlserver/seed_dev.sql.
import jwt from 'jsonwebtoken';

process.loadEnvFile?.('.env');

if (process.env.NODE_ENV === 'production') {
  console.error('token-dev no se puede usar en producción.');
  process.exit(1);
}

const args = process.argv.slice(2);
const valor = (nombre, defecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : defecto;
};

const rol = valor('rol', 'administrador');
if (!['administrador', 'recepcionista', 'entrenador'].includes(rol)) {
  console.error('--rol debe ser administrador, recepcionista o entrenador');
  process.exit(1);
}
const secreto = process.env.JWT_SECRET;
if (!secreto) {
  console.error('Define JWT_SECRET en backend/.env');
  process.exit(1);
}

const payload = {
  sub: Number(valor('usuario', '1')),
  rol,
  sedes: valor('sedes', '1').split(',').map(Number),
  admin_general: args.includes('--admin-general'),
};
console.log(jwt.sign(payload, secreto, { expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' }));
