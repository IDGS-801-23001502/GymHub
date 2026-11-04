import type { BloqueDoc, EjercicioDoc, PlantillaDoc } from '../mongo/mongo.service.js';

export function mapearBloques(bloques: BloqueDoc[]) {
  return bloques.map((b) => ({
    tipo: b.tipo,
    orden: b.orden,
    ejercicios: b.ejercicios.map((e) => ({
      id_ejercicio: e.id_ejercicio.toHexString(),
      nombre: e.nombre,
      series: e.series,
      repeticiones: e.repeticiones,
      descanso_seg: e.descanso_seg,
      notas: e.notas ?? null,
    })),
  }));
}

export function mapearEjercicio(e: EjercicioDoc) {
  return {
    id: e._id.toHexString(),
    nombre: e.nombre,
    grupo_muscular: e.grupo_muscular,
    equipo: e.equipo,
    descripcion: e.descripcion ?? null,
    media_url: e.media_url ?? null,
    media_tipo: e.media_tipo ?? null,
    contraindicaciones: e.contraindicaciones ?? [],
    activo: e.activo,
    actualizado_en: e.actualizado_en,
  };
}

export function mapearPlantilla(p: PlantillaDoc) {
  return {
    id: p._id.toHexString(),
    nombre: p.nombre,
    objetivo: p.objetivo,
    nivel: p.nivel,
    descripcion: p.descripcion ?? null,
    dias_semana: p.dias_semana ?? null,
    activa: p.activa,
    duplicada_de: p.duplicada_de?.toHexString() ?? null,
    total_ejercicios: p.bloques.reduce((n, b) => n + b.ejercicios.length, 0),
    bloques: mapearBloques(p.bloques),
    actualizado_en: p.actualizado_en,
  };
}

/** Patrón de búsqueda que ignora mayúsculas y acentos ("presion" encuentra "Presión"). */
export function patronSinAcentos(texto: string): RegExp {
  const variantes: Record<string, string> = {
    a: '[aáàä]', e: '[eéèë]', i: '[iíìï]', o: '[oóòö]', u: '[uúùü]', n: '[nñ]',
  };
  const escapado = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escapado.replace(/[aeioun]/g, (c) => variantes[c]!), 'i');
}
