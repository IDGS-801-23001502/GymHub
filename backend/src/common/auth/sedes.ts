import { ForbiddenException } from '@nestjs/common';
import type { UsuarioAutenticado } from './auth.types.js';

/** Los usuarios operan solo en sus sedes; el admin general ve todas (CRM-RF-19). */
export function puedeOperarEnSede(
  usuario: UsuarioAutenticado,
  idSede: number,
): boolean {
  return usuario.admin_general || usuario.sedes.includes(idSede);
}

export function exigirSede(usuario: UsuarioAutenticado, idSede: number): void {
  if (!puedeOperarEnSede(usuario, idSede)) {
    throw new ForbiddenException('No tienes acceso a la sede de este registro.');
  }
}

/** Filtro Prisma por sede según el usuario (undefined = sin restricción). */
export function filtroSedes(
  usuario: UsuarioAutenticado,
): { in: number[] } | undefined {
  return usuario.admin_general ? undefined : { in: usuario.sedes };
}
