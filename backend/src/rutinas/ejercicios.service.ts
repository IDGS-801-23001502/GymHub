import { Injectable, NotFoundException } from '@nestjs/common';
import { ObjectId, type Filter } from 'mongodb';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { MongoService, type EjercicioDoc } from '../mongo/mongo.service.js';
import type {
  ActualizarEjercicioDto,
  CrearEjercicioDto,
  ListarEjerciciosDto,
} from './dto/ejercicio.dto.js';
import { mapearEjercicio, patronSinAcentos } from './mapeo.js';

const ORDEN_ES = { locale: 'es', strength: 1 };

/** Catálogo de ejercicios en MongoDB (CRM-RF-06). */
@Injectable()
export class EjerciciosService {
  constructor(private readonly mongo: MongoService) {}

  async listar(f: ListarEjerciciosDto) {
    const filtro: Filter<EjercicioDoc> = {};
    if (!f.incluir_inactivos) filtro.activo = true;
    if (f.grupo_muscular) filtro.grupo_muscular = f.grupo_muscular;
    if (f.q) filtro.nombre = patronSinAcentos(f.q);
    const docs = await this.mongo.ejercicios
      .find(filtro)
      .collation(ORDEN_ES)
      .sort({ nombre: 1 })
      .limit(500)
      .toArray();
    return docs.map(mapearEjercicio);
  }

  async gruposMusculares(): Promise<string[]> {
    const grupos = await this.mongo.ejercicios.distinct('grupo_muscular');
    return grupos.sort();
  }

  async obtener(id: ObjectId) {
    const doc = await this.mongo.ejercicios.findOne({ _id: id });
    if (!doc) throw new NotFoundException('Ejercicio no encontrado.');
    return mapearEjercicio(doc);
  }

  async crear(dto: CrearEjercicioDto, ctx: ContextoPeticion) {
    const ahora = new Date();
    const doc: EjercicioDoc = {
      _id: new ObjectId(),
      nombre: dto.nombre,
      grupo_muscular: dto.grupo_muscular,
      equipo: dto.equipo,
      descripcion: dto.descripcion ?? null,
      media_url: dto.media_url ?? null,
      media_tipo: dto.media_url ? (dto.media_tipo ?? 'imagen') : null,
      contraindicaciones: [...new Set(dto.contraindicaciones ?? [])],
      activo: true,
      creado_por: ctx.usuario.id_usuario,
      creado_en: ahora,
      actualizado_en: ahora,
    };
    await this.mongo.ejercicios.insertOne(doc);
    return mapearEjercicio(doc);
  }

  async actualizar(id: ObjectId, dto: ActualizarEjercicioDto) {
    const cambios: Partial<EjercicioDoc> = { ...dto, actualizado_en: new Date() };
    if (dto.contraindicaciones) cambios.contraindicaciones = [...new Set(dto.contraindicaciones)];
    const doc = await this.mongo.ejercicios.findOneAndUpdate(
      { _id: id },
      { $set: cambios },
      { returnDocument: 'after' },
    );
    if (!doc) throw new NotFoundException('Ejercicio no encontrado.');

    // Las plantillas guardan el nombre para mostrarlo sin consultar el catálogo.
    // Las versiones ya asignadas (contenidos_rutina) no se tocan: son históricas.
    if (dto.nombre) {
      await this.mongo.plantillas.updateMany(
        { 'bloques.ejercicios.id_ejercicio': id },
        { $set: { 'bloques.$[].ejercicios.$[e].nombre': dto.nombre } },
        { arrayFilters: [{ 'e.id_ejercicio': id }] },
      );
    }
    return mapearEjercicio(doc);
  }

  /** Desactivar oculta el ejercicio para plantillas nuevas sin romper las existentes. */
  async cambiarEstado(id: ObjectId, activo: boolean) {
    const doc = await this.mongo.ejercicios.findOneAndUpdate(
      { _id: id },
      { $set: { activo, actualizado_en: new Date() } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new NotFoundException('Ejercicio no encontrado.');
    return mapearEjercicio(doc);
  }
}
