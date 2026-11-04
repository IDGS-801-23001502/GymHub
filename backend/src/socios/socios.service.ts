import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService, type ClienteDb } from '../common/audit/audit.service.js';
import { esPersonal, type Actor, type ContextoPeticion, type UsuarioAutenticado } from '../common/auth/auth.types.js';
import { exigirSede, filtroSedes } from '../common/auth/sedes.js';
import {
  EncryptionService,
  normalizarCorreo,
  normalizarTelefono,
} from '../common/crypto/encryption.service.js';
import { aFecha, aISO, edad, esFechaISO, hoyISO } from '../common/utils/fechas.js';
import { folioSocio, folioTemporal } from '../common/utils/folios.js';
import { Prisma, type Socio } from '../generated/prisma/client.js';
import { MembresiasService, seleccionResumen } from '../membresias/membresias.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActualizarSocioDto,
  BajaSocioDto,
  BuscarSociosDto,
  ContactoEmergenciaDto,
  CrearSocioDto,
} from './dto/socio.dto.js';
import { obtenerSocioAutorizado } from './socio-acceso.js';

const MAX_POR_PAGINA = 100;
const EDAD_MAXIMA = 120;

/** Campos no sensibles que se guardan tal cual en la bitácora. */
const CAMPOS_PUBLICOS = ['nombre', 'fecha_nacimiento', 'foto_url', 'objetivo', 'id_sede'] as const;
/** Campos cifrados: en bitácora solo se registra que cambiaron. */
const CAMPOS_CIFRADOS = ['telefono', 'correo', 'contacto_emergencia'] as const;

