// Respaldo de SQL Server y MongoDB (contenedores Docker) con retención de N días.
//
//   npm run respaldo                       -> crea backups/AAAA-MM-DD_HHmm/
//   npm run respaldo -- --restaurar <dir>  -> restaura ese respaldo (pide confirmación con --si)
//
// Variables: SQLSERVER_URL, MONGODB_URL, SQLSERVER_CONTAINER (mssql_container),
// MONGO_CONTAINER (mongo_container), BACKUP_DIR (backups), BACKUP_DIAS (7).
// Programarlo diario: Programador de tareas de Windows o cron (ver README).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

process.loadEnvFile?.('.env');

const SQL = process.env.SQLSERVER_CONTAINER ?? 'mssql_container';
const MONGO = process.env.MONGO_CONTAINER ?? 'mongo_container';
const DIR = resolve(process.env.BACKUP_DIR ?? 'backups');
const DIAS = Number(process.env.BACKUP_DIAS ?? 7);
const DENTRO = '/var/opt/mssql/backup';

const url = process.env.SQLSERVER_URL;
const mongoUrl = process.env.MONGODB_URL;
if (!url || !mongoUrl) {
  console.error('Define SQLSERVER_URL y MONGODB_URL en backend/.env');
  process.exit(1);
}
const partes = Object.fromEntries(
  url
    .replace(/^sqlserver:\/\/[^;]*;/, '')
    .split(';')
    .filter(Boolean)
    .map((x) => {
      const [k, ...v] = x.split('=');
      return [k.trim().toLowerCase(), v.join('=').replace(/^\{(.*)\}$/, '$1')];
    }),
);
const baseSql = partes.database;
const mongoDb = new URL(mongoUrl).pathname.slice(1) || 'gymhub_rutinas';

const docker = (args, opciones = {}) => execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'inherit'], ...opciones });
// La contraseña viaja como variable de entorno, no en la línea de comandos
const sqlcmd = (consulta) =>
  docker([
    'exec', '-e', `SQLCMDPASSWORD=${partes.password}`, SQL,
    '/opt/mssql-tools18/bin/sqlcmd', '-S', 'localhost', '-U', partes.user, '-C', '-b', '-Q', consulta,
  ]);

function respaldar() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const nombre = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
  const destino = join(DIR, nombre);
  mkdirSync(destino, { recursive: true });

  console.log(`SQL Server: ${baseSql}`);
  docker(['exec', SQL, 'mkdir', '-p', DENTRO]);
  sqlcmd(`BACKUP DATABASE [${baseSql}] TO DISK = N'${DENTRO}/${baseSql}.bak' WITH INIT, CHECKSUM`);
  docker(['cp', `${SQL}:${DENTRO}/${baseSql}.bak`, join(destino, `${baseSql}.bak`)]);
  docker(['exec', SQL, 'rm', '-f', `${DENTRO}/${baseSql}.bak`]);

  console.log(`MongoDB: ${mongoDb}`);
  docker(['exec', MONGO, 'mongodump', `--uri=${mongoUrl}`, '--gzip', '--archive=/tmp/mongo.gz']);
  docker(['cp', `${MONGO}:/tmp/mongo.gz`, join(destino, `${mongoDb}.archive.gz`)]);
  docker(['exec', MONGO, 'rm', '-f', '/tmp/mongo.gz']);

  // Retención: borra respaldos con más de DIAS días
  const limite = Date.now() - DIAS * 86_400_000;
  for (const carpeta of readdirSync(DIR)) {
    const ruta = join(DIR, carpeta);
    if (/^\d{4}-\d{2}-\d{2}_\d{4}$/.test(carpeta) && statSync(ruta).mtimeMs < limite) {
      rmSync(ruta, { recursive: true, force: true });
      console.log(`Eliminado por retención: ${carpeta}`);
    }
  }
  console.log(`Respaldo listo en ${destino}`);
}

function restaurar(carpeta, confirmado) {
  const origen = resolve(DIR, carpeta);
  const bak = join(origen, `${baseSql}.bak`);
  const archivoMongo = join(origen, `${mongoDb}.archive.gz`);
  if (!existsSync(bak) || !existsSync(archivoMongo)) {
    console.error(`No encuentro ${bak} o ${archivoMongo}`);
    process.exit(1);
  }
  if (!confirmado) {
    console.error(`Esto REEMPLAZA ${baseSql} y ${mongoDb} con el respaldo ${carpeta}. Detén el backend y repite con --si.`);
    process.exit(1);
  }
  docker(['exec', SQL, 'mkdir', '-p', DENTRO]);
  docker(['cp', bak, `${SQL}:${DENTRO}/${baseSql}.bak`]);
  sqlcmd(
    `ALTER DATABASE [${baseSql}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ` +
      `RESTORE DATABASE [${baseSql}] FROM DISK = N'${DENTRO}/${baseSql}.bak' WITH REPLACE, CHECKSUM; ` +
      `ALTER DATABASE [${baseSql}] SET MULTI_USER;`,
  );
  docker(['cp', archivoMongo, `${MONGO}:/tmp/mongo.gz`]);
  docker(['exec', MONGO, 'mongorestore', `--uri=${mongoUrl}`, '--gzip', '--archive=/tmp/mongo.gz', '--drop', `--nsInclude=${mongoDb}.*`]);
  docker(['exec', MONGO, 'rm', '-f', '/tmp/mongo.gz']);
  console.log(`Restaurado desde ${origen}`);
}

const args = process.argv.slice(2);
const i = args.indexOf('--restaurar');
if (i >= 0) restaurar(args[i + 1] ?? '', args.includes('--si'));
else respaldar();
