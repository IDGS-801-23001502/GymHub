import { NotFoundException } from '@nestjs/common';
import type { ClienteDb } from '../common/audit/audit.service.js';
import type { UsuarioAutenticado } from '../common/auth/auth.types.js';
import { exigirSede } from '../common/auth/sedes.js';
import type { Socio } from '../generated/prisma/client.js';

/**
 * Obtiene un socio verificando que exista y que el usuario opere en su sede.
 * `usuario` nulo: es el propio socio desde la app, ya autenticado por su token.
 */
export async function obtenerSocioAutorizado(
  db: ClienteDb,
  idSocio: number,
  usuario: UsuarioAutenticado | null,
): Promise<Socio> {
  const socio = await db.socio.findUnique({ where: { id_socio: idSocio } });
  if (!socio) throw new NotFoundException('Socio no encontrado.');
  if (usuario) exigirSede(usuario, socio.id_sede);
  return socio;
}
