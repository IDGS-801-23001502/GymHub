// Base documental de rutinas (MongoDB 7+)
// Colecciones: ejercicios (CRM-RF-06), plantillas_rutina (CRM-RF-07) y
// contenidos_rutina (contenido inmutable de cada versión asignada, CRM-RF-09).
// SQL Server guarda solo las referencias (rutina_asignada.plantilla_mongo_id,
// rutina_version.contenido_mongo_id).
//
// Ejecutar:
//   mongosh "mongodb://devbyte:<contraseña>@localhost:27017/?authSource=admin" database/mongodb/gymhub_rutinas.js
// Es idempotente: crea lo que falte y actualiza validadores e índices.
// Los validadores no prohíben campos extra para poder agregar tipos de
// ejercicio, bloques o atributos sin migrar datos (CRM-RNF-06).

const db = db.getSiblingDB('gymhub_rutinas');
const ES = { locale: 'es', strength: 1 }; // ignora acentos y mayúsculas

function asegurarColeccion(nombre, validador) {
  const existe = db.getCollectionNames().includes(nombre);
  const opciones = { validator: validador, validationLevel: 'strict', validationAction: 'error' };
  if (existe) db.runCommand({ collMod: nombre, ...opciones });
  else db.createCollection(nombre, opciones);
}

const ejercicioEnBloque = {
  bsonType: 'object',
  required: ['id_ejercicio', 'nombre', 'series', 'repeticiones', 'descanso_seg'],
  properties: {
    id_ejercicio: { bsonType: 'objectId' },
    nombre: { bsonType: 'string' },
    series: { bsonType: 'int', minimum: 1, maximum: 20 },
    repeticiones: { bsonType: 'string', maxLength: 20 },
    descanso_seg: { bsonType: 'int', minimum: 0, maximum: 600 },
    notas: { bsonType: ['string', 'null'], maxLength: 500 },
  },
};

const bloques = {
  bsonType: 'array',
  minItems: 1,
  items: {
    bsonType: 'object',
    required: ['tipo', 'orden', 'ejercicios'],
    properties: {
      tipo: { bsonType: 'string' },
      orden: { bsonType: 'int', minimum: 1 },
      ejercicios: { bsonType: 'array', minItems: 1, items: ejercicioEnBloque },
    },
  },
};

asegurarColeccion('ejercicios', {
  $jsonSchema: {
    bsonType: 'object',
    required: ['nombre', 'grupo_muscular', 'equipo', 'activo', 'creado_en'],
    properties: {
      nombre: { bsonType: 'string', minLength: 2, maxLength: 100 },
      grupo_muscular: { bsonType: 'string', maxLength: 40 },
      equipo: { bsonType: 'string', maxLength: 60 },
      descripcion: { bsonType: ['string', 'null'], maxLength: 2000 },
      media_url: { bsonType: ['string', 'null'], maxLength: 500 },
      media_tipo: { enum: ['imagen', 'video', null] },
      contraindicaciones: { bsonType: 'array', items: { bsonType: 'string' } },
      activo: { bsonType: 'bool' },
      creado_por: { bsonType: ['int', 'null'] },
      creado_en: { bsonType: 'date' },
      actualizado_en: { bsonType: 'date' },
    },
  },
});

asegurarColeccion('plantillas_rutina', {
  $jsonSchema: {
    bsonType: 'object',
    required: ['nombre', 'objetivo', 'nivel', 'bloques', 'activa', 'creado_en'],
    properties: {
      nombre: { bsonType: 'string', minLength: 2, maxLength: 100 },
      objetivo: { bsonType: 'string' },
      nivel: { enum: ['principiante', 'intermedio', 'avanzado'] },
      descripcion: { bsonType: ['string', 'null'], maxLength: 2000 },
      dias_semana: { bsonType: 'int', minimum: 1, maximum: 7 },
      bloques,
      activa: { bsonType: 'bool' },
      duplicada_de: { bsonType: ['objectId', 'null'] },
      creado_por: { bsonType: ['int', 'null'] },
      creado_en: { bsonType: 'date' },
      actualizado_en: { bsonType: 'date' },
    },
  },
});

asegurarColeccion('contenidos_rutina', {
  $jsonSchema: {
    bsonType: 'object',
    required: ['id_rutina', 'numero_version', 'bloques', 'creado_en'],
    properties: {
      id_rutina: { bsonType: 'int' },
      numero_version: { bsonType: 'int', minimum: 1 },
      id_socio: { bsonType: 'int' },
      id_plantilla: { bsonType: ['objectId', 'null'] },
      nombre_plantilla: { bsonType: ['string', 'null'] },
      bloques,
      autor: { bsonType: 'int' },
      creado_en: { bsonType: 'date' },
    },
  },
});

