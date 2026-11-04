import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../common/utils/tokens.js';
import { AuditService } from '../common/audit/audit.service.js';
import {
  ROLES,
  type JwtPayloadPersonal,
  type RolNombre,
  type UsuarioAutenticado,
} from '../common/auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';

/** Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe. */
const HASH_FICTICIO = '$2b$12$22z4gj..0P7LWNoadTwQ/uxbKaD7NEEFYV8DtBU0gFR/aRcqNxUt.';
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos.';

const incluirUsuario = {
  rol: { select: { nombre: true } },
  sedes: { include: { sede: { select: { id_sede: true, nombre: true, activa: true } } } },
} as const;

/** Login del personal con bloqueo temporal por intentos fallidos (CRM-RF-18, CRM-RNF-03). */
@Injectable()
export class AuthService {
  private readonly maxIntentos: number;
  private readonly minutosBloqueo: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.maxIntentos = Number(config.get('LOGIN_MAX_INTENTOS') ?? 5);
    this.minutosBloqueo = Number(config.get('LOGIN_MINUTOS_BLOQUEO') ?? 15);
  }

  async login(dto: LoginDto, ip: string | null) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: dto.correo },
      include: incluirUsuario,
    });

    const ahora = new Date();
    if (usuario?.bloqueado_hasta && usuario.bloqueado_hasta > ahora) {
      await this.audit.registrarAcceso(usuario.id_usuario, 'login_fallido', ip, { motivo: 'bloqueada' });
      const minutos = Math.ceil((usuario.bloqueado_hasta.getTime() - ahora.getTime()) / 60_000);
      throw new UnauthorizedException(
        `Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} min.`,
      );
    }

    const valida = await bcrypt.compare(dto.password, usuario?.password_hash ?? HASH_FICTICIO);
    if (!usuario || !usuario.activo || !valida) {
      if (usuario) await this.registrarFallo(usuario.id_usuario, usuario.intentos_fallidos, ip);
      else await this.audit.registrarAcceso(null, 'login_fallido', ip, { motivo: 'correo_desconocido' });
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }

    const rol = usuario.rol.nombre as RolNombre;
    if (!ROLES.includes(rol)) throw new UnauthorizedException('Rol no reconocido.');

    await this.prisma.usuario.update({
      where: { id_usuario: usuario.id_usuario },
      data: { intentos_fallidos: 0, bloqueado_hasta: null, ultimo_acceso: ahora },
    });
    await this.audit.registrarAcceso(usuario.id_usuario, 'login', ip);

    const sedes = usuario.sedes.filter((s) => s.sede.activa).map((s) => s.sede);
    const jti = randomUUID();
    const payload: JwtPayloadPersonal = {
      sub: usuario.id_usuario,
      rol,
      sedes: sedes.map((s) => s.id_sede),
      admin_general: usuario.es_admin_general,
      jti,
    };
    const accessToken = await this.jwt.signAsync(payload);
    const exp = (this.jwt.decode<{ exp?: number }>(accessToken)?.exp ?? 0) * 1000;
    await this.prisma.sesionUsuario.create({
      data: {
        id_usuario: usuario.id_usuario,
        token_hash: sha256(jti),
        ip: ip?.slice(0, 45) ?? null,
        expira_en: new Date(exp || Date.now() + 8 * 3_600_000),
      },
    });
    return {
      access_token: accessToken,
      usuario: {
        id_usuario: usuario.id_usuario,
        nombre: usuario.nombre,
        correo: usuario.correo,
        rol,
        admin_general: usuario.es_admin_general,
        sedes: sedes.map(({ id_sede, nombre }) => ({ id_sede, nombre })),
      },
    };
  }

  /** Cierra la sesión actual del personal. */
  async logout(usuario: UsuarioAutenticado) {
    if (usuario.jti) {
      await this.prisma.sesionUsuario.updateMany({
        where: { token_hash: sha256(usuario.jti), id_usuario: usuario.id_usuario },
        data: { revocada: true },
      });
    }
    return { ok: true };
  }

  /** Perfil del usuario autenticado (para recargar la sesión en el CRM). */
  async perfil(usuario: UsuarioAutenticado) {
    const u = await this.prisma.usuario.findUnique({
      where: { id_usuario: usuario.id_usuario },
      include: incluirUsuario,
    });
    if (!u || !u.activo) throw new UnauthorizedException('Usuario inactivo.');
    return {
      id_usuario: u.id_usuario,
      nombre: u.nombre,
      correo: u.correo,
      rol: u.rol.nombre,
      admin_general: u.es_admin_general,
      sedes: u.sedes.filter((s) => s.sede.activa).map(({ sede }) => ({ id_sede: sede.id_sede, nombre: sede.nombre })),
    };
  }

  private async registrarFallo(idUsuario: number, intentosPrevios: number, ip: string | null) {
    const intentos = intentosPrevios + 1;
    const bloquear = intentos >= this.maxIntentos;
    await this.prisma.usuario.update({
      where: { id_usuario: idUsuario },
      data: {
        intentos_fallidos: bloquear ? 0 : intentos,
        bloqueado_hasta: bloquear ? new Date(Date.now() + this.minutosBloqueo * 60_000) : undefined,
      },
    });
    await this.audit.registrarAcceso(idUsuario, 'login_fallido', ip, {
      intentos,
      bloqueada: bloquear,
    });
  }
}
