import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ObjectId, type Filter } from 'mongodb';
import type { ContextoPeticion } from '../common/auth/auth.types.js';
import { MongoService, type BloqueDoc, type PlantillaDoc } from '../mongo/mongo.service.js';
import type {
  ActualizarPlantillaDto,
  BloqueDto,
  CrearPlantillaDto,
  ListarPlantillasDto,
} from './dto/plantilla.dto.js';
import { mapearPlantilla, patronSinAcentos } from './mapeo.js';

/** Plantillas de rutina por bloques en MongoDB (CRM-RF-07). */
@Injectable()
export class PlantillasService {
  constructor(private readonly mongo: MongoService) {}

  async listar(f: ListarPlantillasDto) {
    const filtro: Filter<PlantillaDoc> = {};
    if (!f.incluir_inactivas) filtro.activa = true;
    if (f.objetivo) filtro.objetivo = f.objetivo;
    if (f.nivel) filtro.nivel = f.nivel;
    if (f.q) filtro.nombre = patronSinAcentos(f.q);
    const docs = await this.mongo.plantillas
      .find(filtro)
      .collation({ locale: 'es', strength: 1 })
      .sort({ nombre: 1 })
      .limit(300)
      .toArray();
    return docs.map(mapearPlantilla);
  }

  async obtenerDoc(id: ObjectId): Promise<PlantillaDoc> {
    const doc = await this.mongo.plantillas.findOne({ _id: id });
    if (!doc) throw new NotFoundException('Plantilla no encontrada.');
    return doc;
  }

  /** Incluye estado y contraindicaciones de cada ejercicio para avisar en el editor. */
  async obtener(id: ObjectId) {
    const plantilla = mapearPlantilla(await this.obtenerDoc(id));
    const ids = plantilla.bloques.flatMap((b) => b.ejercicios.map((e) => new ObjectId(e.id_ejercicio)));
    const catalogo = await this.mongo.ejercicios
      .find({ _id: { $in: ids } }, { projection: { activo: 1, contraindicaciones: 1 } })
      .toArray();
    const porId = new Map(catalogo.map((e) => [e._id.toHexString(), e]));
    return {
      ...plantilla,
      bloques: plantilla.bloques.map((b) => ({
        ...b,
        ejercicios: b.ejercicios.map((e) => ({
          ...e,
          activo: porId.get(e.id_ejercicio)?.activo ?? false,
          contraindicaciones: porId.get(e.id_ejercicio)?.contraindicaciones ?? [],
        })),
      })),
    };
  }

  async crear(dto: CrearPlantillaDto, ctx: ContextoPeticion) {
    const ahora = new Date();
    const doc: PlantillaDoc = {
      _id: new ObjectId(),
      nombre: dto.nombre,
      objetivo: dto.objetivo,
      nivel: dto.nivel,
      descripcion: dto.descripcion ?? null,
      ...(dto.dias_semana && { dias_semana: dto.dias_semana }),
      bloques: await this.resolverBloques(dto.bloques),
      activa: true,
      duplicada_de: null,
      creado_por: ctx.usuario.id_usuario,
      creado_en: ahora,
      actualizado_en: ahora,
    };
    await this.mongo.plantillas.insertOne(doc);
    return mapearPlantilla(doc);
  }

  async actualizar(id: ObjectId, dto: ActualizarPlantillaDto) {
    const { bloques, ...resto } = dto;
    const cambios: Partial<PlantillaDoc> = { ...resto, actualizado_en: new Date() };
    if (bloques) cambios.bloques = await this.resolverBloques(bloques);
    const doc = await this.mongo.plantillas.findOneAndUpdate(
      { _id: id },
      { $set: cambios },
      { returnDocument: 'after' },
    );
    if (!doc) throw new NotFoundException('Plantilla no encontrada.');
    return mapearPlantilla(doc);
  }

  async duplicar(id: ObjectId, nombre: string, ctx: ContextoPeticion) {
    const origen = await this.obtenerDoc(id);
    const ahora = new Date();
    const copia: PlantillaDoc = {
      ...origen,
      _id: new ObjectId(),
      nombre,
      activa: true,
      duplicada_de: origen._id,
      creado_por: ctx.usuario.id_usuario,
      creado_en: ahora,
      actualizado_en: ahora,
    };
    await this.mongo.plantillas.insertOne(copia);
    return mapearPlantilla(copia);
  }

  async cambiarEstado(id: ObjectId, activa: boolean) {
    const doc = await this.mongo.plantillas.findOneAndUpdate(
      { _id: id },
      { $set: { activa, actualizado_en: new Date() } },
      { returnDocument: 'after' },
    );
    if (!doc) throw new NotFoundException('Plantilla no encontrada.');
    return mapearPlantilla(doc);
  }

  /**
   * Convierte los bloques recibidos al formato guardado: valida que los
   * ejercicios existan y estén activos, y copia su nombre actual.
   */
  async resolverBloques(bloques: BloqueDto[]): Promise<BloqueDoc[]> {
    const ids = [...new Set(bloques.flatMap((b) => b.ejercicios.map((e) => e.id_ejercicio)))];
    const catalogo = await this.mongo.ejercicios
      .find({ _id: { $in: ids.map((i) => new ObjectId(i)) } }, { projection: { nombre: 1, activo: 1 } })
      .toArray();
    const porId = new Map(catalogo.map((e) => [e._id.toHexString(), e]));

    const faltantes = ids.filter((i) => !porId.has(i));
    if (faltantes.length) {
      throw new BadRequestException(`Ejercicios no encontrados: ${faltantes.join(', ')}.`);
    }
    const inactivos = catalogo.filter((e) => !e.activo).map((e) => e.nombre);
    if (inactivos.length) {
      throw new ConflictException(`Ejercicios desactivados: ${inactivos.join(', ')}. Reemplázalos.`);
    }

    return bloques.map((b, i) => ({
      tipo: b.tipo,
      orden: i + 1,
      ejercicios: b.ejercicios.map((e) => ({
        id_ejercicio: new ObjectId(e.id_ejercicio),
        nombre: porId.get(e.id_ejercicio)!.nombre,
        series: e.series,
        repeticiones: e.repeticiones,
        descanso_seg: e.descanso_seg,
        notas: e.notas ?? null,
      })),
    }));
  }
}
