import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaMssql } from '@prisma/adapter-mssql';
import { PrismaClient } from '../generated/prisma/client.js';

// Sin estos límites, una caída de SQL Server deja las peticiones colgadas.
// connectTimeout va en milisegundos y poolTimeout en segundos.
const TIEMPOS_POR_DEFECTO = { connectTimeout: '5000', poolTimeout: '5' };

export function urlConTiempos(url: string): string {
  const presentes = new Set(
    url
      .split(';')
      .slice(1)
      .map((p) => p.split('=')[0]?.trim().toLowerCase()),
  );
  const extra = Object.entries(TIEMPOS_POR_DEFECTO)
    .filter(([k]) => !presentes.has(k.toLowerCase()))
    .map(([k, v]) => `${k}=${v}`);
  return extra.length ? `${url.replace(/;+$/, '')};${extra.join(';')}` : url;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    const url = urlConTiempos(config.getOrThrow<string>('SQLSERVER_URL'));
    super({ adapter: new PrismaMssql(url) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
