/**
 * Las pruebas e2e corren contra COPIAS de las bases (gimnasio_crm_test y gymhub_rutinas_test),
 * nunca contra las de desarrollo. Ver "Pruebas e2e" en el README del backend.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.loadEnvFile?.('.env');
const sql = process.env.SQLSERVER_URL ?? '';
const mongo = process.env.MONGODB_URL ?? '';
process.env.SQLSERVER_URL = process.env.SQLSERVER_URL_TEST ?? sql.replace(/database=[^;]+/i, 'database=gimnasio_crm_test');
process.env.MONGODB_URL = process.env.MONGODB_URL_TEST ?? mongo.replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');
if (!/database=\w+_test/i.test(process.env.SQLSERVER_URL) || !/_test(\?|$)/.test(process.env.MONGODB_URL)) {
  throw new Error('Las pruebas e2e solo corren contra bases *_test.');
}
// En equipos lentos la primera conexión TLS a SQL Server tarda varios segundos
if (!/connectTimeout=/i.test(process.env.SQLSERVER_URL)) process.env.SQLSERVER_URL += ';connectTimeout=30000;poolTimeout=30';
process.env.NODE_ENV = 'test';
process.env.SWAGGER = 'false';
process.env.REDIS_URL = '';
process.env.UPLOADS_DIR = join(tmpdir(), 'gymhub-e2e-uploads');
