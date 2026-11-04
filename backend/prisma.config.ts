import { defineConfig } from 'prisma/config';

// En Prisma 7 la URL no vive en schema.prisma; solo la usa `prisma db pull`.
process.loadEnvFile?.('.env');

export default defineConfig({
  schema: 'prisma/sqlserver/schema.prisma',
  datasource: {
    url: process.env.SQLSERVER_URL ?? '',
  },
});
