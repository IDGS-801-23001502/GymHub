import { vi } from 'vitest';
import type { MongoService } from '../../src/mongo/mongo.service.js';

/** Cursor encadenable (find().collation().sort().limit().toArray()). */
export function cursor<T>(datos: T[]) {
  const c = {
    collation: () => c,
    sort: () => c,
    limit: () => c,
    toArray: () => Promise.resolve(datos),
  };
  return c;
}

function coleccion() {
  return {
    find: vi.fn().mockImplementation(() => cursor([])),
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    findOneAndUpdate: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    distinct: vi.fn().mockResolvedValue([]),
  };
}

/** Doble de MongoService con las tres colecciones de rutinas. */
export function crearMongoMock() {
  const mock = {
    ejercicios: coleccion(),
    plantillas: coleccion(),
    contenidos: coleccion(),
  };
  return mock as typeof mock & MongoService;
}

export type MongoMock = ReturnType<typeof crearMongoMock>;
