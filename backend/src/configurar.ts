import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync } from 'node:fs';
import { CARPETA_UPLOADS } from './archivos/archivos.module.js';
import { exigirFirma } from './archivos/firma.js';
import { MongoExceptionFilter } from './mongo/mongo-exception.filter.js';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter.js';

/** Configuración común de la app (la usan main.ts y las pruebas e2e). */
export function configurarApp(app: NestExpressApplication) {
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true });
  // Valida y sanea entradas (CRM-RNF-04): descarta campos no declarados en los DTO
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const { httpAdapter } = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaExceptionFilter(httpAdapter), new MongoExceptionFilter(httpAdapter));

  // Fotos de socios y multimedia de ejercicios: solo con URL firmada (ver archivos/firma.ts)
  mkdirSync(CARPETA_UPLOADS, { recursive: true });
  app.use('/uploads', exigirFirma);
  app.useStaticAssets(CARPETA_UPLOADS, {
    prefix: '/uploads/',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });

  // Documentación OpenAPI en /docs (desactivable con SWAGGER=false)
  if (process.env.SWAGGER !== 'false') {
    const config = new DocumentBuilder()
      .setTitle('GymHub API')
      .setDescription('CRM del gimnasio y API de la app del socio (/app/*).')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config), {
      swaggerOptions: { persistAuthorization: true },
    });
  }
  return app;
}
