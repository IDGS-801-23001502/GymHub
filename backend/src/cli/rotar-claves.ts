/**
 * Rotación de la clave de cifrado (CRM-RNF-01).
 *
 * 1. Mueve la clave actual a ENCRYPTION_OLD_KEYS ("1:<clave>") y pon la nueva en
 *    ENCRYPTION_KEY con un ENCRYPTION_KEY_ID mayor.
 * 2. npm run build && npm run claves:rotar
 *
 * Re-cifra con la clave activa todo valor que tenga otro id de clave. Es seguro repetirlo.
 * Al terminar ya se puede quitar la clave anterior de ENCRYPTION_OLD_KEYS.
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { CryptoModule } from '../common/crypto/crypto.module.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CryptoModule] })
class RotacionModule {}

const LOTE = 200;

async function main() {
  const log = new Logger('Rotación');
  const app = await NestFactory.createApplicationContext(RotacionModule, { logger: ['log', 'error', 'warn'] });
  const prisma = app.get(PrismaService);
  const crypto = app.get(EncryptionService);
  const rotar = (b: Uint8Array) => (crypto.necesitaRotacion(b) ? crypto.reCifrar(b) : null);

  let socios = 0;
  for (let desde = 0; ; ) {
    const lote = await prisma.socio.findMany({
      where: { id_socio: { gt: desde } },
      orderBy: { id_socio: 'asc' },
      take: LOTE,
      select: { id_socio: true, telefono_cifrado: true, correo_cifrado: true, contacto_emergencia_cifrado: true },
    });
    if (!lote.length) break;
    for (const s of lote) {
      const tel = rotar(s.telefono_cifrado);
      const correo = rotar(s.correo_cifrado);
      const emergencia = rotar(s.contacto_emergencia_cifrado);
      if (tel || correo || emergencia) {
        await prisma.socio.update({
          where: { id_socio: s.id_socio },
          data: {
            ...(tel && { telefono_cifrado: tel }),
            ...(correo && { correo_cifrado: correo }),
            ...(emergencia && { contacto_emergencia_cifrado: emergencia }),
          },
        });
        socios++;
      }
    }
    desde = lote[lote.length - 1].id_socio;
  }

  let fichas = 0;
  for (let desde = 0; ; ) {
    const lote = await prisma.fichaSalud.findMany({
      where: { id_ficha: { gt: desde } },
      orderBy: { id_ficha: 'asc' },
      take: LOTE,
      select: { id_ficha: true, datos_cifrados: true },
    });
    if (!lote.length) break;
    for (const f of lote) {
      const nuevo = rotar(f.datos_cifrados);
      if (nuevo) {
        await prisma.fichaSalud.update({ where: { id_ficha: f.id_ficha }, data: { datos_cifrados: nuevo } });
        fichas++;
      }
    }
    desde = lote[lote.length - 1].id_ficha;
  }

  log.log(`Listo: ${socios} socios y ${fichas} fichas de salud re-cifrados.`);
  await app.close();
}

await main();
