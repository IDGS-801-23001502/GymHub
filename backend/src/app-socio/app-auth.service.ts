import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoSocio, JwtPayloadSocio } from '../common/auth/auth.types.js';
import { EncryptionService } from '../common/crypto/encryption.service.js';
import { MailService } from '../common/mail/mail.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActivarCuentaDto, LoginAppDto, LogoutDto, RestablecerDto } from './dto/app.dto.js';

const HASH_FICTICIO = '$2b$12$22z4gj..0P7LWNoadTwQ/uxbKaD7NEEFYV8DtBU0gFR/aRcqNxUt.';
const CREDENCIALES_INVALIDAS = 'Correo o contraseña incorrectos.';
const COSTO_BCRYPT = 12;

const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');
const tokenAleatorio = () => randomBytes(32).toString('base64url');

/**
 * Cuenta del socio en la app (APP-RF-01, APP-RF-03): activación con folio y correo,
 * access token corto y refresh token rotativo guardado como hash en sesion_app.
 */
@Injectable()
export class AppAuthService {
  private readonly logger = new Logger(AppAuthService.name);
  private readonly maxIntentos: number;
  private readonly minutosBloqueo: number;
  private readonly diasRefresh: number;
  private readonly expiraAccess: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    this.maxIntentos = Number(config.get('LOGIN_MAX_INTENTOS') ?? 5);
    this.minutosBloqueo = Number(config.get('LOGIN_MINUTOS_BLOQUEO') ?? 15);
    this.diasRefresh = Number(config.get('APP_REFRESH_DIAS') ?? 30);
    this.expiraAccess = config.get<string>('APP_JWT_EXPIRES_IN') ?? '15m';
  }

  async activar(dto: ActivarCuentaDto, ip: string | null) {
    const socio = await this.prisma.socio.findUnique({
      where: { folio: dto.folio },
      include: { cuenta_app: true },
    });
    // Mismo mensaje si el folio no existe o el correo no coincide, para no revelar datos
    if (!socio || socio.correo_hash !== this.crypto.hashCorreo(dto.correo)) {
      throw new BadRequestException('El folio y el correo no coinciden con un socio registrado.');
    }
    if (socio.estado !== 'activo') {
      throw new ConflictException('Tu registro está dado de baja. Acude a recepción.');
    }
    if (socio.cuenta_app?.activada) {
      throw new ConflictException('La cuenta ya está activada. Inicia sesión o recupera tu contraseña.');
    }

    const hash = await bcrypt.hash(dto.password, COSTO_BCRYPT);
    const ahora = new Date();
    await this.prisma.cuentaApp.upsert({
      where: { id_socio: socio.id_socio },
      create: { id_socio: socio.id_socio, password_hash: hash, activada: true, activada_en: ahora, ultimo_acceso: ahora },
      update: { password_hash: hash, activada: true, activada_en: ahora, intentos_fallidos: 0, bloqueada_hasta: null, ultimo_acceso: ahora },
    });
    await this.audit.registrar(
      { socio: { id_socio: socio.id_socio }, ip },
      { entidad: 'cuenta_app', idEntidad: socio.id_socio, accion: 'crear', nuevo: { activada: true } },
    );
    return this.emitirTokens(socio.id_socio, dto.dispositivo);
  }

  async login(dto: LoginAppDto, ip: string | null) {
    const socio = await this.prisma.socio.findUnique({
      where: { correo_hash: this.crypto.hashCorreo(dto.correo) },
      include: { cuenta_app: true },
    });
    const cuenta = socio?.cuenta_app;
    const ahora = new Date();
    if (cuenta?.bloqueada_hasta && cuenta.bloqueada_hasta > ahora) {
      const minutos = Math.ceil((cuenta.bloqueada_hasta.getTime() - ahora.getTime()) / 60_000);
      throw new UnauthorizedException(`Cuenta bloqueada por intentos fallidos. Intenta de nuevo en ${minutos} min.`);
    }

    const valida = await bcrypt.compare(dto.password, cuenta?.password_hash ?? HASH_FICTICIO);
    if (!socio || !cuenta?.activada || !valida) {
      if (socio && cuenta?.activada) await this.registrarFallo(socio.id_socio, cuenta.intentos_fallidos, ip);
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    if (socio.estado !== 'activo') {
      throw new UnauthorizedException('Tu registro está dado de baja. Acude a recepción.');
    }

    await this.prisma.cuentaApp.update({
      where: { id_socio: socio.id_socio },
      data: { intentos_fallidos: 0, bloqueada_hasta: null, ultimo_acceso: ahora },
    });
    await this.audit.registrar(
      { socio: { id_socio: socio.id_socio }, ip },
      { entidad: 'cuenta_app', idEntidad: socio.id_socio, accion: 'login' },
    );
    return this.emitirTokens(socio.id_socio, dto.dispositivo);
  }

  /** Rota el refresh token: el anterior queda revocado y no se puede reutilizar. */
  async refrescar(refreshToken: string) {
    const sesion = await this.prisma.sesionApp.findUnique({
      where: { refresh_token_hash: sha256(refreshToken) },
      include: { socio: { select: { estado: true } } },
    });
    if (!sesion || sesion.revocada || sesion.expira_en < new Date() || sesion.socio.estado !== 'activo') {
      // Un refresh revocado que se reutiliza indica robo: se cierran todas las sesiones del socio
      if (sesion?.revocada) {
        await this.prisma.sesionApp.updateMany({ where: { id_socio: sesion.id_socio, revocada: false }, data: { revocada: true } });
      }
      throw new UnauthorizedException('La sesión expiró. Inicia sesión de nuevo.');
    }
    await this.prisma.sesionApp.update({ where: { id_sesion_app: sesion.id_sesion_app }, data: { revocada: true } });
    return this.emitirTokens(sesion.id_socio, sesion.dispositivo ?? undefined);
  }

  async cerrarSesion(dto: LogoutDto, ctx: ContextoSocio) {
    await this.prisma.sesionApp.updateMany({
      where: { refresh_token_hash: sha256(dto.refresh_token), id_socio: ctx.socio.id_socio },
      data: { revocada: true },
    });
    if (dto.fcm_token) {
      await this.prisma.dispositivoPush.updateMany({
        where: { fcm_token: dto.fcm_token, id_socio: ctx.socio.id_socio },
        data: { activo: false, actualizado_en: new Date() },
      });
    }
    return { ok: true };
  }

  /**
   * Crea un token de recuperación de 30 min. La respuesta es la misma exista o no
   * el correo. El envío por correo electrónico está pendiente; en desarrollo se registra en el log.
   */
  async recuperar(correo: string) {
    const socio = await this.prisma.socio.findUnique({
      where: { correo_hash: this.crypto.hashCorreo(correo) },
      include: { cuenta_app: true },
    });
    if (socio?.cuenta_app?.activada && socio.estado === 'activo') {
      const token = tokenAleatorio();
      await this.prisma.recuperacionPassword.create({
        data: { id_socio: socio.id_socio, token_hash: sha256(token), expira_en: new Date(Date.now() + 30 * 60_000) },
      });
      const enviado = await this.mail.enviar(
        this.crypto.descifrar(socio.correo_cifrado),
        'Restablece tu contraseña de GymHub',
        `Hola ${socio.nombre.split(' ')[0]}:

Tu código para crear una nueva contraseña en la app es:

${token}

Vence en 30 minutos. Si no lo pediste, ignora este correo.`,
      );
      // Sin SMTP (desarrollo) el código queda en el log para poder probar el flujo
      if (!enviado && this.config.get('NODE_ENV') !== 'production') {
        this.logger.log(`Token de recuperación para el socio ${socio.folio}: ${token}`);
      }
    }
    return { mensaje: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' };
  }

  async restablecer(dto: RestablecerDto, ip: string | null) {
    const registro = await this.prisma.recuperacionPassword.findUnique({ where: { token_hash: sha256(dto.token) } });
    if (!registro || registro.usado || registro.expira_en < new Date()) {
      throw new BadRequestException('El enlace de recuperación no es válido o ya expiró.');
    }
    const hash = await bcrypt.hash(dto.password, COSTO_BCRYPT);
    await this.prisma.$transaction([
      this.prisma.recuperacionPassword.update({ where: { id_recuperacion: registro.id_recuperacion }, data: { usado: true } }),
      this.prisma.cuentaApp.update({
        where: { id_socio: registro.id_socio },
        data: { password_hash: hash, intentos_fallidos: 0, bloqueada_hasta: null },
      }),
      // Cambiar la contraseña cierra las sesiones abiertas en otros dispositivos
      this.prisma.sesionApp.updateMany({ where: { id_socio: registro.id_socio, revocada: false }, data: { revocada: true } }),
    ]);
    await this.audit.registrar(
      { socio: { id_socio: registro.id_socio }, ip },
      { entidad: 'cuenta_app', idEntidad: registro.id_socio, accion: 'modificar', nuevo: { password: '[restablecida]' } },
    );
    return { mensaje: 'Contraseña actualizada. Inicia sesión con la nueva contraseña.' };
  }

  private async emitirTokens(idSocio: number, dispositivo?: string) {
    const refresh = tokenAleatorio();
    await this.prisma.sesionApp.create({
      data: {
        id_socio: idSocio,
        refresh_token_hash: sha256(refresh),
        dispositivo: dispositivo?.slice(0, 100) ?? null,
        expira_en: new Date(Date.now() + this.diasRefresh * 86_400_000),
      },
    });
    const payload: JwtPayloadSocio = { sub: idSocio, tipo: 'socio' };
    return {
      access_token: await this.jwt.signAsync(payload, { expiresIn: this.expiraAccess as never }),
      refresh_token: refresh,
      id_socio: idSocio,
    };
  }

  private async registrarFallo(idSocio: number, intentosPrevios: number, ip: string | null) {
    const intentos = intentosPrevios + 1;
    const bloquear = intentos >= this.maxIntentos;
    await this.prisma.cuentaApp.update({
      where: { id_socio: idSocio },
      data: {
        intentos_fallidos: bloquear ? 0 : intentos,
        bloqueada_hasta: bloquear ? new Date(Date.now() + this.minutosBloqueo * 60_000) : undefined,
      },
    });
    await this.audit.registrar(
      { socio: { id_socio: idSocio }, ip },
      { entidad: 'cuenta_app', idEntidad: idSocio, accion: 'login_fallido', nuevo: { intentos, bloqueada: bloquear } },
    );
  }
}
