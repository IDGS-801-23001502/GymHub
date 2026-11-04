import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../generated/prisma/client.js';

// Errores de conexión de Prisma (P1001, P1002, P1017) o del driver mssql/tedious.
function esErrorDeConexion(error: Error & { code?: string }): boolean {
  return (
    error instanceof Prisma.PrismaClientInitializationError ||
    ['P1001', 'P1002', 'P1017'].includes(error.code ?? '') ||
    /Failed to connect|ConnectionError|ETIMEOUT|ESOCKET|ECONNREFUSED|pool failed to retrieve|timeout acquiring/i.test(error.message)
  );
}

/** Errores de Prisma a HTTP: UNIQUE -> 409, no encontrado -> 404, sin conexión -> 503. */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientInitializationError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly log = new Logger('Prisma');

  catch(
    error: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientInitializationError,
    host: ArgumentsHost,
  ) {
    let http: HttpException | null = null;
    if (esErrorDeConexion(error)) {
      this.log.error(`Base de datos no disponible: ${error.message.replace(/\s+/g, ' ').trim().slice(0, 300)}`);
      http = new ServiceUnavailableException(
        'La base de datos no está disponible. Intenta de nuevo en unos momentos.',
      );
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      http = new ConflictException(
        'El registro entra en conflicto con otro existente (valor duplicado).',
      );
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      http = new NotFoundException('Registro no encontrado.');
    }
    super.catch(http ?? error, host);
  }
}
