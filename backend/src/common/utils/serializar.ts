/** Convierte Decimal de Prisma (o number) a number con 2 decimales. */
export function aNumero(valor: { toString(): string } | number): number {
  return typeof valor === 'number' ? valor : Number(valor.toString());
}

/** BigInt -> number (los IDs BIGINT del esquema caben en 2^53). */
export function idNumero(valor: bigint | number): number {
  return typeof valor === 'bigint' ? Number(valor) : valor;
}
