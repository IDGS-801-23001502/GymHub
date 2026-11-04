import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/** Envío de correos. Sin SMTP configurado solo se registra en el log (desarrollo). */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporte: Transporter | null;
  private readonly remitente: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    this.remitente = config.get<string>('SMTP_FROM') ?? 'GymHub <no-responder@gymhub.mx>';
    this.transporte = host
      ? nodemailer.createTransport({
          host,
          port: Number(config.get('SMTP_PORT') ?? 587),
          secure: config.get('SMTP_SECURE') === 'true',
          auth: config.get('SMTP_USER') ? { user: config.get('SMTP_USER'), pass: config.get('SMTP_PASSWORD') } : undefined,
        })
      : null;
  }

  get configurado() {
    return this.transporte !== null;
  }

  /** Devuelve false si no se pudo enviar; quien llama decide si es un error. */
  async enviar(para: string, asunto: string, texto: string, html?: string): Promise<boolean> {
    if (!this.transporte) {
      this.logger.warn(`SMTP sin configurar; correo "${asunto}" no enviado.`);
      return false;
    }
    try {
      await this.transporte.sendMail({ from: this.remitente, to: para, subject: asunto, text: texto, html });
      return true;
    } catch (error) {
      this.logger.error(`No se pudo enviar "${asunto}": ${String(error)}`);
      return false;
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
