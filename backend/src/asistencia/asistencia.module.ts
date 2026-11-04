import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion, ContextoSocio, UsuarioAutenticado } from '../common/auth/auth.types.js';
import { Ctx, Roles, SocioCtx, SoloSocio } from '../common/auth/decorators.js';
import { exigirSede, filtroSedes } from '../common/auth/sedes.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { aFecha, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { idNumero } from '../common/utils/serializar.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MembresiasModule } from '../membresias/membresias.module.js';
import { MembresiasService, seleccionResumen } from '../membresias/membresias.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Una segunda entrada en la misma sede dentro de este lapso se considera repetida. */
const MINUTOS_DUPLICADO = 60;

export class RegistrarAsistenciaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_socio?: number;

  /** Texto leído del QR de la credencial (`GYMHUB:GH000123`) o el folio. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigo?: string;

  @Type(() => Number)
  @IsInt()
  id_sede: number;
}

export class FiltroAsistenciaDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  id_sede?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe ser YYYY-MM-DD' })
  fecha?: string;
}

/** Folio desde el QR de la credencial o escrito a mano. */
export function folioDeCodigo(codigo: string): string | null {
  const m = /^(?:GYMHUB:)?(GH\d{6,})$/i.exec(codigo.trim());
  return m ? m[1].toUpperCase() : null;
}

/** Estado guardado en `asistencia` (CHECK: vigente, por_vencer, vencida). */
export function estadoParaAsistencia(estado: string | null | undefined): 'vigente' | 'por_vencer' | 'vencida' {
  if (estado === 'activa') return 'vigente';
  if (estado === 'por_vencer') return 'por_vencer';
  return 'vencida';
}

const MENSAJES: Record<string, string> = {
  activa: 'Membresía vigente.',
  por_vencer: 'La membresía está por vencer: ofrece la renovación.',
  vencida: 'La membresía está vencida.',
  congelada: 'La membresía está congelada.',
  cancelada: 'La membresía fue cancelada.',
  sin_membresia: 'El socio no tiene membresía.',
};

