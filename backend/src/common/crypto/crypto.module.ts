import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service.js';

@Global()
@Module({
  providers: [
    {
      provide: EncryptionService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new EncryptionService({
          clave: config.getOrThrow<string>('ENCRYPTION_KEY'),
          idClave: Number(config.get('ENCRYPTION_KEY_ID') ?? 1),
          clavesAnteriores: config.get<string>('ENCRYPTION_OLD_KEYS'),
          pepper: config.getOrThrow<string>('BLIND_INDEX_PEPPER'),
        }),
    },
  ],
  exports: [EncryptionService],
})
export class CryptoModule {}
