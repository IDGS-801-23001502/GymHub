import { ServiceUnavailableException, ConflictException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaExceptionFilter } from './prisma-exception.filter.js';
import { urlConTiempos } from './prisma.service.js';

describe('urlConTiempos', () => {
  const base = 'sqlserver://localhost:1433;database=gimnasio_crm;user=sa;password=x;trustServerCertificate=true';

  it('agrega tiempos de espera sin perder parámetros existentes', () => {
    const url = urlConTiempos(base);
    expect(url.startsWith(base)).toBe(true);
    expect(url).toContain(';connectTimeout=5000');
    expect(url).toContain(';poolTimeout=5');
  });

  it('respeta los valores definidos en la URL', () => {
    const url = urlConTiempos(`${base};connectTimeout=1000;`);
    expect(url.match(/connectTimeout/gi)).toHaveLength(1);
    expect(url).toContain('connectTimeout=1000');
  });
});

describe('PrismaExceptionFilter', () => {
  const filtro = new PrismaExceptionFilter();
  const traducido = (error: Error) => {
    const spy = vi
      .spyOn(Object.getPrototypeOf(PrismaExceptionFilter.prototype), 'catch')
      .mockImplementation(() => undefined);
    filtro.catch(error as Prisma.PrismaClientKnownRequestError, {} as ArgumentsHost);
    const enviado = spy.mock.calls[0]![0];
    spy.mockRestore();
    return enviado;
  };
  const errorPrisma = (code: string, message = 'x') =>
    new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'test' });

  it('responde 503 cuando el pool no consigue conexión', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const e = traducido(errorPrisma('P2010', 'Failed to connect to localhost:1433 in 5000ms'));
    expect(e).toBeInstanceOf(ServiceUnavailableException);
  });

  it('responde 409 ante un UNIQUE duplicado', () => {
    expect(traducido(errorPrisma('P2002'))).toBeInstanceOf(ConflictException);
  });
});
