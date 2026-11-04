import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirmarArchivosInterceptor } from './firma.js';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { AuditService } from '../common/audit/audit.service.js';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { Ctx, Roles } from '../common/auth/decorators.js';
import { exigirSede } from '../common/auth/sedes.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Lo que entrega FileInterceptor con almacenamiento en memoria. */
export interface ArchivoSubido {
  mimetype: string;
  size: number;
  buffer: Buffer;
  originalname: string;
}

/** Carpeta servida en /uploads (ver main.ts). */
export const CARPETA_UPLOADS = resolve(process.env.UPLOADS_DIR ?? 'uploads');

const IMAGENES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const VIDEOS: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm' };
const MB = 1024 * 1024;

/** Revisa los primeros bytes: no basta con el Content-Type que manda el navegador. */
export function firmaValida(buf: Buffer, tipo: string): boolean {
  const hex = buf.subarray(0, 12).toString('hex');
  switch (tipo) {
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/webp':
      return hex.startsWith('52494646') && buf.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'video/mp4':
      return buf.subarray(4, 8).toString('ascii') === 'ftyp';
    case 'video/webm':
      return hex.startsWith('1a45dfa3');
    default:
      return false;
  }
}

@Injectable()
export class ArchivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async guardar(archivo: ArchivoSubido | undefined, carpeta: string, permitidos: Record<string, string>) {
    if (!archivo) throw new BadRequestException('Adjunta un archivo en el campo "archivo".');
    const ext = permitidos[archivo.mimetype];
    if (!ext || !firmaValida(archivo.buffer, archivo.mimetype)) {
      throw new BadRequestException(`Formato no permitido. Usa: ${Object.values(permitidos).join(', ')}.`);
    }
    const dir = join(CARPETA_UPLOADS, carpeta);
    await mkdir(dir, { recursive: true });
    const nombre = `${randomUUID()}${ext}`;
    await writeFile(join(dir, nombre), archivo.buffer);
    return `/uploads/${carpeta}/${nombre}`;
  }

  async fotoSocio(idSocio: number, archivo: ArchivoSubido | undefined, ctx: ContextoPeticion) {
    const socio = await this.prisma.socio.findUnique({ where: { id_socio: idSocio }, select: { id_sede: true, foto_url: true } });
    if (!socio) throw new NotFoundException('Socio no encontrado.');
    exigirSede(ctx.usuario, socio.id_sede);
    if (archivo && archivo.size > 5 * MB) throw new BadRequestException('La foto no debe pasar de 5 MB.');
    const url = await this.guardar(archivo, 'socios', IMAGENES);
    await this.prisma.socio.update({ where: { id_socio: idSocio }, data: { foto_url: url } });
    if (socio.foto_url?.startsWith('/uploads/socios/')) {
      await unlink(join(CARPETA_UPLOADS, socio.foto_url.slice('/uploads/'.length))).catch(() => undefined);
    }
    await this.audit.registrar(ctx, {
      entidad: 'socio',
      idEntidad: idSocio,
      idSocio,
      accion: 'modificar',
      anterior: { foto_url: socio.foto_url },
      nuevo: { foto_url: url },
    });
    return { foto_url: url };
  }

  /** Imagen o video para el catálogo de ejercicios. */
  async media(archivo: ArchivoSubido | undefined) {
    const esVideo = !!archivo && archivo.mimetype in VIDEOS;
    if (archivo && archivo.size > (esVideo ? 40 : 5) * MB) {
      throw new BadRequestException(esVideo ? 'El video no debe pasar de 40 MB.' : 'La imagen no debe pasar de 5 MB.');
    }
    const url = await this.guardar(archivo, 'ejercicios', { ...IMAGENES, ...VIDEOS });
    return { media_url: url, media_tipo: esVideo ? 'video' : 'imagen' };
  }
}

@Controller('archivos')
export class ArchivosController {
  constructor(private readonly archivos: ArchivosService) {}

  @Post('socios/:id/foto')
  @Roles('recepcionista')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 5 * MB, files: 1 } }))
  foto(@Param('id', ParseIntPipe) id: number, @UploadedFile() archivo: ArchivoSubido | undefined, @Ctx() ctx: ContextoPeticion) {
    return this.archivos.fotoSocio(id, archivo, ctx);
  }

  @Post('ejercicios')
  @Roles('entrenador')
  @UseInterceptors(FileInterceptor('archivo', { limits: { fileSize: 40 * MB, files: 1 } }))
  media(@UploadedFile() archivo: ArchivoSubido | undefined) {
    return this.archivos.media(archivo);
  }
}

@Module({
  controllers: [ArchivosController],
  providers: [ArchivosService, { provide: APP_INTERCEPTOR, useClass: FirmarArchivosInterceptor }],
})
export class ArchivosModule {}
