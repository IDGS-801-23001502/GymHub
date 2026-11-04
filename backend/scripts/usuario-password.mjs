// Cambia la contraseña de un usuario del personal (bcrypt, costo 12) y lo desbloquea.
// Uso: npm run usuario:password -- admin@gymhub.dev "NuevaClave#2026"
import bcrypt from 'bcryptjs';
import sql from 'mssql';

process.loadEnvFile?.('.env');

const [correo, password] = process.argv.slice(2);
if (!correo || !password) {
  console.error('Uso: npm run usuario:password -- <correo> <contraseña>');
  process.exit(1);
}
// Misma política que exige CRM-RF-18 para el personal
const robusta =
  password.length >= 10 &&
  /[a-z]/.test(password) &&
  /[A-Z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);
if (!robusta) {
  console.error('La contraseña debe tener 10+ caracteres con mayúscula, minúscula, número y símbolo.');
  process.exit(1);
}
const url = process.env.SQLSERVER_URL;
if (!url) {
  console.error('Define SQLSERVER_URL en backend/.env');
  process.exit(1);
}

// Formato: sqlserver://host:puerto;database=...;user=...;password=...;trustServerCertificate=true
const [hostPuerto, ...partes] = url.replace(/^sqlserver:\/\//, '').split(';');
const p = Object.fromEntries(
  partes.filter(Boolean).map((x) => {
    const [k, ...v] = x.split('=');
    return [k.trim().toLowerCase(), v.join('=').replace(/^\{(.*)\}$/, '$1')];
  }),
);
const [server, port] = hostPuerto.split(':');
const pool = await sql.connect({
  server,
  port: port ? Number(port) : 1433,
  database: p.database,
  user: p.user ?? p.username,
  password: p.password,
  options: { encrypt: p.encrypt === 'true', trustServerCertificate: p.trustservercertificate === 'true' },
});
try {
  const hash = await bcrypt.hash(password, 12);
  const r = await pool
    .request()
    .input('hash', sql.NVarChar(255), hash)
    .input('correo', sql.NVarChar(150), correo.trim().toLowerCase())
    .query('UPDATE usuario SET password_hash = @hash, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE correo = @correo');
  console.log(r.rowsAffected[0] ? `Contraseña actualizada para ${correo}.` : `No existe el usuario ${correo}.`);
} finally {
  await pool.close();
}