db.ejercicios.createIndex({ nombre: 1 }, { unique: true, collation: ES, name: 'uq_ejercicio_nombre' });
db.ejercicios.createIndex({ grupo_muscular: 1, activo: 1 }, { name: 'idx_ejercicio_grupo' });
db.ejercicios.createIndex({ contraindicaciones: 1 }, { name: 'idx_ejercicio_contraindicaciones' });

db.plantillas_rutina.createIndex({ nombre: 1 }, { unique: true, collation: ES, name: 'uq_plantilla_nombre' });
db.plantillas_rutina.createIndex({ activa: 1, objetivo: 1, nivel: 1 }, { name: 'idx_plantilla_filtros' });
db.plantillas_rutina.createIndex({ 'bloques.ejercicios.id_ejercicio': 1 }, { name: 'idx_plantilla_ejercicio' });

db.contenidos_rutina.createIndex({ id_rutina: 1, numero_version: 1 }, { unique: true, name: 'uq_contenido_version' });
db.contenidos_rutina.createIndex({ id_socio: 1, creado_en: -1 }, { name: 'idx_contenido_socio' });

// Catálogo base de ejercicios (solo si la colección está vacía)
// Las contraindicaciones usan las mismas etiquetas que
// ficha_salud.restricciones_rutina para sugerir plantillas seguras.
if (db.ejercicios.countDocuments() === 0) {
  const ahora = new Date();
  const e = (nombre, grupo_muscular, equipo, descripcion, contraindicaciones = []) => ({
    nombre, grupo_muscular, equipo, descripcion, contraindicaciones, activo: true, creado_por: null, creado_en: ahora, actualizado_en: ahora,
  });
  db.ejercicios.insertMany([
    e('Caminata en caminadora', 'cardio', 'Caminadora', 'Ritmo moderado, inclinación ligera.'),
    e('Bicicleta estática', 'cardio', 'Bicicleta', 'Cadencia constante, resistencia media.'),
    e('Saltos de tijera', 'cardio', 'Ninguno', 'Calentamiento dinámico de cuerpo completo.', ['sin_impacto', 'sin_saltos', 'evitar_rodilla']),
    e('Movilidad articular', 'cuerpo_completo', 'Ninguno', 'Círculos de hombro, cadera, rodilla y tobillo.'),
    e('Sentadilla con barra', 'piernas', 'Barra olímpica', 'Espalda neutra, rodillas alineadas con los pies.', ['evitar_rodilla', 'evitar_lumbar', 'sin_carga_axial']),
    e('Prensa de piernas', 'piernas', 'Prensa', 'Rango controlado sin bloquear rodillas.', ['evitar_rodilla']),
    e('Puente de glúteo', 'gluteos', 'Ninguno', 'Elevar cadera apretando glúteos.'),
    e('Peso muerto rumano', 'isquiotibiales', 'Mancuernas', 'Bisagra de cadera con espalda neutra.', ['evitar_lumbar']),
    e('Press de banca', 'pecho', 'Barra y banco', 'Escápulas retraídas, bajar al pecho medio.', ['evitar_hombro']),
    e('Lagartijas', 'pecho', 'Ninguno', 'Cuerpo alineado; versión en rodillas para principiantes.', ['evitar_hombro']),
    e('Remo con mancuerna', 'espalda', 'Mancuerna y banco', 'Codo pegado al cuerpo, sin girar el torso.'),
    e('Jalón al pecho', 'espalda', 'Polea alta', 'Llevar la barra a la clavícula.'),
    e('Press militar', 'hombro', 'Mancuernas', 'Sentado, sin arquear la espalda.', ['evitar_hombro', 'sin_carga_axial']),
    e('Plancha', 'core', 'Ninguno', 'Mantener cadera alineada.'),
    e('Estiramiento de isquiotibiales', 'estiramiento', 'Ninguno', 'Mantener 30 segundos por lado.'),
    e('Estiramiento de pectoral', 'estiramiento', 'Ninguno', 'Brazo apoyado en pared, 30 segundos.'),
  ]);
}

print(`gymhub_rutinas listo: ${db.ejercicios.countDocuments()} ejercicios, ${db.plantillas_rutina.countDocuments()} plantillas.`);