/** Registro de entradas en recepción (CRM-RF-11). No controla barreras físicas: solo avisa. */
@Injectable()
export class AsistenciaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membresias: MembresiasService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  /** Busca por nombre, teléfono, folio o el texto del QR. */
  async buscar(q: string, usuario: UsuarioAutenticado) {
    const texto = q.trim();
    if (texto.length < 2) return [];
    const folio = folioDeCodigo(texto);
    const digitos = texto.replace(/\D/g, '');
    const where: Prisma.SocioWhereInput = {
      id_sede: filtroSedes(usuario),
      ...(folio
        ? { folio }
        : digitos.length === 10 && digitos.length === texto.replace(/[\s-]/g, '').length
          ? { telefono_hash: this.crypto.hashTelefono(digitos) }
          : { nombre: { contains: texto } }),
    };
    const socios = await this.prisma.socio.findMany({
      where,
      take: 10,
      orderBy: { nombre: 'asc' },
      include: {
        sede: { select: { nombre: true } },
        membresias: { select: seleccionResumen },
        asistencias: { orderBy: { fecha_hora: 'desc' }, take: 1, select: { fecha_hora: true } },
      },
    });
    const diasAviso = await this.membresias.diasAvisoPorSede();
    const hoy = hoyISO();
    return socios.map((s) => {
      const m = this.membresias.resumen(s.membresias, hoy, diasAviso(s.id_sede));
      return {
        id_socio: s.id_socio,
        folio: s.folio,
        nombre: s.nombre,
        foto_url: s.foto_url,
        estado: s.estado,
        sede: s.sede.nombre,
        membresia: m,
        ultima_visita: s.asistencias[0]?.fecha_hora ?? null,
      };
    });
  }

  async registrar(dto: RegistrarAsistenciaDto, ctx: ContextoPeticion) {
    exigirSede(ctx.usuario, dto.id_sede);
    let where: Prisma.SocioWhereUniqueInput;
    let metodo: 'qr' | 'busqueda' = 'busqueda';
    if (dto.codigo) {
      const folio = folioDeCodigo(dto.codigo);
      if (!folio) throw new BadRequestException('El código no corresponde a una credencial de GymHub.');
      where = { folio };
      metodo = dto.codigo.trim().toUpperCase().startsWith('GYMHUB:') ? 'qr' : 'busqueda';
    } else if (dto.id_socio) {
      where = { id_socio: dto.id_socio };
    } else {
      throw new BadRequestException('Indica el socio o escanea su credencial.');
    }

    const socio = await this.prisma.socio.findUnique({ where, include: { membresias: { select: seleccionResumen } } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    if (socio.estado !== 'activo') throw new ConflictException('El socio está dado de baja.');

    const diasAviso = await this.membresias.diasAvisoPorSede();
    const resumen = this.membresias.resumen(socio.membresias, hoyISO(), diasAviso(socio.id_sede));
    const estado = resumen?.estado ?? 'sin_membresia';

    const reciente = await this.prisma.asistencia.findFirst({
      where: {
        id_socio: socio.id_socio,
        id_sede: dto.id_sede,
        fecha_hora: { gte: new Date(Date.now() - MINUTOS_DUPLICADO * 60_000) },
      },
      orderBy: { fecha_hora: 'desc' },
    });
    const registro =
      reciente ??
      (await this.prisma.asistencia.create({
        data: {
          id_socio: socio.id_socio,
          id_sede: dto.id_sede,
          id_membresia: resumen?.id_membresia ?? null,
          metodo_registro: metodo,
          estado_membresia: estadoParaAsistencia(estado),
          registrado_por: ctx.usuario.id_usuario,
        },
      }));
    if (!reciente) {
      await this.audit.registrar(ctx, {
        entidad: 'asistencia',
        idEntidad: registro.id_asistencia,
        idSocio: socio.id_socio,
        accion: 'crear',
        nuevo: { sede: dto.id_sede, metodo, estado_membresia: estado },
      });
    }
    return {
      id_asistencia: idNumero(registro.id_asistencia),
      fecha_hora: registro.fecha_hora,
      duplicada: !!reciente,
      socio: { id_socio: socio.id_socio, folio: socio.folio, nombre: socio.nombre, foto_url: socio.foto_url },
      membresia: resumen,
      alerta: estado === 'activa' ? 'ok' : estado === 'por_vencer' ? 'aviso' : 'error',
      mensaje:
        (reciente ? `Ya registró su entrada hace menos de ${MINUTOS_DUPLICADO} minutos. ` : '') +
        (MENSAJES[estado] ?? estado) +
        (resumen?.vigente_hasta && estado !== 'activa' ? ` Vigencia: ${resumen.vigente_hasta}.` : ''),
    };
  }

  /** Entradas de un día por sede (por defecto hoy en todas las sedes del usuario). */
  async delDia(f: FiltroAsistenciaDto, usuario: UsuarioAutenticado) {
    if (f.id_sede) exigirSede(usuario, f.id_sede);
    const dia = f.fecha ?? hoyISO();
    const lista = await this.prisma.asistencia.findMany({
      where: {
        id_sede: f.id_sede ?? filtroSedes(usuario),
        fecha_hora: { gte: aFecha(dia), lt: aFecha(sumarDias(dia, 1)) },
      },
      orderBy: { fecha_hora: 'desc' },
      include: {
        socio: { select: { id_socio: true, folio: true, nombre: true } },
        sede: { select: { nombre: true } },
        usuario: { select: { nombre: true } },
      },
    });
    const conteo = (estado: string) => lista.filter((a) => a.estado_membresia === estado).length;
    return {
      fecha: dia,
      total: lista.length,
      socios_unicos: new Set(lista.map((a) => a.id_socio)).size,
      por_estado: { vigente: conteo('vigente'), por_vencer: conteo('por_vencer'), vencida: conteo('vencida') },
      registros: lista.map((a) => ({
        id_asistencia: idNumero(a.id_asistencia),
        fecha_hora: a.fecha_hora,
        metodo_registro: a.metodo_registro,
        estado_membresia: a.estado_membresia,
        socio: a.socio,
        sede: a.sede.nombre,
        registrado_por: a.usuario.nombre,
      })),
    };
  }

  async deSocio(idSocio: number, usuario: UsuarioAutenticado | null) {
    const socio = await this.prisma.socio.findUnique({ where: { id_socio: idSocio }, select: { id_sede: true } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    if (usuario) exigirSede(usuario, socio.id_sede);
    const [lista, ultimos30] = await Promise.all([
      this.prisma.asistencia.findMany({
        where: { id_socio: idSocio },
        orderBy: { fecha_hora: 'desc' },
        take: 100,
        include: { sede: { select: { nombre: true } } },
      }),
      this.prisma.asistencia.count({ where: { id_socio: idSocio, fecha_hora: { gte: aFecha(sumarDias(hoyISO(), -29)) } } }),
    ]);
    return {
      visitas_30_dias: ultimos30,
      ultima_visita: lista[0]?.fecha_hora ?? null,
      registros: lista.map((a) => ({
        id_asistencia: idNumero(a.id_asistencia),
        fecha_hora: a.fecha_hora,
        sede: a.sede.nombre,
        metodo_registro: a.metodo_registro,
        estado_membresia: a.estado_membresia,
      })),
    };
  }
}

@Controller()
export class AsistenciaController {
  constructor(private readonly asistencia: AsistenciaService) {}

  @Get('asistencia/buscar')
  @Roles('recepcionista')
  buscar(@Query('q') q: string = '', @Ctx() ctx: ContextoPeticion) {
    return this.asistencia.buscar(q, ctx.usuario);
  }

  @Post('asistencia')
  @Roles('recepcionista')
  registrar(@Body() dto: RegistrarAsistenciaDto, @Ctx() ctx: ContextoPeticion) {
    return this.asistencia.registrar(dto, ctx);
  }

  @Get('asistencia')
  @Roles('recepcionista')
  delDia(@Query() f: FiltroAsistenciaDto, @Ctx() ctx: ContextoPeticion) {
    return this.asistencia.delDia(f, ctx.usuario);
  }

  @Get('socios/:id/asistencias')
  @Roles('recepcionista', 'entrenador')
  deSocio(@Param('id', ParseIntPipe) id: number, @Ctx() ctx: ContextoPeticion) {
    return this.asistencia.deSocio(id, ctx.usuario);
  }

  /** El socio consulta sus visitas desde la app. */
  @Get('app/asistencias')
  @SoloSocio()
  propias(@SocioCtx() ctx: ContextoSocio) {
    return this.asistencia.deSocio(ctx.socio.id_socio, null);
  }
}

@Module({
  imports: [MembresiasModule],
  controllers: [AsistenciaController],
  providers: [AsistenciaService],
  exports: [AsistenciaService],
})
export class AsistenciaModule {}
