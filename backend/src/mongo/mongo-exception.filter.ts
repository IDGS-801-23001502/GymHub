import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  HttpException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { MongoError, MongoServerError, MongoServerSelectionError, MongoNetworkError } from 'mongodb';

/** Traduce errores de MongoDB: duplicado -> 409, validación -> 400, sin conexión -> 503. */
@Catch(MongoError)
export class MongoExceptionFilter extends BaseExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Mongo');

  catch(error: MongoError, host: ArgumentsHost) {
    let http: HttpException | null = null;
    if (error instanceof MongoServerSelectionError || error instanceof MongoNetworkError) {
      this.log.error(`MongoDB no disponible: ${error.message}`);
      http = new ServiceUnavailableException(
        'La base de rutinas no está disponible. Intenta de nuevo en unos momentos.',
      );
    } else if (error instanceof MongoServerError && error.code === 11000) {
      http = new ConflictException('Ya existe un registro con ese nombre.');
    } else if (error instanceof MongoServerError && error.code === 121) {
      http = new BadRequestException('El documento no cumple con el esquema de la colección.');
    }
    super.catch(http ?? error, host);
  }
}
