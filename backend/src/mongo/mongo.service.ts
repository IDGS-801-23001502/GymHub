import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, type Collection, type Db, type ObjectId } from 'mongodb';

export interface EjercicioEnBloqueDoc {
  id_ejercicio: ObjectId;
  nombre: string;
  series: number;
  repeticiones: string;
  descanso_seg: number;
  notas?: string | null;
}

export interface BloqueDoc {
  tipo: string;
  orden: number;
  ejercicios: EjercicioEnBloqueDoc[];
}

export interface EjercicioDoc {
  _id: ObjectId;
  nombre: string;
  grupo_muscular: string;
  equipo: string;
  descripcion?: string | null;
  media_url?: string | null;
  media_tipo?: 'imagen' | 'video' | null;
  contraindicaciones: string[];
  activo: boolean;
  creado_por: number | null;
  creado_en: Date;
  actualizado_en: Date;
}

export interface PlantillaDoc {
  _id: ObjectId;
  nombre: string;
  objetivo: string;
  nivel: 'principiante' | 'intermedio' | 'avanzado';
  descripcion?: string | null;
  dias_semana?: number;
  bloques: BloqueDoc[];
  activa: boolean;
  duplicada_de?: ObjectId | null;
  creado_por: number | null;
  creado_en: Date;
  actualizado_en: Date;
}

/** Contenido inmutable de una versión de rutina asignada. */
export interface ContenidoRutinaDoc {
  _id: ObjectId;
  id_rutina: number;
  numero_version: number;
  id_socio: number;
  id_plantilla: ObjectId | null;
  nombre_plantilla: string | null;
  bloques: BloqueDoc[];
  autor: number;
  creado_en: Date;
}

/** Cliente de la base de rutinas; el nombre de la base sale de la ruta de MONGODB_URL. */
@Injectable()
export class MongoService implements OnModuleDestroy {
  private readonly cliente: MongoClient;
  readonly db: Db;

  constructor(config: ConfigService) {
    this.cliente = new MongoClient(config.getOrThrow<string>('MONGODB_URL'), {
      serverSelectionTimeoutMS: 5000,
    });
    this.db = this.cliente.db();
  }

  get ejercicios(): Collection<EjercicioDoc> {
    return this.db.collection<EjercicioDoc>('ejercicios');
  }

  get plantillas(): Collection<PlantillaDoc> {
    return this.db.collection<PlantillaDoc>('plantillas_rutina');
  }

  get contenidos(): Collection<ContenidoRutinaDoc> {
    return this.db.collection<ContenidoRutinaDoc>('contenidos_rutina');
  }

  async onModuleDestroy(): Promise<void> {
    await this.cliente.close();
  }
}
