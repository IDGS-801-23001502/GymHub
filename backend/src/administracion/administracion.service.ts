import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { exigirSede, filtroSedes } from '../common/auth/sedes.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { aFecha, sumarDias } from '../common/utils/fechas.js';
import { idNumero } from '../common/utils/serializar.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ActualizarSedeDto,
  ActualizarUsuarioDto,
  AtenderArcoDto,
  CrearArcoDto,
  CrearSedeDto,
  CrearUsuarioDto,
  FiltroBitacoraDto,
  HorarioDto,
} from './dto/administracion.dto.js';

const COSTO_BCRYPT = 12;
const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

/** SQL Server TIME llega como Date sobre 1970-01-01 UTC. */
const aHora = (d: Date | null) => (d ? d.toISOString().slice(11, 16) : null);
const deHora = (h: string) => new Date(`1970-01-01T${h}:00.000Z`);

const incluirUsuario = {
  rol: { select: { nombre: true } },
  sedes: { include: { sede: { select: { id_sede: true, nombre: true } } } },
} as const;

type UsuarioConRelaciones = Prisma.UsuarioGetPayload<{ include: typeof incluirUsuario }>;

/** Usuarios, sedes, bitácora y solicitudes ARCO (CRM-RF-18 a CRM-RF-20, CRM-RNF-02). */
@Injectable()
export class AdministracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crypto: EncryptionService,
  ) {}

  // ---------- Usuarios (CRM-RF-18)

  async usuarios() {
    const lista = await this.prisma.usuario.findMany({ include: incluirUsuario, orderBy: [{ activo: 'desc' }, { nombre: 'asc' }] });
    const sesiones = await this.prisma.sesionUsuario.groupBy({
      by: ['id_usuario'],
      where: { revocada: false, expira_en: { gt: new Date() } },
      _count: { _all: true },
    });
    return lista.map((u) => ({
      ...this.mapearUsuario(u),
      sesiones_activas: sesiones.find((s) => s.id_usuario === u.id_usuario)?._count._all ?? 0,
    }));
  }

  async crearUsuario(dto: CrearUsuarioDto, ctx: ContextoPeticion) {
    const rol = await this.rolPorNombre(dto.rol);
    await this.validarSedes(dto.sedes);
    try {
      const u = await this.prisma.usuario.create({
        data: {
          nombre: dto.nombre,
          correo: dto.correo,
          password_hash: await bcrypt.hash(dto.password, COSTO_BCRYPT),
          id_rol: rol,
          es_admin_general: dto.rol === 'administrador' && (dto.es_admin_general ?? false),
          sedes: { create: [...new Set(dto.sedes)].map((id_sede) => ({ id_sede })) },
        },
        include: incluirUsuario,
      });
      await this.audit.registrar(ctx, {
        entidad: 'usuario',
        idEntidad: u.id_usuario,
        accion: 'crear',
        nuevo: { nombre: u.nombre, correo: u.correo, rol: dto.rol, sedes: dto.sedes },
      });
      return this.mapearUsuario(u);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }
      throw error;
    }
  }

  async actualizarUsuario(id: number, dto: ActualizarUsuarioDto, ctx: ContextoPeticion) {
    const actual = await this.prisma.usuario.findUnique({ where: { id_usuario: id }, include: incluirUsuario });
    if (!actual) throw new NotFoundException('Usuario no encontrado.');
    if (id === ctx.usuario.id_usuario && (dto.activo === false || (dto.rol && dto.rol !== 'administrador'))) {
      throw new BadRequestException('No puedes desactivarte ni quitarte el rol de administrador.');
    }
    if (dto.sedes) await this.validarSedes(dto.sedes);

    const data: Prisma.UsuarioUpdateInput = { actualizado_en: new Date() };
    if (dto.nombre !== undefined) data.nombre = dto.nombre;
    if (dto.correo !== undefined) data.correo = dto.correo;
    if (dto.activo !== undefined) data.activo = dto.activo;
    if (dto.rol) data.rol = { connect: { id_rol: await this.rolPorNombre(dto.rol) } };
    const rolFinal = dto.rol ?? actual.rol.nombre;
    if (dto.es_admin_general !== undefined || dto.rol) {
      data.es_admin_general = rolFinal === 'administrador' && (dto.es_admin_general ?? actual.es_admin_general);
    }
    if (dto.password) {
      data.password_hash = await bcrypt.hash(dto.password, COSTO_BCRYPT);
      data.intentos_fallidos = 0;
      data.bloqueado_hasta = null;
    }

    try {
      const u = await this.prisma.$transaction(async (tx) => {
        if (dto.sedes) {
          await tx.usuarioSede.deleteMany({ where: { id_usuario: id } });
          await tx.usuarioSede.createMany({ data: [...new Set(dto.sedes)].map((id_sede) => ({ id_usuario: id, id_sede })) });
        }
        const r = await tx.usuario.update({ where: { id_usuario: id }, data, include: incluirUsuario });
        // Cambiar permisos, contraseña o desactivar invalida los tokens ya emitidos
        if (dto.activo === false || dto.password || dto.rol || dto.sedes || dto.es_admin_general !== undefined) {
          await tx.sesionUsuario.updateMany({ where: { id_usuario: id, revocada: false }, data: { revocada: true } });
        }
        return r;
      });
      await this.audit.registrar(ctx, {
        entidad: 'usuario',
        idEntidad: id,
        accion: 'modificar',
        anterior: this.resumenAuditoria(actual),
        nuevo: { ...this.resumenAuditoria(u), ...(dto.password && { password: '[cambiada]' }) },
      });
      return this.mapearUsuario(u);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }
      throw error;
    }
  }

  async desbloquear(id: number, ctx: ContextoPeticion) {
    const r = await this.prisma.usuario.updateMany({
      where: { id_usuario: id },
      data: { intentos_fallidos: 0, bloqueado_hasta: null },
    });
    if (!r.count) throw new NotFoundException('Usuario no encontrado.');
    await this.audit.registrar(ctx, { entidad: 'usuario', idEntidad: id, accion: 'modificar', nuevo: { desbloqueado: true } });
    return { ok: true };
  }

  async sesiones(id: number) {
    const lista = await this.prisma.sesionUsuario.findMany({
      where: { id_usuario: id },
      orderBy: { creada_en: 'desc' },
      take: 50,
    });
    const ahora = new Date();
    return lista.map((s) => ({
      id_sesion: idNumero(s.id_sesion),
      ip: s.ip,
      creada_en: s.creada_en,
      expira_en: s.expira_en,
      activa: !s.revocada && s.expira_en > ahora,
    }));
  }

  /** Cierra una sesión o todas las del usuario. */
  async revocarSesiones(idUsuario: number, idSesion: number | null, ctx: ContextoPeticion) {
    const r = await this.prisma.sesionUsuario.updateMany({
      where: { id_usuario: idUsuario, revocada: false, ...(idSesion && { id_sesion: BigInt(idSesion) }) },
      data: { revocada: true },
    });
    await this.audit.registrar(ctx, {
      entidad: 'sesion_usuario',
      idEntidad: idSesion ?? idUsuario,
      accion: 'cancelar',
      nuevo: { usuario: idUsuario, cerradas: r.count },
    });
    return { cerradas: r.count };
  }

  // ---------- Sedes (CRM-RF-19)

  async sedes(ctx: ContextoPeticion) {
    const sedes = await this.prisma.sede.findMany({
      where: { id_sede: filtroSedes(ctx.usuario) },
      include: {
        horarios: { orderBy: { dia_semana: 'asc' } },
        usuarios: { include: { usuario: { select: { id_usuario: true, nombre: true, activo: true, rol: { select: { nombre: true } } } } } },
        _count: { select: { socios: { where: { estado: 'activo' } } } },
      },
      orderBy: { nombre: 'asc' },
    });
    return sedes.map((s) => ({
      id_sede: s.id_sede,
      nombre: s.nombre,
      direccion: s.direccion,
      telefono: s.telefono,
      activa: s.activa,
      socios_activos: s._count.socios,
      horarios: s.horarios.map((h) => ({
        dia_semana: h.dia_semana,
        dia: DIAS[h.dia_semana],
        hora_apertura: aHora(h.hora_apertura),
        hora_cierre: aHora(h.hora_cierre),
      })),
      personal: s.usuarios
        .filter((u) => u.usuario.activo)
        .map((u) => ({ id_usuario: u.usuario.id_usuario, nombre: u.usuario.nombre, rol: u.usuario.rol.nombre })),
    }));
  }

  async crearSede(dto: CrearSedeDto, ctx: ContextoPeticion) {
    this.validarHorarios(dto.horarios ?? []);
    try {
      const sede = await this.prisma.sede.create({
        data: {
          nombre: dto.nombre,
          direccion: dto.direccion ?? null,
          telefono: dto.telefono ?? null,
          horarios: { create: (dto.horarios ?? []).map((h) => this.horarioData(h)) },
        },
      });
      // El administrador que la crea puede operarla de inmediato
      await this.prisma.usuarioSede.create({ data: { id_usuario: ctx.usuario.id_usuario, id_sede: sede.id_sede } }).catch(() => undefined);
      await this.audit.registrar(ctx, { entidad: 'sede', idEntidad: sede.id_sede, accion: 'crear', nuevo: dto });
      return sede;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una sede con ese nombre.');
      }
      throw error;
    }
  }

  async actualizarSede(id: number, dto: ActualizarSedeDto, ctx: ContextoPeticion) {
    exigirSede(ctx.usuario, id);
    const actual = await this.prisma.sede.findUnique({ where: { id_sede: id } });
    if (!actual) throw new NotFoundException('Sede no encontrada.');
    if (dto.horarios) this.validarHorarios(dto.horarios);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.sede.update({
          where: { id_sede: id },
          data: {
            ...(dto.nombre !== undefined && { nombre: dto.nombre }),
            ...(dto.direccion !== undefined && { direccion: dto.direccion }),
            ...(dto.telefono !== undefined && { telefono: dto.telefono }),
            ...(dto.activa !== undefined && { activa: dto.activa }),
          },
        });
        if (dto.horarios) {
          await tx.sedeHorario.deleteMany({ where: { id_sede: id } });
          await tx.sedeHorario.createMany({ data: dto.horarios.map((h) => ({ id_sede: id, ...this.horarioData(h) })) });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya existe una sede con ese nombre.');
      }
      throw error;
    }
    await this.audit.registrar(ctx, { entidad: 'sede', idEntidad: id, accion: 'modificar', anterior: { nombre: actual.nombre, activa: actual.activa }, nuevo: dto });
    return (await this.sedes(ctx)).find((s) => s.id_sede === id);
  }

  // ---------- Bitácora (CRM-RF-20): solo lectura

  async bitacora(f: FiltroBitacoraDto) {
    const pagina = f.pagina ?? 1;
    const porPagina = f.por_pagina ?? 50;
    const where: Prisma.BitacoraAuditoriaWhereInput = {
      ...(f.id_usuario && { id_usuario: f.id_usuario }),
      ...(f.id_socio && { id_socio: f.id_socio }),
      ...(f.entidad && { entidad: f.entidad }),
      ...(f.accion && { accion: f.accion }),
      ...((f.desde || f.hasta) && {
        fecha: {
          ...(f.desde && { gte: aFecha(f.desde) }),
          ...(f.hasta && { lt: aFecha(sumarDias(f.hasta, 1)) }),
        },
      }),
    };
    const [total, filas] = await Promise.all([
      this.prisma.bitacoraAuditoria.count({ where }),
      this.prisma.bitacoraAuditoria.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);
    const ids = [...new Set(filas.map((r) => r.id_usuario).filter((x): x is number => x !== null))];
    const socios = [...new Set(filas.map((r) => r.id_socio).filter((x): x is number => x !== null))];
    const [usuarios, sociosInfo] = await Promise.all([
      this.prisma.usuario.findMany({ where: { id_usuario: { in: ids } }, select: { id_usuario: true, nombre: true } }),
      this.prisma.socio.findMany({ where: { id_socio: { in: socios } }, select: { id_socio: true, folio: true, nombre: true } }),
    ]);
    const leer = (v: string | null) => {
      if (v === null) return null;
      try {
        return JSON.parse(v) as unknown;
      } catch {
        return v;
      }
    };
    return {
      total,
      pagina,
      por_pagina: porPagina,
      entidades: (await this.prisma.bitacoraAuditoria.findMany({ distinct: ['entidad'], select: { entidad: true } })).map((e) => e.entidad).sort(),
      registros: filas.map((r) => ({
        id: idNumero(r.id_bitacora),
        fecha: r.fecha,
        usuario: r.id_usuario ? (usuarios.find((u) => u.id_usuario === r.id_usuario) ?? { id_usuario: r.id_usuario, nombre: '—' }) : null,
        socio: r.id_socio ? (sociosInfo.find((s) => s.id_socio === r.id_socio) ?? { id_socio: r.id_socio }) : null,
        entidad: r.entidad,
        id_entidad: r.id_entidad,
        accion: r.accion,
        anterior: leer(r.valor_anterior),
        nuevo: leer(r.valor_nuevo),
        ip: r.ip,
      })),
    };
  }

  // ---------- Derechos ARCO (CRM-RNF-02)

  async solicitudesArco(ctx: ContextoPeticion, estado?: string) {
    const lista = await this.prisma.solicitudArco.findMany({
      where: { ...(estado && { estado }), socio: { id_sede: filtroSedes(ctx.usuario) } },
      include: { socio: { select: { id_socio: true, folio: true, nombre: true } }, usuario: { select: { nombre: true } } },
      orderBy: { creada_en: 'desc' },
    });
    return lista.map((s) => ({
      id_solicitud: s.id_solicitud,
      tipo: s.tipo,
      descripcion: s.descripcion,
      estado: s.estado,
      creada_en: s.creada_en,
      atendida_en: s.atendida_en,
      atendida_por: s.usuario?.nombre ?? null,
      socio: s.socio,
    }));
  }

  async crearArco(idSocio: number, dto: CrearArcoDto, ctx: ContextoPeticion) {
    const socio = await this.prisma.socio.findUnique({ where: { id_socio: idSocio }, select: { id_sede: true } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    exigirSede(ctx.usuario, socio.id_sede);
    const s = await this.prisma.solicitudArco.create({ data: { id_socio: idSocio, tipo: dto.tipo, descripcion: dto.descripcion ?? null } });
    await this.audit.registrar(ctx, { entidad: 'solicitud_arco', idEntidad: s.id_solicitud, idSocio, accion: 'crear', nuevo: { tipo: dto.tipo } });
    await this.audit.interaccion(ctx, idSocio, 'otro', `Solicitud ARCO de ${dto.tipo} registrada.`);
    return s;
  }

  async atenderArco(id: number, dto: AtenderArcoDto, ctx: ContextoPeticion) {
    const s = await this.prisma.solicitudArco.findUnique({ where: { id_solicitud: id }, include: { socio: { select: { id_sede: true } } } });
    if (!s) throw new NotFoundException('Solicitud no encontrada.');
    exigirSede(ctx.usuario, s.socio.id_sede);
    const cerrada = dto.estado === 'atendida' || dto.estado === 'rechazada';
    const r = await this.prisma.solicitudArco.update({
      where: { id_solicitud: id },
      data: { estado: dto.estado, atendida_por: ctx.usuario.id_usuario, atendida_en: cerrada ? new Date() : null },
    });
    await this.audit.registrar(ctx, { entidad: 'solicitud_arco', idEntidad: id, idSocio: s.id_socio, accion: 'modificar', anterior: { estado: s.estado }, nuevo: { estado: dto.estado } });
    return r;
  }

  /** Derecho de acceso: todo lo que GymHub guarda del socio, descifrado, en un solo documento. */
  async exportarDatosSocio(idSocio: number, ctx: ContextoPeticion) {
    const s = await this.prisma.socio.findUnique({
      where: { id_socio: idSocio },
      include: {
        sede: { select: { nombre: true } },
        consentimientos: { orderBy: { fecha: 'desc' } },
        fichas_salud: { orderBy: { version: 'desc' }, take: 1 },
        membresias: { include: { plan: { select: { nombre: true } } } },
        pagos: { select: { folio: true, monto: true, metodo: true, estado: true, fecha_pago: true } },
        asistencias: { select: { fecha_hora: true, metodo_registro: true }, orderBy: { fecha_hora: 'desc' }, take: 500 },
      },
    });
    if (!s) throw new NotFoundException('Socio no encontrado.');
    exigirSede(ctx.usuario, s.id_sede);
    await this.audit.registrar(ctx, { entidad: 'socio', idEntidad: idSocio, idSocio, accion: 'consulta', nuevo: { exportacion_arco: true } });
    const ficha = s.fichas_salud[0];
    return {
      generado_en: new Date(),
      socio: {
        folio: s.folio,
        nombre: s.nombre,
        fecha_nacimiento: s.fecha_nacimiento.toISOString().slice(0, 10),
        telefono: this.crypto.descifrar(s.telefono_cifrado),
        correo: this.crypto.descifrar(s.correo_cifrado),
        contacto_emergencia: JSON.parse(this.crypto.descifrar(s.contacto_emergencia_cifrado)) as unknown,
        objetivo: s.objetivo,
        sede: s.sede.nombre,
        estado: s.estado,
        fecha_alta: s.fecha_alta.toISOString().slice(0, 10),
      },
      consentimientos: s.consentimientos.map((c) => ({ tipo: c.tipo, otorgado: c.otorgado, fecha: c.fecha, origen: c.origen })),
      ficha_salud: ficha ? { version: ficha.version, datos: JSON.parse(this.crypto.descifrar(ficha.datos_cifrados)) as unknown } : null,
      membresias: s.membresias.map((m) => ({
        plan: m.plan.nombre,
        fecha_inicio: m.fecha_inicio.toISOString().slice(0, 10),
        fecha_vencimiento: m.fecha_vencimiento.toISOString().slice(0, 10),
        estado: m.estado,
      })),
      pagos: s.pagos.map((p) => ({ ...p, monto: Number(p.monto) })),
      asistencias: s.asistencias,
    };
  }

  // ---------- Auxiliares

  private async rolPorNombre(nombre: string) {
    const rol = await this.prisma.rol.findUnique({ where: { nombre } });
    if (!rol) throw new BadRequestException(`El rol ${nombre} no existe en la base.`);
    return rol.id_rol;
  }

  private async validarSedes(ids: number[]) {
    const n = await this.prisma.sede.count({ where: { id_sede: { in: ids } } });
    if (n !== new Set(ids).size) throw new BadRequestException('Alguna sede no existe.');
  }

  private validarHorarios(horarios: HorarioDto[]) {
    const dias = new Set<number>();
    for (const h of horarios) {
      if (dias.has(h.dia_semana)) throw new BadRequestException(`El día ${DIAS[h.dia_semana]} está repetido.`);
      dias.add(h.dia_semana);
      if (h.hora_cierre <= h.hora_apertura) throw new BadRequestException(`El ${DIAS[h.dia_semana]} cierra antes de abrir.`);
    }
  }

  private horarioData(h: HorarioDto) {
    return { dia_semana: h.dia_semana, hora_apertura: deHora(h.hora_apertura), hora_cierre: deHora(h.hora_cierre) };
  }

  private mapearUsuario(u: UsuarioConRelaciones) {
    return {
      id_usuario: u.id_usuario,
      nombre: u.nombre,
      correo: u.correo,
      rol: u.rol.nombre,
      es_admin_general: u.es_admin_general,
      activo: u.activo,
      bloqueado: !!u.bloqueado_hasta && u.bloqueado_hasta > new Date(),
      ultimo_acceso: u.ultimo_acceso,
      creado_en: u.creado_en,
      sedes: u.sedes.map((s) => s.sede),
    };
  }

  private resumenAuditoria(u: UsuarioConRelaciones) {
    return {
      nombre: u.nombre,
      correo: u.correo,
      rol: u.rol.nombre,
      activo: u.activo,
      es_admin_general: u.es_admin_general,
      sedes: u.sedes.map((s) => s.sede.id_sede),
    };
  }
}