@Injectable()
export class SociosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
    private readonly membresias: MembresiasService,
  ) {}

  async crear(dto: CrearSocioDto, ctx: ContextoPeticion) {
    const hoy = hoyISO();
    this.validarFechaNacimiento(dto.fecha_nacimiento, hoy);
    exigirSede(ctx.usuario, dto.id_sede);

    const correoHash = this.crypto.hashCorreo(dto.correo);
    const telefonoHash = this.crypto.hashTelefono(dto.telefono);

    const socio = await this.prisma.$transaction(async (tx) => {
      await this.validarSede(tx, dto.id_sede);
      await this.verificarDuplicados(tx, correoHash, telefonoHash);

      const aviso = await tx.avisoPrivacidad.findFirst({
        where: { vigente_desde: { lte: aFecha(hoy) } },
        orderBy: { vigente_desde: 'desc' },
      });
      if (!aviso) {
        throw new ConflictException(
          'No hay un aviso de privacidad vigente configurado; no se puede registrar el consentimiento.',
        );
      }

      const creado = await tx.socio.create({
        data: {
          folio: folioTemporal(),
          id_sede: dto.id_sede,
          nombre: dto.nombre,
          fecha_nacimiento: aFecha(dto.fecha_nacimiento),
          telefono_cifrado: this.crypto.cifrar(normalizarTelefono(dto.telefono)),
          telefono_hash: telefonoHash,
          correo_cifrado: this.crypto.cifrar(normalizarCorreo(dto.correo)),
          correo_hash: correoHash,
          contacto_emergencia_cifrado: this.crypto.cifrarJson(
            this.contactoNormalizado(dto.contacto_emergencia),
          ),
          foto_url: dto.foto_url ?? null,
          objetivo: dto.objetivo ?? null,
          creado_por: ctx.usuario.id_usuario,
        },
      });
      const folio = folioSocio(creado.id_socio);
      const socio = await tx.socio.update({
        where: { id_socio: creado.id_socio },
        data: { folio },
      });

      await tx.consentimiento.create({
        data: {
          id_socio: socio.id_socio,
          tipo: 'aviso_privacidad',
          id_aviso: aviso.id_aviso,
          otorgado: true,
          origen: 'crm',
        },
      });

      await this.audit.registrar(
        ctx,
        {
          entidad: 'socio',
          idEntidad: socio.id_socio,
          idSocio: socio.id_socio,
          accion: 'crear',
          nuevo: {
            folio,
            nombre: dto.nombre,
            id_sede: dto.id_sede,
            objetivo: dto.objetivo ?? null,
            aviso_privacidad: aviso.version,
            telefono: '[cifrado]',
            correo: '[cifrado]',
            contacto_emergencia: '[cifrado]',
          },
        },
        tx,
      );
      return socio;
    });

    return this.mapearDetalle(socio, null);
  }

  async buscar(filtros: BuscarSociosDto, usuario: UsuarioAutenticado) {
    const pagina = filtros.pagina ?? 1;
    const porPagina = Math.min(filtros.por_pagina ?? 20, MAX_POR_PAGINA);

    if (filtros.id_sede !== undefined) exigirSede(usuario, filtros.id_sede);
    const where: Prisma.SocioWhereInput = {
      id_sede: filtros.id_sede ?? filtroSedes(usuario),
      estado: filtros.estado,
    };

    const q = filtros.q?.trim();
    if (q) {
      if (q.includes('@')) {
        where.correo_hash = this.crypto.hashCorreo(q);
      } else if (normalizarTelefono(q).length >= 10) {
        where.OR = [
          { telefono_hash: this.crypto.hashTelefono(q) },
          { folio: { contains: q } },
        ];
      } else {
        // Collation Modern_Spanish_CI_AI: sin distinguir mayúsculas ni acentos
        where.OR = [{ nombre: { contains: q } }, { folio: { contains: q } }];
      }
    }

    const [total, socios, diasAviso] = await Promise.all([
      this.prisma.socio.count({ where }),
      this.prisma.socio.findMany({
        where,
        orderBy: { nombre: 'asc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: {
          sede: { select: { nombre: true } },
          membresias: {
            where: { estado: { not: 'cancelada' } },
            orderBy: { fecha_vencimiento: 'desc' },
            take: 5,
            select: seleccionResumen,
          },
        },
      }),
      this.membresias.diasAvisoPorSede(),
    ]);
    const hoy = hoyISO();

    return {
      total,
      pagina,
      por_pagina: porPagina,
      datos: socios.map((s) => ({
        id_socio: s.id_socio,
        folio: s.folio,
        nombre: s.nombre,
        id_sede: s.id_sede,
        sede: s.sede.nombre,
        foto_url: s.foto_url,
        estado: s.estado,
        // Teléfono enmascarado para distinguir homónimos sin exponer el dato
        telefono_mascara: this.enmascarar(this.crypto.descifrar(s.telefono_cifrado)),
        membresia: this.membresias.resumen(s.membresias, hoy, diasAviso(s.id_sede)),
      })),
    };
  }

  async obtener(idSocio: number, ctx: Actor) {
    const socio = await obtenerSocioAutorizado(this.prisma, idSocio, esPersonal(ctx) ? ctx.usuario : null);
    const [membresias, diasAviso] = await Promise.all([
      this.prisma.membresia.findMany({
        where: { id_socio: idSocio, estado: { not: 'cancelada' } },
        orderBy: { fecha_vencimiento: 'desc' },
        take: 5,
        select: seleccionResumen,
      }),
      this.membresias.diasAvisoPorSede(),
    ]);
    await this.audit.registrar(ctx, {
      entidad: 'socio',
      idEntidad: idSocio,
      idSocio,
      accion: 'consulta',
    });
    return this.mapearDetalle(
      socio,
      this.membresias.resumen(membresias, hoyISO(), diasAviso(socio.id_sede)),
    );
  }

  /** Desde la app (Actor socio) el controlador solo deja pasar teléfono, correo, foto y contacto. */
  async actualizar(idSocio: number, dto: ActualizarSocioDto, ctx: Actor) {
    if (dto.fecha_nacimiento !== undefined) {
      this.validarFechaNacimiento(dto.fecha_nacimiento, hoyISO());
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const actual = await obtenerSocioAutorizado(tx, idSocio, esPersonal(ctx) ? ctx.usuario : null);
      const data: Prisma.SocioUpdateInput = {};

      if (dto.id_sede !== undefined && dto.id_sede !== actual.id_sede) {
        if (!esPersonal(ctx)) throw new BadRequestException('El socio no puede cambiar su sede.');
        exigirSede(ctx.usuario, dto.id_sede);
        await this.validarSede(tx, dto.id_sede);
        data.sede = { connect: { id_sede: dto.id_sede } };
      }
      if (dto.nombre !== undefined) data.nombre = dto.nombre;
      if (dto.fecha_nacimiento !== undefined) {
        data.fecha_nacimiento = aFecha(dto.fecha_nacimiento);
      }
      if (dto.foto_url !== undefined) data.foto_url = dto.foto_url;
      if (dto.objetivo !== undefined) data.objetivo = dto.objetivo;

      const correoHash = dto.correo !== undefined ? this.crypto.hashCorreo(dto.correo) : undefined;
      const telefonoHash =
        dto.telefono !== undefined ? this.crypto.hashTelefono(dto.telefono) : undefined;
      if (correoHash || telefonoHash) {
        await this.verificarDuplicados(tx, correoHash, telefonoHash, idSocio);
      }
      if (dto.correo !== undefined && correoHash !== actual.correo_hash) {
        data.correo_cifrado = this.crypto.cifrar(normalizarCorreo(dto.correo));
        data.correo_hash = correoHash;
      }
      if (dto.telefono !== undefined && telefonoHash !== actual.telefono_hash) {
        data.telefono_cifrado = this.crypto.cifrar(normalizarTelefono(dto.telefono));
        data.telefono_hash = telefonoHash;
      }
      if (dto.contacto_emergencia !== undefined) {
        data.contacto_emergencia_cifrado = this.crypto.cifrarJson(
          this.contactoNormalizado(dto.contacto_emergencia),
        );
      }

      const { anterior, nuevo } = this.diferencias(actual, dto, data);
      if (Object.keys(nuevo).length === 0) return actual;

      const socio = await tx.socio.update({ where: { id_socio: idSocio }, data });
      await this.audit.registrar(
        ctx,
        { entidad: 'socio', idEntidad: idSocio, idSocio, accion: 'modificar', anterior, nuevo },
        tx,
      );
      return socio;
    });

    return this.obtenerSinAuditar(actualizado);
  }

  async darDeBaja(idSocio: number, dto: BajaSocioDto, ctx: ContextoPeticion) {
    return this.cambiarEstado(idSocio, 'baja', ctx, dto.motivo);
  }

  async reactivar(idSocio: number, ctx: ContextoPeticion) {
    return this.cambiarEstado(idSocio, 'activo', ctx);
  }

  private async cambiarEstado(
    idSocio: number,
    estado: 'activo' | 'baja',
    ctx: ContextoPeticion,
    motivo?: string,
  ) {
    const socio = await this.prisma.$transaction(async (tx) => {
      const actual = await obtenerSocioAutorizado(tx, idSocio, ctx.usuario);
      if (actual.estado === estado) {
        throw new ConflictException(
          estado === 'baja' ? 'El socio ya está dado de baja.' : 'El socio ya está activo.',
        );
      }
      const hoy = hoyISO();
      const actualizado = await tx.socio.update({
        where: { id_socio: idSocio },
        data:
          estado === 'baja'
            ? { estado, fecha_baja: aFecha(hoy), motivo_baja: motivo ?? null }
            : { estado, fecha_baja: null, motivo_baja: null },
      });
      await this.audit.registrar(
        ctx,
        {
          entidad: 'socio',
          idEntidad: idSocio,
          idSocio,
          accion: estado === 'baja' ? 'eliminar' : 'modificar',
          anterior: {
            estado: actual.estado,
            fecha_baja: actual.fecha_baja ? aISO(actual.fecha_baja) : null,
            motivo_baja: actual.motivo_baja,
          },
          nuevo: {
            estado,
            fecha_baja: estado === 'baja' ? hoy : null,
            motivo_baja: motivo ?? null,
          },
        },
        tx,
      );
      await this.audit.interaccion(
        ctx,
        idSocio,
        'otro',
        estado === 'baja' ? `Baja del socio. Motivo: ${motivo}` : 'Reactivación del socio.',
        tx,
      );
      return actualizado;
    });
    return this.obtenerSinAuditar(socio);
  }

  private async obtenerSinAuditar(socio: Socio) {
    const [membresias, diasAviso] = await Promise.all([
      this.prisma.membresia.findMany({
        where: { id_socio: socio.id_socio, estado: { not: 'cancelada' } },
        orderBy: { fecha_vencimiento: 'desc' },
        take: 5,
        select: seleccionResumen,
      }),
      this.membresias.diasAvisoPorSede(),
    ]);
    return this.mapearDetalle(
      socio,
      this.membresias.resumen(membresias, hoyISO(), diasAviso(socio.id_sede)),
    );
  }

  private validarFechaNacimiento(fecha: string, hoy: string): void {
    if (!esFechaISO(fecha)) {
      throw new BadRequestException('fecha_nacimiento no es una fecha válida.');
    }
    if (fecha >= hoy) {
      throw new BadRequestException('fecha_nacimiento debe ser anterior a hoy.');
    }
    if (edad(fecha, hoy) > EDAD_MAXIMA) {
      throw new BadRequestException('fecha_nacimiento no es razonable.');
    }
  }

  private async validarSede(db: ClienteDb, idSede: number): Promise<void> {
    const sede = await db.sede.findUnique({ where: { id_sede: idSede } });
    if (!sede) throw new NotFoundException('Sede no encontrada.');
    if (!sede.activa) throw new ConflictException('La sede está inactiva.');
  }

  /** Evita duplicados por correo o teléfono usando los índices ciegos. */
  private async verificarDuplicados(
    db: ClienteDb,
    correoHash: string | undefined,
    telefonoHash: string | undefined,
    excluirId?: number,
  ): Promise<void> {
    const condiciones: Prisma.SocioWhereInput[] = [];
    if (correoHash) condiciones.push({ correo_hash: correoHash });
    if (telefonoHash) condiciones.push({ telefono_hash: telefonoHash });
    if (condiciones.length === 0) return;

    const existentes = await db.socio.findMany({
      where: {
        OR: condiciones,
        ...(excluirId !== undefined && { NOT: { id_socio: excluirId } }),
      },
      select: { folio: true, estado: true, correo_hash: true, telefono_hash: true },
    });
    if (existentes.length === 0) return;

    const e = existentes[0];
    const campo = e.correo_hash === correoHash ? 'correo' : 'teléfono';
    throw new ConflictException(
      `Ya existe un socio con ese ${campo} (folio ${e.folio}` +
        (e.estado === 'baja' ? ', dado de baja: reactívalo en lugar de registrarlo de nuevo).' : ').'),
    );
  }

  private contactoNormalizado(c: ContactoEmergenciaDto) {
    return {
      nombre: c.nombre,
      parentesco: c.parentesco,
      telefono: normalizarTelefono(c.telefono),
    };
  }

  private enmascarar(telefono: string): string {
    return telefono.length <= 4 ? telefono : `${'*'.repeat(telefono.length - 4)}${telefono.slice(-4)}`;
  }

  /** Diferencias para bitácora: valores públicos en claro, cifrados como marca. */
  private diferencias(actual: Socio, dto: ActualizarSocioDto, data: Prisma.SocioUpdateInput) {
    const anterior: Record<string, unknown> = {};
    const nuevo: Record<string, unknown> = {};
    const valorActual: Record<(typeof CAMPOS_PUBLICOS)[number], unknown> = {
      nombre: actual.nombre,
      fecha_nacimiento: aISO(actual.fecha_nacimiento),
      foto_url: actual.foto_url,
      objetivo: actual.objetivo,
      id_sede: actual.id_sede,
    };
    for (const campo of CAMPOS_PUBLICOS) {
      const valor = dto[campo];
      if (valor !== undefined && valor !== valorActual[campo]) {
        anterior[campo] = valorActual[campo];
        nuevo[campo] = valor;
      }
    }
    const cambioCifrado = {
      telefono: data.telefono_cifrado !== undefined,
      correo: data.correo_cifrado !== undefined,
      contacto_emergencia: data.contacto_emergencia_cifrado !== undefined,
    };
    for (const campo of CAMPOS_CIFRADOS) {
      if (cambioCifrado[campo]) {
        anterior[campo] = '[cifrado]';
        nuevo[campo] = '[cifrado]';
      }
    }
    return { anterior, nuevo };
  }

  private mapearDetalle(
    socio: Socio,
    membresia: ReturnType<MembresiasService['resumen']>,
  ) {
    const fechaNac = aISO(socio.fecha_nacimiento);
    return {
      id_socio: socio.id_socio,
      folio: socio.folio,
      id_sede: socio.id_sede,
      nombre: socio.nombre,
      fecha_nacimiento: fechaNac,
      edad: edad(fechaNac, hoyISO()),
      telefono: this.crypto.descifrar(socio.telefono_cifrado),
      correo: this.crypto.descifrar(socio.correo_cifrado),
      contacto_emergencia: this.crypto.descifrarJson<{
        nombre: string;
        parentesco: string;
        telefono: string;
      }>(socio.contacto_emergencia_cifrado),
      foto_url: socio.foto_url,
      objetivo: socio.objetivo,
      estado: socio.estado,
      fecha_alta: aISO(socio.fecha_alta),
      fecha_baja: socio.fecha_baja ? aISO(socio.fecha_baja) : null,
      motivo_baja: socio.motivo_baja,
      creado_en: socio.creado_en,
      actualizado_en: socio.actualizado_en,
      membresia,
    };
  }
}
