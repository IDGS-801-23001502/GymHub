import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurarApp } from './configurar.js';

async function bootstrap() {
  const app = configurarApp(await NestFactory.create<NestExpressApplication>(AppModule));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
