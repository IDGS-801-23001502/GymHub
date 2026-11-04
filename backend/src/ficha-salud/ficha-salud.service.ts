import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../common/audit/audit.service.js';
import { esPersonal, type Actor, type ContextoPeticion } from '../common/auth/auth.types.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { Prisma, type FichaSalud } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { obtenerSocioAutorizado } from '../socios/socio-acceso.js';
import type { GuardarFichaSaludDto } from './dto/ficha-salud.dto.js';

export interface DatosClinicos {
  antecedentes: string | null;
  lesiones: string | null;
  alergias: string | null;
  medicamentos: string | null;
}

const CAMPOS_CLINICOS = ['antecedentes', 'lesiones', 'alergias', 'medicamentos'] as const;

/** Ficha de salud versionada y cifrada (CRM-RF-05); cada guardado crea una versión. */
@Injectable()
export class FichaSaludService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  async guardar(idSocio: number, dto: GuardarFichaSaludDto, ctx: Actor) {
    const tieneDatos =
      CAMPOS_CLINICOS.some((c) => dto[c]) ||
      dto.nivel_actividad !== undefined ||
      dto.objetivo !== undefined ||
      (dto.restricciones_rutina?.length ?? 0) > 0;
    if (!tieneDatos) {
      throw new BadRequestException('La ficha de salud no contiene datos.');
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await obtenerSocioAutorizado(tx, idSocio, esPersonal(ctx) ? ctx.usuario : null);

          // Consentimiento para datos de salud (CRM-RNF-02): último registro vigente
          const consentimiento = await tx.consentimiento.findFirst({
            where: { id_socio: idSocio, tipo: 'datos_salud' },
            orderBy: [{ fecha: 'desc' }, { id_consentimiento: 'desc' }],
          });
          if (!consentimiento?.otorgado) {
            if (dto.acepta_tratamiento_datos_salud !== true) {
              throw new BadRequestException(
                'El socio debe aceptar el tratamiento de sus datos de salud (acepta_tratamiento_datos_salud).',
              );
            }
            const aviso = await tx.avisoPrivacidad.findFirst({
              orderBy: { vigente_desde: 'desc' },
              select: { id_aviso: true },
            });
            await tx.consentimiento.create({
              data: {
                id_socio: idSocio,
                tipo: 'datos_salud',
                id_aviso: aviso?.id_aviso ?? null,
                otorgado: true,
                origen: esPersonal(ctx) ? 'crm' : 'app',
              },
            });
          }

          const ultima = await tx.fichaSalud.aggregate({
            where: { id_socio: idSocio },
            _max: { version: true },
          });
          const version = (ultima._max.version ?? 0) + 1;
          const datos: DatosClinicos = {
            antecedentes: dto.antecedentes || null,
            lesiones: dto.lesiones || null,
            alergias: dto.alergias || null,
            medicamentos: dto.medicamentos || null,
          };

          const ficha = await tx.fichaSalud.create({
            data: {
              id_socio: idSocio,
              version,
              datos_cifrados: this.crypto.cifrarJson(datos),
              nivel_actividad: dto.nivel_actividad ?? null,
              objetivo: dto.objetivo ?? null,
              restricciones_rutina: dto.restricciones_rutina
                ? JSON.stringify(dto.restricciones_rutina)
                : null,
              origen: esPersonal(ctx) ? 'crm' : 'app',
              borrador: dto.borrador ?? false,
              actualizado_por_usuario: esPersonal(ctx) ? ctx.usuario.id_usuario : null,
            },
          });

          await this.audit.registrar(
            ctx,
            {
              entidad: 'ficha_salud',
              idEntidad: ficha.id_ficha,
              idSocio,
              accion: 'crear',
              // Sin valores clínicos en claro: solo qué se capturó
              nuevo: {
                version,
                borrador: ficha.borrador,
                campos_clinicos: CAMPOS_CLINICOS.filter((c) => datos[c] !== null),
                nivel_actividad: ficha.nivel_actividad,
              },
            },
            tx,
          );
          return this.mapear(ficha, datos, null);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Otra persona guardó la ficha al mismo tiempo; vuelve a intentarlo.',
        );
      }
      throw error;
    }
  }

  /** Versión más reciente, descifrada. Solo administrador y entrenador. */
  async obtenerActual(idSocio: number, ctx: Actor) {
    await obtenerSocioAutorizado(this.prisma, idSocio, esPersonal(ctx) ? ctx.usuario : null);
    const ficha = await this.prisma.fichaSalud.findFirst({
      where: { id_socio: idSocio },
      orderBy: { version: 'desc' },
      include: { actualizado_por: { select: { id_usuario: true, nombre: true } } },
    });
    if (!ficha) throw new NotFoundException('El socio no tiene ficha de salud.');
    return this.consultar(ficha, ctx);
  }

  async obtenerVersion(idSocio: number, version: number, ctx: ContextoPeticion) {
    await obtenerSocioAutorizado(this.prisma, idSocio, ctx.usuario);
    const ficha = await this.prisma.fichaSalud.findUnique({
      where: { id_socio_version: { id_socio: idSocio, version } },
      include: { actualizado_por: { select: { id_usuario: true, nombre: true } } },
    });
    if (!ficha) throw new NotFoundException('Versión de ficha no encontrada.');
    return this.consultar(ficha, ctx);
  }

  /** Historial de versiones sin datos clínicos (fecha, responsable, origen). */
  async versiones(idSocio: number, ctx: ContextoPeticion) {
    await obtenerSocioAutorizado(this.prisma, idSocio, ctx.usuario);
    const fichas = await this.prisma.fichaSalud.findMany({
      where: { id_socio: idSocio },
      orderBy: { version: 'desc' },
      select: {
        id_ficha: true,
        version: true,
        origen: true,
        borrador: true,
        nivel_actividad: true,
        creado_en: true,
        actualizado_por: { select: { id_usuario: true, nombre: true } },
      },
    });
    return fichas;
  }

  private async consultar(
    ficha: FichaSalud & { actualizado_por: { id_usuario: number; nombre: string } | null },
    ctx: Actor,
  ) {
    await this.audit.registrar(ctx, {
      entidad: 'ficha_salud',
      idEntidad: ficha.id_ficha,
      idSocio: ficha.id_socio,
      accion: 'consulta',
      nuevo: { version: ficha.version },
    });
    return this.mapear(
      ficha,
      this.crypto.descifrarJson<DatosClinicos>(ficha.datos_cifrados),
      ficha.actualizado_por,
    );
  }

  private mapear(
    ficha: FichaSalud,
    datos: DatosClinicos,
    responsable: { id_usuario: number; nombre: string } | null,
  ) {
    return {
      id_ficha: ficha.id_ficha,
      id_socio: ficha.id_socio,
      version: ficha.version,
      ...datos,
      nivel_actividad: ficha.nivel_actividad,
      objetivo: ficha.objetivo,
      restricciones_rutina: ficha.restricciones_rutina
        ? (JSON.parse(ficha.restricciones_rutina) as string[])
        : [],
      origen: ficha.origen,
      borrador: ficha.borrador,
      actualizado_por: responsable ?? { id_usuario: ficha.actualizado_por_usuario },
      creado_en: ficha.creado_en,
    };
  }
}
