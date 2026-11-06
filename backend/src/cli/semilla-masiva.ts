/**
 * Datos masivos de DESARROLLO (no ejecutar en producción).
 *
 *   npm run build && npm run semilla:masiva                 # 500 socios
 *   npm run semilla:masiva -- --socios=800 --semilla=7      # otra cantidad / otra aleatoriedad
 *   npm run semilla:masiva -- --limpiar                     # borra lo generado por este script
 *
 * Simula ~10 meses de operación (desde el 5 de enero) con la misma lógica del backend:
 * socios con datos cifrados (AES-256-GCM + índices ciegos), membresías encadenadas con
 * renovaciones anticipadas o tardías, congelamientos, pagos (algunos cancelados), asistencias con
 * horas pico, fichas de salud, rutinas (Mongo + versiones), sesiones de la app, datos de Health
 * Connect, segmentos, campañas, notificaciones, riesgos de deserción con acciones, bitácora,
 * interacciones y solicitudes ARCO.
 *
 * Todo lo generado queda registrado en Mongo (`semilla_meta`) para poder borrarlo con --limpiar.
 * Los estados de membresía y el riesgo se calculan igual que en el backend (vista y reglas).
 */
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import bcrypt from 'bcryptjs';
import { type Collection, ObjectId } from 'mongodb';
import { randomBytes, randomUUID } from 'node:crypto';
import { CryptoModule } from '../common/crypto/crypto.module.js';
import { EncryptionService, normalizarCorreo, normalizarTelefono } from '../common/crypto/encryption.service.js';
import { aFecha, diferenciaDias, hoyISO, sumarDias } from '../common/utils/fechas.js';
import { MongoModule } from '../mongo/mongo.module.js';
import { type BloqueDoc, MongoService } from '../mongo/mongo.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, CryptoModule, MongoModule] })
class SemillaModule {}

const log = new Logger('Semilla');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const TOTAL_SOCIOS = Number(args.socios ?? 500);
const INICIO = '2026-01-05';
const HOY = hoyISO();
const AHORA = new Date();
const PASSWORD_APP = 'Socio#2026';
const LOTE = 200;

// ---------------------------------------------------------------------------
// Aleatoriedad reproducible (mulberry32)
// ---------------------------------------------------------------------------
let estadoRnd = Number(args.semilla ?? 2026) >>> 0;
function rnd(): number {
  estadoRnd = (estadoRnd + 0x6d2b79f5) | 0;
  let t = Math.imul(estadoRnd ^ (estadoRnd >>> 15), 1 | estadoRnd);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const entero = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const prob = (p: number) => rnd() < p;
const elegir = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
function ponderado<T>(pares: readonly (readonly [T, number])[]): T {
  const total = pares.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pares) if ((r -= w) <= 0) return v;
  return pares[pares.length - 1]![0];
}
const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha y hora local del gimnasio (México no tiene horario de verano: UTC-6). */
const local = (iso: string, h: number, m: number, s = 0) => new Date(`${iso}T${pad(h)}:${pad(m)}:${pad(s)}-06:00`);
const masMinutos = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
const diaSemana = (iso: string) => ((aFecha(iso).getUTCDay() + 6) % 7) + 1; // 1 = lunes
const lotes = <T>(xs: T[], n = LOTE) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------
const NOMBRES_M = ['José', 'Luis', 'Carlos', 'Juan', 'Miguel', 'Jorge', 'Alejandro', 'Fernando', 'Ricardo', 'Eduardo', 'Daniel', 'Roberto', 'Diego', 'Andrés', 'Sergio', 'Javier', 'Raúl', 'Arturo', 'Héctor', 'Emiliano', 'Santiago', 'Sebastián', 'Mateo', 'Iván', 'Óscar', 'Rodrigo', 'Pablo', 'Gerardo', 'Adrián', 'Ángel', 'Manuel', 'Francisco', 'Hugo', 'Leonardo', 'Rafael', 'Armando'];
const NOMBRES_F = ['María', 'Guadalupe', 'Fernanda', 'Sofía', 'Valeria', 'Daniela', 'Mariana', 'Ana', 'Gabriela', 'Alejandra', 'Paola', 'Andrea', 'Karla', 'Patricia', 'Ximena', 'Regina', 'Camila', 'Renata', 'Lucía', 'Isabel', 'Verónica', 'Claudia', 'Mónica', 'Diana', 'Natalia', 'Jimena', 'Laura', 'Elena', 'Itzel', 'Brenda', 'Adriana', 'Rocío', 'Leticia', 'Paulina', 'Valentina', 'Montserrat'];
const APELLIDOS = ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Reyes', 'Jiménez', 'Torres', 'Díaz', 'Gutiérrez', 'Ruiz', 'Mendoza', 'Aguilar', 'Ortiz', 'Moreno', 'Castillo', 'Romero', 'Álvarez', 'Méndez', 'Chávez', 'Rivera', 'Juárez', 'Ramos', 'Domínguez', 'Herrera', 'Medina', 'Castro', 'Vargas', 'Guzmán', 'Velázquez', 'Salazar', 'Navarro', 'Rojas', 'Contreras', 'Luna', 'Ríos', 'Campos', 'Cervantes', 'Estrada', 'Orozco', 'Delgado'];
const DOMINIOS = ['gmail.com', 'gmail.com', 'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.mx', 'icloud.com'];
const PARENTESCOS = ['madre', 'padre', 'esposa', 'esposo', 'hermana', 'hermano', 'pareja', 'hija', 'hijo', 'amiga', 'amigo'];
const OBJETIVOS = ['perder_peso', 'ganar_masa', 'tonificar', 'resistencia', 'salud_general', 'rehabilitacion', 'otro'] as const;
const RESTRICCIONES = ['evitar_rodilla', 'evitar_lumbar', 'evitar_hombro', 'sin_impacto', 'sin_saltos', 'sin_carga_axial'] as const;
const LESION_DE: Record<string, string> = {
  evitar_rodilla: 'Condromalacia rotuliana en rodilla derecha.',
  evitar_lumbar: 'Hernia discal L4-L5, dolor lumbar ocasional.',
  evitar_hombro: 'Tendinitis del manguito rotador (hombro izquierdo).',
  sin_impacto: 'Esguince de tobillo reciente.',
  sin_saltos: 'Fascitis plantar.',
  sin_carga_axial: 'Protrusión cervical, evitar carga sobre la columna.',
};
const MOTIVOS_BAJA = ['Cambio de domicilio', 'Motivos económicos', 'Falta de tiempo por trabajo', 'Se cambió a otro gimnasio', 'Lesión que le impide entrenar', 'Viaje prolongado'];
const NOTAS = [
  'Preguntó por el plan anual y sus beneficios.',
  'Solicitó cambio de horario de su entrenador.',
  'Comentó que la regadera del vestidor 2 no funciona.',
  'Pidió información para inscribir a un familiar.',
  'Interesado en clases grupales de funcional.',
  'Se le explicó cómo activar la app.',
  'Reportó molestia en la rodilla; se avisó al entrenador.',
  'Quiere pagar con transferencia la próxima renovación.',
];

type Perfil = 'fiel' | 'regular' | 'ocasional' | 'desertor';
const PERFILES: Record<Perfil, { visitas: number; renueva: number; planes: [number, number, number] }> = {
  fiel: { visitas: 4.2, renueva: 0.95, planes: [0.45, 0.35, 0.2] },
  regular: { visitas: 2.6, renueva: 0.78, planes: [0.65, 0.28, 0.07] },
  ocasional: { visitas: 1.3, renueva: 0.45, planes: [0.85, 0.15, 0] },
  desertor: { visitas: 2.4, renueva: 0.2, planes: [0.9, 0.1, 0] },
};
const FACTOR_DIA = [0, 1.18, 1.12, 1.08, 1.02, 0.9, 0.62, 0.3]; // índice 1 = lunes
const FACTOR_MES: Record<string, number> = { '01': 1.18, '02': 1.08, '03': 1.0, '04': 0.95, '05': 0.97, '06': 0.92, '07': 0.88, '08': 0.95, '09': 1.0, '10': 1.02, '11': 1.0 };

// Ejercicios extra (se agregan al catálogo si no existen) y plantillas realistas
const EJERCICIOS_EXTRA = [
  { nombre: 'Sentadilla goblet', grupo_muscular: 'piernas', equipo: 'mancuerna', contraindicaciones: ['evitar_rodilla'] },
  { nombre: 'Hip thrust con barra', grupo_muscular: 'gluteos', equipo: 'barra', contraindicaciones: [] },
  { nombre: 'Curl de bíceps con mancuerna', grupo_muscular: 'brazos', equipo: 'mancuerna', contraindicaciones: [] },
  { nombre: 'Extensión de tríceps en polea', grupo_muscular: 'brazos', equipo: 'polea', contraindicaciones: [] },
  { nombre: 'Elíptica', grupo_muscular: 'cardio', equipo: 'máquina', contraindicaciones: [] },
  { nombre: 'Remo en ergómetro', grupo_muscular: 'cardio', equipo: 'máquina', contraindicaciones: ['evitar_lumbar'] },
  { nombre: 'Abdominales bicicleta', grupo_muscular: 'core', equipo: 'ninguno', contraindicaciones: [] },
  { nombre: 'Estiramiento de cuádriceps', grupo_muscular: 'estiramiento', equipo: 'ninguno', contraindicaciones: [] },
  { nombre: 'Elevaciones laterales', grupo_muscular: 'hombro', equipo: 'mancuerna', contraindicaciones: ['evitar_hombro'] },
  { nombre: 'Extensión de rodilla isométrica', grupo_muscular: 'piernas', equipo: 'máquina', contraindicaciones: [] },
];
type E = [string, number, string, number]; // nombre, series, repeticiones, descanso
const PLANTILLAS: { nombre: string; objetivo: string; nivel: 'principiante' | 'intermedio' | 'avanzado'; dias: number; descripcion: string; bloques: [string, E[]][] }[] = [
  {
    nombre: 'Quema de grasa · Principiante', objetivo: 'perder_peso', nivel: 'principiante', dias: 3,
    descripcion: 'Circuito metabólico con cardio moderado para empezar a bajar de peso.',
    bloques: [
      ['calentamiento', [['Caminata en caminadora', 1, '8 min', 0], ['Movilidad articular', 1, '5 min', 0]]],
      ['cardio', [['Bicicleta estática', 1, '15 min', 60], ['Saltos de tijera', 3, '40 s', 30]]],
      ['fuerza', [['Sentadilla goblet', 3, '12', 60], ['Remo con mancuerna', 3, '12', 60], ['Plancha', 3, '30 s', 45]]],
      ['estiramiento', [['Estiramiento de isquiotibiales', 1, '60 s', 0], ['Estiramiento de cuádriceps', 1, '60 s', 0]]],
    ],
  },
  {
    nombre: 'Quema de grasa · Intermedio', objetivo: 'perder_peso', nivel: 'intermedio', dias: 4,
    descripcion: 'Intervalos y fuerza en superserie para aumentar el gasto calórico.',
    bloques: [
      ['calentamiento', [['Elíptica', 1, '8 min', 0]]],
      ['cardio', [['Remo en ergómetro', 5, '1 min fuerte/suave', 0]]],
      ['fuerza', [['Prensa de piernas', 4, '15', 60], ['Jalón al pecho', 4, '12', 60], ['Lagartijas', 3, '12', 45], ['Abdominales bicicleta', 3, '20', 30]]],
      ['estiramiento', [['Estiramiento de pectoral', 1, '60 s', 0]]],
    ],
  },
  {
    nombre: 'Hipertrofia · Torso / Pierna', objetivo: 'ganar_masa', nivel: 'intermedio', dias: 4,
    descripcion: 'División torso-pierna con volumen moderado y progresión de cargas.',
    bloques: [
      ['calentamiento', [['Movilidad articular', 1, '6 min', 0]]],
      ['fuerza', [['Press de banca', 4, '8-10', 90], ['Remo con mancuerna', 4, '10', 75], ['Press militar', 3, '10', 75], ['Sentadilla con barra', 4, '8', 120], ['Peso muerto rumano', 3, '10', 90], ['Curl de bíceps con mancuerna', 3, '12', 60]]],
      ['estiramiento', [['Estiramiento de pectoral', 1, '45 s', 0], ['Estiramiento de isquiotibiales', 1, '45 s', 0]]],
    ],
  },
  {
    nombre: 'Fuerza total · Avanzado', objetivo: 'ganar_masa', nivel: 'avanzado', dias: 5,
    descripcion: 'Básicos pesados con accesorios; requiere técnica dominada.',
    bloques: [
      ['calentamiento', [['Bicicleta estática', 1, '6 min', 0], ['Movilidad articular', 1, '6 min', 0]]],
      ['fuerza', [['Sentadilla con barra', 5, '5', 180], ['Press de banca', 5, '5', 150], ['Peso muerto rumano', 4, '6', 150], ['Press militar', 4, '6', 120], ['Jalón al pecho', 4, '8', 90], ['Extensión de tríceps en polea', 3, '12', 60]]],
      ['estiramiento', [['Estiramiento de isquiotibiales', 1, '60 s', 0]]],
    ],
  },
  {
    nombre: 'Tonificación full body', objetivo: 'tonificar', nivel: 'principiante', dias: 3,
    descripcion: 'Cuerpo completo con cargas ligeras y repeticiones altas.',
    bloques: [
      ['calentamiento', [['Elíptica', 1, '8 min', 0]]],
      ['fuerza', [['Puente de glúteo', 3, '15', 45], ['Sentadilla goblet', 3, '15', 60], ['Remo con mancuerna', 3, '15', 45], ['Elevaciones laterales', 3, '15', 45], ['Plancha', 3, '40 s', 45]]],
      ['estiramiento', [['Estiramiento de cuádriceps', 1, '45 s', 0], ['Estiramiento de pectoral', 1, '45 s', 0]]],
    ],
  },
  {
    nombre: 'Glúteo y pierna', objetivo: 'tonificar', nivel: 'intermedio', dias: 3,
    descripcion: 'Énfasis en glúteo e isquiotibiales con trabajo de core.',
    bloques: [
      ['calentamiento', [['Caminata en caminadora', 1, '8 min', 0]]],
      ['fuerza', [['Hip thrust con barra', 4, '12', 75], ['Peso muerto rumano', 4, '10', 90], ['Prensa de piernas', 4, '12', 75], ['Puente de glúteo', 3, '20', 45], ['Abdominales bicicleta', 3, '20', 30]]],
      ['estiramiento', [['Estiramiento de isquiotibiales', 1, '60 s', 0]]],
    ],
  },
  {
    nombre: 'Resistencia cardiovascular', objetivo: 'resistencia', nivel: 'intermedio', dias: 4,
    descripcion: 'Trabajo aeróbico progresivo y fuerza-resistencia.',
    bloques: [
      ['calentamiento', [['Movilidad articular', 1, '5 min', 0]]],
      ['cardio', [['Caminata en caminadora', 1, '20 min inclinada', 0], ['Remo en ergómetro', 1, '10 min', 0], ['Bicicleta estática', 1, '15 min', 0]]],
      ['fuerza', [['Lagartijas', 3, '15', 45], ['Plancha', 3, '45 s', 30]]],
      ['estiramiento', [['Estiramiento de cuádriceps', 1, '60 s', 0]]],
    ],
  },
  {
    nombre: 'Salud y movilidad', objetivo: 'salud_general', nivel: 'principiante', dias: 3,
    descripcion: 'Bajo impacto: movilidad, cardio suave y fuerza básica.',
    bloques: [
      ['calentamiento', [['Movilidad articular', 1, '8 min', 0]]],
      ['cardio', [['Bicicleta estática', 1, '15 min', 0]]],
      ['fuerza', [['Puente de glúteo', 3, '12', 60], ['Jalón al pecho', 3, '12', 60], ['Plancha', 3, '20 s', 45]]],
      ['estiramiento', [['Estiramiento de isquiotibiales', 1, '60 s', 0], ['Estiramiento de pectoral', 1, '60 s', 0]]],
    ],
  },
  {
    nombre: 'Rehabilitación de rodilla', objetivo: 'rehabilitacion', nivel: 'principiante', dias: 2,
    descripcion: 'Sin impacto ni flexión profunda de rodilla. Validar con fisioterapeuta.',
    bloques: [
      ['calentamiento', [['Bicicleta estática', 1, '10 min suave', 0]]],
      ['fuerza', [['Extensión de rodilla isométrica', 3, '30 s', 60], ['Puente de glúteo', 3, '12', 60], ['Remo con mancuerna', 3, '12', 60], ['Plancha', 3, '20 s', 45]]],
      ['estiramiento', [['Estiramiento de isquiotibiales', 1, '60 s', 0]]],
    ],
  },
];
const GRUPOS_CARGA: Record<string, [number, number]> = { piernas: [20, 90], gluteos: [20, 80], isquiotibiales: [20, 70], pecho: [15, 70], espalda: [12, 55], hombro: [6, 35], brazos: [6, 25] };

// ---------------------------------------------------------------------------
// Modelo en memoria
// ---------------------------------------------------------------------------
interface PlanDb { id_plan: number; nombre: string; duracion_dias: number; precio: number }
interface MemSim {
  plan: PlanDb;
  inicio: string;
  venc: string;
  renovacion: boolean;
  anterior: MemSim | null;
  fechaPago: Date;
  metodo: 'efectivo' | 'tarjeta' | 'transferencia';
  registro: number;
  cancelada?: { motivo: string; en: Date };
  congelamiento?: { inicio: string; fin: string; dias: number; motivo: string };
  id?: number;
}
interface VisitaSim { fecha: Date; dia: string; sede: number; mem: MemSim | null; estado: 'vigente' | 'por_vencer' | 'vencida'; metodo: 'qr' | 'busqueda'; registro: number }
interface SocioSim {
  nombre: string;
  sexo: 'M' | 'F';
  nacimiento: string;
  telefono: string;
  correo: string;
  contacto: { nombre: string; parentesco: string; telefono: string };
  sede: number;
  objetivo: (typeof OBJETIVOS)[number] | null;
  alta: string;
  perfil: Perfil;
  horaBase: number;
  ultimaActividad: string;
  mems: MemSim[];
  visitas: VisitaSim[];
  app: { activada: string; hc: boolean; revocaNotif: string | null } | null;
  baja: { fecha: string; motivo: string } | null;
  id?: number;
}

function quitarAcentos(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}

async function main() {
  const app = await NestFactory.createApplicationContext(SemillaModule, { logger: ['log', 'error', 'warn'] });
  const prisma = app.get(PrismaService);
  const crypto = app.get(EncryptionService);
  const mongo = app.get(MongoService);
  const meta = mongo.db.collection<MetaSemilla>('semilla_meta');

  try {
    if (args.limpiar) {
      await limpiar(prisma, mongo, meta);
      return;
    }
    const corrida = await generar(prisma, crypto, mongo);
    await meta.updateOne({ _id: 'semilla' }, { $push: { corridas: corrida } }, { upsert: true });
  } finally {
    await app.close();
  }
}

interface MetaSemilla {
  _id: string;
  corridas: Corrida[];
}

interface Corrida {
  fecha: Date;
  socios: number[];
  usuarios: number[];
  segmentos: number[];
  campanas: number[];
  ejercicios: ObjectId[];
  plantillas: ObjectId[];
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------
async function generar(prisma: PrismaService, crypto: EncryptionService, mongo: MongoService): Promise<Corrida> {
  const t0 = Date.now();
  const corrida: Corrida = { fecha: new Date(), socios: [], usuarios: [], segmentos: [], campanas: [], ejercicios: [], plantillas: [] };

  // --- Personal: completa recepción y entrenadores por sede (contraseña igual a la del admin)
  const admin = await prisma.usuario.findFirst({ where: { es_admin_general: true }, orderBy: { id_usuario: 'asc' } });
  if (!admin) throw new Error('No hay administrador: aplica primero database/sqlserver/seed_dev.sql.');
  const nuevosUsuarios = [
    { correo: 'recepcion.norte@gymhub.dev', nombre: 'Recepción Norte', rol: 2, sedes: [2] },
    { correo: 'entrenadora.norte@gymhub.dev', nombre: 'Karen Solís (Entrenadora Norte)', rol: 3, sedes: [2] },
    { correo: 'entrenador.fuerza@gymhub.dev', nombre: 'Marco Ibarra (Entrenador Matriz)', rol: 3, sedes: [1] },
  ];
  for (const u of nuevosUsuarios) {
    const existente = await prisma.usuario.findFirst({ where: { correo: u.correo } });
    if (existente) {
      corrida.usuarios.push(existente.id_usuario); // creado por una corrida anterior de la semilla
      continue;
    }
    const creado = await prisma.usuario.create({
      data: { id_rol: u.rol, nombre: u.nombre, correo: u.correo, password_hash: admin.password_hash, es_admin_general: false },
    });
    await prisma.usuarioSede.createMany({ data: u.sedes.map((id_sede) => ({ id_usuario: creado.id_usuario, id_sede })) });
    corrida.usuarios.push(creado.id_usuario);
  }
  const personal = await prisma.usuario.findMany({ where: { activo: true }, include: { sedes: true } });
  const deRol = (rol: number, sede: number) => personal.filter((p) => p.id_rol === rol && p.sedes.some((s) => s.id_sede === sede)).map((p) => p.id_usuario);
  const recepcion = (sede: number) => {
    const r = deRol(2, sede);
    return r.length && prob(0.9) ? elegir(r) : admin.id_usuario;
  };
  const entrenador = (sede: number) => {
    const e = deRol(3, sede);
    return e.length ? elegir(e) : elegir(personal.filter((p) => p.id_rol === 3).map((p) => p.id_usuario));
  };

  const planes: PlanDb[] = (await prisma.planMembresia.findMany({ where: { activo: true }, orderBy: { duracion_dias: 'asc' } })).map((p) => ({
    id_plan: p.id_plan,
    nombre: p.nombre,
    duracion_dias: p.duracion_dias,
    precio: Number(p.precio),
  }));
  const planDe = (dias: number) => planes.find((p) => p.duracion_dias === dias) ?? planes[0]!;
  const [mensual, trimestral, anual] = [planDe(30), planDe(90), planDe(365)];
  const aviso = await prisma.avisoPrivacidad.findFirst({ orderBy: { vigente_desde: 'desc' } });
  if (!aviso) throw new Error('No hay aviso de privacidad.');
  const sedes = (await prisma.sede.findMany({ where: { activa: true } })).map((s) => s.id_sede);
  const diasAviso = (await prisma.configRiesgo.findFirst({ where: { id_sede: null } }))?.dias_aviso_vencimiento ?? 7;
  const diasInactividad = (await prisma.configRiesgo.findFirst({ where: { id_sede: null } }))?.dias_inactividad ?? 10;

  // --- Catálogo de Mongo: ejercicios y plantillas
  const ejercicios = new Map((await mongo.ejercicios.find().toArray()).map((e) => [e.nombre, e]));
  for (const e of EJERCICIOS_EXTRA) {
    if (ejercicios.has(e.nombre)) continue;
    const doc = { _id: new ObjectId(), ...e, descripcion: null, media_url: null, media_tipo: null, activo: true, creado_por: admin.id_usuario, creado_en: new Date(), actualizado_en: new Date(), semilla: true };
    await mongo.ejercicios.insertOne(doc);
    ejercicios.set(e.nombre, doc);
    corrida.ejercicios.push(doc._id);
  }
  for (const e of ejercicios.values()) gruposPorNombre.set(e.nombre, e.grupo_muscular);
  const plantillas: { _id: ObjectId; nombre: string; objetivo: string; dias: number; bloques: BloqueDoc[]; contraindicaciones: Set<string> }[] = [];
  for (const p of PLANTILLAS) {
    const bloques: BloqueDoc[] = p.bloques.map(([tipo, lista], i) => ({
      tipo,
      orden: i + 1,
      ejercicios: lista.map(([nombre, series, repeticiones, descanso_seg]) => {
        const e = ejercicios.get(nombre);
        if (!e) throw new Error(`Falta el ejercicio "${nombre}" en el catálogo.`);
        return { id_ejercicio: e._id, nombre, series, repeticiones, descanso_seg, notas: null };
      }),
    }));
    const contraindicaciones = new Set(bloques.flatMap((b) => b.ejercicios.flatMap((x) => ejercicios.get(x.nombre)!.contraindicaciones)));
    const existente = await mongo.plantillas.findOne({ nombre: p.nombre });
    if (existente) {
      plantillas.push({ _id: existente._id, nombre: p.nombre, objetivo: p.objetivo, dias: p.dias, bloques: existente.bloques, contraindicaciones });
      continue;
    }
    const doc = { _id: new ObjectId(), nombre: p.nombre, objetivo: p.objetivo, nivel: p.nivel, descripcion: p.descripcion, dias_semana: p.dias, bloques, activa: true, duplicada_de: null, creado_por: entrenador(1), creado_en: local(INICIO, 9, 0), actualizado_en: local(INICIO, 9, 0), semilla: true };
    await mongo.plantillas.insertOne(doc);
    corrida.plantillas.push(doc._id);
    plantillas.push({ _id: doc._id, nombre: p.nombre, objetivo: p.objetivo, dias: p.dias, bloques, contraindicaciones });
  }

  // --- Unicidad contra lo que ya existe
  const existentes = await prisma.socio.findMany({ select: { correo_hash: true, telefono_hash: true } });
  const hashes = new Set(existentes.flatMap((s) => [s.correo_hash, s.telefono_hash]));

  // =========================================================================
  // 1. Simulación en memoria
  // =========================================================================
  const totalDias = diferenciaDias(INICIO, HOY);
  const horaActual = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hourCycle: 'h23' }).format(AHORA));
  const socios: SocioSim[] = [];
  while (socios.length < TOTAL_SOCIOS) {
    const sexo = prob(0.52) ? 'F' : 'M';
    const nombre = `${elegir(sexo === 'F' ? NOMBRES_F : NOMBRES_M)}${prob(0.25) ? ' ' + elegir(sexo === 'F' ? NOMBRES_F : NOMBRES_M) : ''}`;
    const ap1 = elegir(APELLIDOS);
    const ap2 = elegir(APELLIDOS);
    const correo = normalizarCorreo(`${quitarAcentos(nombre.split(' ')[0]!)}${prob(0.5) ? '.' : '_'}${quitarAcentos(ap1)}${prob(0.6) ? entero(1, 999) : ''}@${elegir(DOMINIOS)}`);
    const telefono = normalizarTelefono(`55${entero(10000000, 99999999)}`);
    const hc = crypto.hashCorreo(correo);
    const ht = crypto.hashTelefono(telefono);
    if (hashes.has(hc) || hashes.has(ht)) continue;
    hashes.add(hc).add(ht);

    // Más altas en los meses recientes (crecimiento del gimnasio)
    const alta = sumarDias(INICIO, Math.min(totalDias, Math.floor(Math.pow(rnd(), 0.8) * (totalDias + 1))));
    const perfil = ponderado<Perfil>([['fiel', 0.3], ['regular', 0.36], ['ocasional', 0.2], ['desertor', 0.14]]);
    const edad = ponderado([[entero(16, 22), 0.2], [entero(23, 35), 0.42], [entero(36, 50), 0.28], [entero(51, 72), 0.1]]);
    const s: SocioSim = {
      nombre: `${nombre} ${ap1} ${ap2}`,
      sexo,
      nacimiento: `${2026 - edad}-${pad(entero(1, 12))}-${pad(entero(1, 28))}`,
      telefono,
      correo,
      contacto: { nombre: `${elegir(prob(0.5) ? NOMBRES_F : NOMBRES_M)} ${ap1}`, parentesco: elegir(PARENTESCOS), telefono: `55${entero(10000000, 99999999)}` },
      sede: sedes.length > 1 && prob(0.36) ? sedes[1]! : sedes[0]!,
      objetivo: prob(0.9) ? ponderado<(typeof OBJETIVOS)[number]>([['perder_peso', 0.3], ['ganar_masa', 0.22], ['tonificar', 0.2], ['resistencia', 0.08], ['salud_general', 0.13], ['rehabilitacion', 0.04], ['otro', 0.03]]) : null,
      alta,
      perfil,
      horaBase: ponderado([[entero(6, 8), 0.4], [entero(12, 14), 0.15], [entero(17, 20), 0.45]]),
      ultimaActividad: HOY,
      mems: [],
      visitas: [],
      app: null,
      baja: null,
    };

    // --- Membresías encadenadas
    const cfg = PERFILES[perfil];
    let inicio = alta;
    let anterior: MemSim | null = null;
    let fechaPagoIso = alta;
    for (let vuelta = 0; vuelta < 40; vuelta++) {
      const plan = ponderado([[mensual, cfg.planes[0]], [trimestral, cfg.planes[1]], [anual, cfg.planes[2]]]);
      const sede = s.sede;
      const pago = local(fechaPagoIso, Math.max(6, Math.min(21, s.horaBase + entero(-1, 1))), entero(0, 59));
      const m: MemSim = {
        plan,
        inicio,
        venc: sumarDias(inicio, plan.duracion_dias - 1),
        renovacion: anterior !== null,
        anterior,
        fechaPago: pago > AHORA ? masMinutos(AHORA, -entero(5, 120)) : pago,
        metodo: ponderado([['efectivo', 0.45], ['tarjeta', 0.4], ['transferencia', 0.15]] as const),
        registro: recepcion(sede),
      };
      // Congelamiento ocasional (vacaciones, lesión), máximo 21 días
      if (plan.duracion_dias >= 30 && prob(0.05)) {
        const ci = sumarDias(m.inicio, entero(5, plan.duracion_dias - 10));
        if (ci <= HOY) {
          const dias = entero(7, 21);
          m.congelamiento = { inicio: ci, fin: sumarDias(ci, dias - 1), dias, motivo: elegir(['Vacaciones', 'Lesión', 'Viaje de trabajo', 'Incapacidad médica']) };
          m.venc = sumarDias(m.venc, dias);
        }
      }
      // Cobro equivocado: membresía y pago cancelados, y se vuelve a cobrar bien el mismo día
      if (prob(0.025)) {
        const equivocado = elegir(planes);
        s.mems.push({ ...m, plan: equivocado, venc: sumarDias(m.inicio, equivocado.duracion_dias - 1), congelamiento: undefined, cancelada: { motivo: elegir(['Cobro duplicado', 'Se registró el plan equivocado', 'El socio cambió de opinión el mismo día']), en: masMinutos(m.fechaPago, entero(3, 40)) } });
        m.fechaPago = masMinutos(m.fechaPago, entero(45, 90));
        if (m.fechaPago > AHORA) m.fechaPago = AHORA;
      }
      s.mems.push(m);
      anterior = m;

      const renueva = prob(perfil === 'desertor' && vuelta > 0 ? 0.05 : cfg.renueva);
      if (m.venc >= HOY) {
        // Vigente: algunos ya pagaron por adelantado la siguiente
        if (renueva && m.inicio <= HOY && diferenciaDias(HOY, m.venc) <= 5 && prob(0.35)) {
          fechaPagoIso = sumarDias(HOY, -entero(0, Math.min(3, diferenciaDias(m.inicio, HOY))));
          inicio = sumarDias(m.venc, 1);
          continue;
        }
        break;
      }
      if (!renueva) break;
      if (prob(0.55)) {
        // Renovación anticipada: se acumula al día siguiente del vencimiento
        fechaPagoIso = sumarDias(m.venc, -entero(0, 5));
        inicio = sumarDias(m.venc, 1);
      } else {
        inicio = sumarDias(m.venc, entero(1, 25));
        fechaPagoIso = inicio;
        if (inicio > HOY) break;
      }
      if (fechaPagoIso > HOY) break;
    }
    // Cuidado: una renovación pagada hoy puede iniciar en el futuro; eso es válido.
    const validas = s.mems.filter((m) => !m.cancelada);
    const ultima = validas[validas.length - 1]!;

    // --- Actividad: desertores dejan de venir; algunos activos llevan días sin asistir (riesgo)
    if (perfil === 'desertor') s.ultimaActividad = sumarDias(alta, entero(10, 45));
    else if (ultima.venc >= HOY && perfil !== 'fiel' && prob(0.16)) s.ultimaActividad = sumarDias(HOY, -entero(diasInactividad, diasInactividad + 20));
    if (s.ultimaActividad < alta) s.ultimaActividad = alta;

    // --- Baja: algunos con membresía vencida hace tiempo
    if (ultima.venc < sumarDias(HOY, -25) && prob(0.35)) {
      const fecha = sumarDias(ultima.venc, entero(20, 60));
      if (fecha <= HOY) s.baja = { fecha, motivo: elegir(MOTIVOS_BAJA) };
    }

    // --- App móvil
    if (prob(perfil === 'fiel' ? 0.7 : perfil === 'regular' ? 0.5 : 0.25)) {
      const activada = sumarDias(alta, entero(0, 20));
      if (activada <= HOY) s.app = { activada, hc: prob(0.35), revocaNotif: prob(0.08) ? sumarDias(activada, entero(5, 60)) : null };
      if (s.app?.revocaNotif && s.app.revocaNotif > HOY) s.app.revocaNotif = null;
    }

    // --- Visitas
    const fin = s.baja ? s.baja.fecha : s.ultimaActividad;
    for (let d = alta; d <= fin && d <= HOY; d = sumarDias(d, 1)) {
      const m = validas.find((x) => x.inicio <= d && d <= x.venc) ?? null;
      const congelado = m?.congelamiento && m.congelamiento.inicio <= d && d <= m.congelamiento.fin;
      let estado: VisitaSim['estado'];
      let p = (cfg.visitas / 7) * FACTOR_DIA[diaSemana(d)]! * (FACTOR_MES[d.slice(5, 7)] ?? 1);
      if (!m) {
        // Vencido: a veces llega a entrenar y en recepción le avisan que renueve
        const previa = [...validas].reverse().find((x) => x.venc < d);
        if (!previa || diferenciaDias(previa.venc, d) > 7) continue;
        p *= 0.25;
        estado = 'vencida';
      } else {
        if (congelado) continue;
        estado = diferenciaDias(d, m.venc) <= diasAviso ? 'por_vencer' : 'vigente';
      }
      if (!prob(Math.min(0.95, p))) continue;
      const dia = diaSemana(d);
      const hora = dia === 6 ? entero(8, 12) : dia === 7 ? entero(9, 13) : Math.max(6, Math.min(21, s.horaBase + ponderado([[0, 0.6], [1, 0.2], [-1, 0.2]])));
      if (d === HOY && hora >= horaActual) continue;
      const sede = sedes.length > 1 && prob(0.04) ? sedes.find((x) => x !== s.sede)! : s.sede;
      s.visitas.push({
        fecha: local(d, hora, entero(0, 59), entero(0, 59)),
        dia: d,
        sede,
        mem: m,
        estado,
        metodo: s.app ? (prob(0.75) ? 'qr' : 'busqueda') : prob(0.2) ? 'qr' : 'busqueda',
        registro: recepcion(sede),
      });
    }
    socios.push(s);
  }
  socios.sort((a, b) => a.alta.localeCompare(b.alta));
  log.log(`Simulados ${socios.length} socios, ${socios.reduce((n, s) => n + s.mems.length, 0)} membresías y ${socios.reduce((n, s) => n + s.visitas.length, 0)} visitas.`);

  // =========================================================================
  // 2. Persistencia
  // =========================================================================
  // --- Socios (en orden de alta: los folios crecen con la fecha)
  for (const s of socios) {
    const creadoPor = recepcion(s.sede);
    const creado = await prisma.socio.create({
      data: {
        folio: `TMP-${randomBytes(8).toString('hex')}`,
        id_sede: s.sede,
        nombre: s.nombre,
        fecha_nacimiento: aFecha(s.nacimiento),
        telefono_cifrado: crypto.cifrar(s.telefono),
        telefono_hash: crypto.hashTelefono(s.telefono),
        correo_cifrado: crypto.cifrar(s.correo),
        correo_hash: crypto.hashCorreo(s.correo),
        contacto_emergencia_cifrado: crypto.cifrarJson(s.contacto),
        objetivo: s.objetivo,
        estado: s.baja ? 'baja' : 'activo',
        fecha_alta: aFecha(s.alta),
        fecha_baja: s.baja ? aFecha(s.baja.fecha) : null,
        motivo_baja: s.baja?.motivo ?? null,
        creado_por: creadoPor,
        creado_en: local(s.alta, Math.max(7, Math.min(20, s.horaBase)), entero(0, 59)),
      },
    });
    s.id = creado.id_socio;
    corrida.socios.push(creado.id_socio);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE socio SET folio = CONCAT('GH', RIGHT(CONCAT('000000', id_socio), 6)) WHERE folio LIKE 'TMP-%'`,
  );
  log.log('Socios creados.');

  // --- Consentimientos de aviso de privacidad
  await crearMuchos(prisma.consentimiento, socios.map((s) => ({ id_socio: s.id!, tipo: 'aviso_privacidad', id_aviso: aviso.id_aviso, otorgado: true, fecha: local(s.alta, 10, 0), origen: 'crm' })));

  // --- Membresías (cronológicas: la anterior siempre existe antes que la renovación)
  const todas = socios.flatMap((s) => s.mems.map((m) => ({ s, m }))).sort((a, b) => a.m.fechaPago.getTime() - b.m.fechaPago.getTime());
  for (const { s, m } of todas) {
    const creada = await prisma.membresia.create({
      data: {
        id_socio: s.id!,
        id_plan: m.plan.id_plan,
        fecha_inicio: aFecha(m.inicio),
        fecha_vencimiento: aFecha(m.venc),
        estado: m.cancelada ? 'cancelada' : 'activa',
        es_renovacion: m.renovacion,
        id_membresia_anterior: m.anterior?.id ?? null,
        creada_por: m.registro,
        creada_en: m.fechaPago,
      },
    });
    m.id = creada.id_membresia;
  }
  log.log(`Membresías creadas: ${todas.length}.`);

  // --- Pagos (folio P+AAAAMMDD-ID, como el backend)
  await crearMuchos(prisma.pago, todas.map(({ s, m }) => ({
    folio: `TMP-${randomBytes(8).toString('hex')}`,
    id_socio: s.id!,
    id_membresia: m.id!,
    id_plan: m.plan.id_plan,
    id_sede: s.sede,
    monto: m.plan.precio,
    metodo: m.metodo,
    referencia: m.metodo === 'tarjeta' ? `AUT-${entero(100000, 999999)}` : m.metodo === 'transferencia' ? `SPEI-${entero(10000000, 99999999)}` : null,
    estado: m.cancelada ? 'cancelado' : 'registrado',
    fecha_pago: m.fechaPago,
    registrado_por: m.registro,
    motivo_cancelacion: m.cancelada?.motivo ?? null,
    autorizado_por: m.cancelada ? admin.id_usuario : null,
    cancelado_en: m.cancelada?.en ?? null,
  })));
  await prisma.$executeRawUnsafe(
    `UPDATE pago SET folio = CONCAT('P', FORMAT(DATEADD(HOUR, -6, fecha_pago), 'yyyyMMdd'), '-', RIGHT(CONCAT('000000', id_pago), 6)) WHERE folio LIKE 'TMP-%'`,
  );

  // --- Congelamientos
  await crearMuchos(prisma.congelamientoMembresia, todas.filter(({ m }) => m.congelamiento).map(({ s, m }) => ({
    id_membresia: m.id!,
    fecha_inicio: aFecha(m.congelamiento!.inicio),
    fecha_fin: aFecha(m.congelamiento!.fin),
    dias_extendidos: m.congelamiento!.dias,
    motivo: m.congelamiento!.motivo,
    registrado_por: recepcion(s.sede),
    creado_en: local(sumarDias(m.congelamiento!.inicio, -1 * entero(0, 3)) < HOY ? sumarDias(m.congelamiento!.inicio, -1 * entero(0, 3)) : HOY, 11, entero(0, 59)),
  })));

  // --- Asistencias
  const visitas = socios.flatMap((s) => s.visitas.map((v) => ({ s, v }))).sort((a, b) => a.v.fecha.getTime() - b.v.fecha.getTime());
  await crearMuchos(prisma.asistencia, visitas.map(({ s, v }) => ({
    id_socio: s.id!,
    id_sede: v.sede,
    id_membresia: v.mem?.id ?? null,
    fecha_hora: v.fecha,
    metodo_registro: v.metodo,
    estado_membresia: v.estado,
    registrado_por: v.registro,
  })));
  log.log(`Asistencias creadas: ${visitas.length}.`);

  // --- Interacciones de la línea de tiempo
  const interacciones: object[] = [];
  for (const { s, m } of todas) {
    if (m.cancelada) {
      interacciones.push({ id_socio: s.id!, tipo: 'pago', descripcion: `Pago cancelado. Motivo: ${m.cancelada.motivo}`, id_usuario: admin.id_usuario, fecha: m.cancelada.en });
      continue;
    }
    interacciones.push({ id_socio: s.id!, tipo: m.renovacion ? 'renovacion' : 'otro', descripcion: `${m.renovacion ? 'Renovación' : 'Alta'} de membresía "${m.plan.nombre}" (${m.inicio} a ${m.venc}).`, id_usuario: m.registro, fecha: m.fechaPago });
    if (m.congelamiento) {
      interacciones.push({ id_socio: s.id!, tipo: 'otro', descripcion: `Membresía congelada del ${m.congelamiento.inicio} al ${m.congelamiento.fin} (${m.congelamiento.dias} días). Motivo: ${m.congelamiento.motivo}.`, id_usuario: m.registro, fecha: local(m.congelamiento.inicio, 10, 0) });
    }
  }
  for (const s of socios) {
    if (s.baja) interacciones.push({ id_socio: s.id!, tipo: 'otro', descripcion: `Baja del socio. Motivo: ${s.baja.motivo}`, id_usuario: recepcion(s.sede), fecha: local(s.baja.fecha, 12, 0) });
    for (let i = 0, n = prob(0.4) ? entero(1, 3) : 0; i < n; i++) {
      const d = sumarDias(s.alta, entero(0, Math.max(0, diferenciaDias(s.alta, s.baja?.fecha ?? HOY))));
      interacciones.push({ id_socio: s.id!, tipo: prob(0.7) ? 'nota' : 'llamada', descripcion: elegir(NOTAS), id_usuario: recepcion(s.sede), fecha: local(d, entero(8, 20), entero(0, 59)) });
    }
  }

  // --- App: cuentas, consentimientos y preferencias
  const hashApp = await bcrypt.hash(PASSWORD_APP, 12);
  const conApp = socios.filter((s) => s.app);
  await crearMuchos(prisma.cuentaApp, conApp.map((s) => {
    const ultimaVisita = s.visitas[s.visitas.length - 1]?.fecha;
    return { id_socio: s.id!, password_hash: hashApp, activada: true, activada_en: local(s.app!.activada, 19, entero(0, 59)), ultimo_acceso: ultimaVisita ? masMinutos(ultimaVisita, entero(5, 300)) : local(s.app!.activada, 20, 0) };
  }));
  const consentimientos: object[] = [];
  for (const s of conApp) {
    consentimientos.push({ id_socio: s.id!, tipo: 'notificaciones', id_aviso: aviso.id_aviso, otorgado: true, fecha: local(s.app!.activada, 19, 30), origen: 'app' });
    if (s.app!.revocaNotif) consentimientos.push({ id_socio: s.id!, tipo: 'notificaciones', id_aviso: aviso.id_aviso, otorgado: false, fecha: local(s.app!.revocaNotif, 21, 0), origen: 'app' });
    if (s.app!.hc) consentimientos.push({ id_socio: s.id!, tipo: 'health_connect', id_aviso: aviso.id_aviso, otorgado: true, fecha: local(s.app!.activada, 19, 40), origen: 'app' });
  }
  await crearMuchos(prisma.preferenciaNotificacion, conApp.filter(() => prob(0.12)).map((s) => ({ id_socio: s.id!, categoria: 'promociones', habilitada: false })));

  // --- Fichas de salud
  const fichas = new Map<number, string[]>();
  const fichasData: object[] = [];
  for (const s of socios) {
    if (!prob(s.perfil === 'fiel' ? 0.75 : 0.5)) continue;
    const restr = prob(0.2) ? [...new Set([elegir(RESTRICCIONES), ...(prob(0.3) ? [elegir(RESTRICCIONES)] : [])])] : [];
    const fecha = sumarDias(s.alta, entero(0, 10)) <= HOY ? sumarDias(s.alta, entero(0, 10)) : s.alta;
    const porApp = !!s.app && prob(0.4);
    const datos = {
      antecedentes: ponderado([[null, 0.6], ['Hipertensión controlada con medicamento.', 0.12], ['Diabetes tipo 2.', 0.06], ['Asma leve.', 0.1], ['Cirugía de apendicitis (2019).', 0.12]]),
      lesiones: restr.length ? restr.map((r) => LESION_DE[r]).join(' ') : null,
      alergias: ponderado([[null, 0.8], ['Penicilina.', 0.1], ['Ninguna conocida.', 0.1]]),
      medicamentos: ponderado([[null, 0.75], ['Losartán 50 mg.', 0.1], ['Metformina 850 mg.', 0.05], ['Salbutamol (rescate).', 0.1]]),
    };
    consentimientos.push({ id_socio: s.id!, tipo: 'datos_salud', id_aviso: aviso.id_aviso, otorgado: true, fecha: local(fecha, 10, 30), origen: porApp ? 'app' : 'crm' });
    const nivel = ponderado([['sedentario', 0.3], ['bajo', 0.3], ['medio', 0.3], ['alto', 0.1]]);
    fichasData.push({ id_socio: s.id!, version: 1, datos_cifrados: crypto.cifrarJson(datos), nivel_actividad: nivel, objetivo: s.objetivo ? s.objetivo.replace('_', ' ') : null, restricciones_rutina: restr.length ? JSON.stringify(restr) : null, origen: porApp ? 'app' : 'crm', actualizado_por_usuario: porApp ? null : recepcion(s.sede), creado_en: local(fecha, 10, 35) });
    if (prob(0.22)) {
      const f2 = sumarDias(fecha, entero(30, 120));
      if (f2 <= HOY) fichasData.push({ id_socio: s.id!, version: 2, datos_cifrados: crypto.cifrarJson({ ...datos, antecedentes: datos.antecedentes ?? 'Sin cambios relevantes.' }), nivel_actividad: nivel === 'sedentario' ? 'bajo' : nivel === 'bajo' ? 'medio' : nivel, objetivo: s.objetivo ? s.objetivo.replace('_', ' ') : null, restricciones_rutina: restr.length ? JSON.stringify(restr) : null, origen: 'crm', actualizado_por_usuario: entrenador(s.sede), creado_en: local(f2, 11, 0) });
    }
    fichas.set(s.id!, restr);
  }
  await crearMuchos(prisma.consentimiento, consentimientos);
  await crearMuchos(prisma.fichaSalud, fichasData);
  log.log(`App: ${conApp.length} cuentas. Fichas de salud: ${fichasData.length}.`);

  // --- Rutinas (SQL + contenido inmutable en Mongo) y sesiones de entrenamiento
  const notificaciones: object[] = [];
  const sesiones: object[] = [];
  const contenidos: Record<string, unknown>[] = [];
  let rutinas = 0;
  for (const s of socios) {
    const restr = fichas.get(s.id!);
    if (!restr || s.perfil === 'ocasional' || !prob(0.75)) continue;
    const compatibles = plantillas.filter((p) => ![...p.contraindicaciones].some((c) => restr.includes(c)));
    const opciones = compatibles.filter((p) => p.objetivo === s.objetivo);
    let plantilla = elegir(opciones.length ? opciones : compatibles.length ? compatibles : plantillas);
    let inicio = sumarDias(s.alta, entero(1, 8));
    const finActividad = s.baja?.fecha ?? HOY;
    while (inicio <= finActividad) {
      // ¿Se reemplaza más adelante por otra rutina?
      const reemplazo = prob(0.18) ? sumarDias(inicio, entero(45, 100)) : null;
      const finRutina = reemplazo && reemplazo < finActividad ? reemplazo : null;
      const idEnt = entrenador(s.sede);
      const rutina = await prisma.rutinaAsignada.create({
        data: {
          id_socio: s.id!,
          plantilla_mongo_id: plantilla._id.toHexString(),
          id_entrenador: idEnt,
          estado: finRutina ? 'reemplazada' : s.baja ? 'finalizada' : 'vigente',
          sesiones_planeadas_semana: plantilla.dias,
          fecha_inicio: aFecha(inicio),
          fecha_fin: finRutina ? aFecha(finRutina) : s.baja ? aFecha(s.baja.fecha) : null,
          creada_en: local(inicio, 10, entero(0, 59)),
        },
      });
      rutinas++;
      // Versiones: la 1 y, a veces, un ajuste posterior
      const versiones: { numero: number; desde: string; bloques: BloqueDoc[]; motivo: string | null; id?: number }[] = [{ numero: 1, desde: inicio, bloques: plantilla.bloques, motivo: null }];
      const ajuste = sumarDias(inicio, entero(21, 45));
      if (prob(0.35) && ajuste <= (finRutina ?? finActividad)) {
        const motivo = elegir(['Aumento de cargas por buena adherencia', 'Se agregan series en el bloque de fuerza', 'Ajuste por molestia: se reducen repeticiones', 'Cambio de cardio por preferencia del socio']);
        const bloques = plantilla.bloques.map((b) => ({ ...b, ejercicios: b.ejercicios.map((e) => (b.tipo === 'fuerza' && motivo.includes('series') ? { ...e, series: e.series + 1 } : e)) }));
        versiones.push({ numero: 2, desde: ajuste, bloques, motivo });
      }
      for (const v of versiones) {
        const idContenido = new ObjectId();
        const rv = await prisma.rutinaVersion.create({
          data: { id_rutina: rutina.id_rutina, numero_version: v.numero, contenido_mongo_id: idContenido.toHexString(), motivo: v.motivo, autor: idEnt, fecha: local(v.desde, 10, 30) },
        });
        v.id = rv.id_version;
        contenidos.push({ _id: idContenido, id_rutina: rutina.id_rutina, numero_version: v.numero, id_socio: s.id!, id_plantilla: plantilla._id, nombre_plantilla: plantilla.nombre, bloques: v.bloques, autor: idEnt, creado_en: local(v.desde, 10, 30), semilla: true });
        interacciones.push({ id_socio: s.id!, tipo: 'cambio_rutina', descripcion: v.numero === 1 ? `Rutina "${plantilla.nombre}" asignada desde el ${v.desde}.` : `Rutina ajustada (versión ${v.numero}): ${v.motivo}`, id_usuario: idEnt, fecha: local(v.desde, 10, 30) });
        if (s.app && s.app.activada <= v.desde) {
          notificaciones.push(notif(s.id!, null, 'rutina', 'rutina', 'Tu rutina se actualizó', v.numero === 1 ? `Tu entrenador te asignó la rutina "${plantilla.nombre}". Ábrela en la app.` : `Tu entrenador ajustó tu rutina: ${v.motivo}`, local(v.desde, 10, 31)));
        }
      }
      // Sesiones registradas en la app durante las visitas
      if (s.app) {
        for (const vis of s.visitas) {
          if (vis.dia < inicio || (finRutina && vis.dia >= finRutina) || vis.dia < s.app.activada) continue;
          if (!prob(s.perfil === 'fiel' ? 0.85 : 0.65)) continue;
          const v = [...versiones].reverse().find((x) => x.desde <= vis.dia)!;
          const semanas = Math.max(0, diferenciaDias(inicio, vis.dia) / 7);
          const realizados = v.bloques.filter((b) => b.tipo === 'fuerza').flatMap((b) => b.ejercicios).map((e) => {
            const grupo = ejercicios_grupo(e.nombre);
            const rango = GRUPOS_CARGA[grupo];
            const base = rango ? rango[0] + (rango[1] - rango[0]) * (s.sexo === 'M' ? 0.55 : 0.35) : 0;
            const carga = rango ? Math.round((base * (1 + Math.min(0.35, semanas * 0.02))) / 2.5) * 2.5 : undefined;
            const reps = Number.parseInt(e.repeticiones, 10) || 12;
            return {
              id_ejercicio: e.id_ejercicio.toHexString(),
              nombre: e.nombre,
              series: Array.from({ length: e.series }, (_, i) => ({ repeticiones: Math.max(1, reps - (i === e.series - 1 && prob(0.3) ? entero(1, 3) : 0)), ...(carga ? { carga_kg: carga } : {}), completada: !(i === e.series - 1 && prob(0.08)) })),
            };
          });
          const inicioSes = masMinutos(vis.fecha, entero(3, 10));
          const dur = entero(35, 80);
          const finSes = masMinutos(inicioSes, dur);
          if (finSes > AHORA) continue;
          sesiones.push({
            id_socio: s.id!,
            id_rutina: rutina.id_rutina,
            id_version: v.id!,
            uuid_cliente: randomUUID(),
            fecha_inicio: inicioSes,
            fecha_fin: finSes,
            duracion_min: dur,
            detalle: JSON.stringify({ ejercicios: realizados }),
            calorias: Math.round(dur * (6 + rnd() * 3) * 100) / 100,
            fc_promedio: s.app.hc ? entero(112, 145) : null,
            fc_maxima: s.app.hc ? entero(150, 186) : null,
            pasos: s.app.hc ? entero(1200, 5200) : null,
            completada: prob(0.94),
            sincronizada_en: masMinutos(finSes, entero(1, 30)),
          });
        }
      }
      if (!finRutina) break;
      inicio = finRutina;
      const otras = compatibles.filter((p) => p._id !== plantilla._id);
      plantilla = otras.length ? elegir(otras) : plantilla;
    }
  }
  if (contenidos.length) await mongo.db.collection('contenidos_rutina').insertMany(contenidos);
  await crearMuchos(prisma.sesionEntrenamiento, sesiones);
  log.log(`Rutinas: ${rutinas} (${contenidos.length} versiones en Mongo). Sesiones de entrenamiento: ${sesiones.length}.`);

  // --- Health Connect: pasos y calorías diarios de los últimos 45 días
  const datosSalud: object[] = [];
  const syncs: object[] = [];
  for (const s of conApp.filter((x) => x.app!.hc)) {
    const desde = [sumarDias(HOY, -45), s.app!.activada].sort().pop()!;
    for (let d = desde; d < HOY; d = sumarDias(d, 1)) {
      const activo = s.visitas.some((v) => v.dia === d);
      datosSalud.push({ id_socio: s.id!, tipo: 'pasos', valor: entero(activo ? 7000 : 2500, activo ? 15000 : 9000), inicio_medicion: local(d, 0, 0), fin_medicion: local(d, 23, 59, 59), recibido_en: local(sumarDias(d, 1), 8, entero(0, 59)) });
      datosSalud.push({ id_socio: s.id!, tipo: 'calorias', valor: entero(activo ? 2100 : 1600, activo ? 3200 : 2300), inicio_medicion: local(d, 0, 0), fin_medicion: local(d, 23, 59, 59), recibido_en: local(sumarDias(d, 1), 8, entero(0, 59)) });
      if (prob(0.6)) syncs.push({ id_socio: s.id!, fecha_sync: local(sumarDias(d, 1), 8, entero(0, 59)), registros_recibidos: 2, exitosa: prob(0.97), detalle_error: null });
    }
  }
  await crearMuchos(prisma.datoSalud, datosSalud);
  await crearMuchos(prisma.sincronizacionSalud, syncs);

  // --- Notificaciones automáticas históricas (recordatorios de vencimiento)
  const recibeNotif = (s: SocioSim, d: string) => !!s.app && s.app.activada <= d && (!s.app.revocaNotif || d < s.app.revocaNotif);
  for (const s of socios) {
    // Las vigentes se avisan en el bloque de riesgo actual
    for (const m of s.mems.filter((x) => !x.cancelada && x.venc < HOY)) {
      const d = sumarDias(m.venc, -diasAviso);
      if (d < HOY && recibeNotif(s, d)) notificaciones.push(notif(s.id!, null, 'recordatorio_vencimiento', 'vencimiento', 'Tu membresía está por vencer', `La membresía vence el ${m.venc} y no se ha renovado. Renueva en recepción para no perder tu progreso.`, local(d, 9, 0)));
    }
  }

  // --- Riesgo de deserción: historial (cerrado) y situación actual (misma regla que el backend)
  let riesgos = 0;
  const vigenteHoy = (s: SocioSim) => {
    const v = s.mems.filter((m) => !m.cancelada && m.inicio <= HOY && HOY <= m.venc);
    return v[v.length - 1] ?? null;
  };
  for (const s of socios) {
    const ultima = s.visitas[s.visitas.length - 1];
    const m = vigenteHoy(s);
    const congelada = m?.congelamiento && m.congelamiento.inicio <= HOY && HOY <= m.congelamiento.fin;
    // Inactividad pasada (desertores o huecos): se detectó y se cerró
    if (s.perfil === 'desertor' && ultima) {
      const det = sumarDias(ultima.dia, diasInactividad);
      const memEnDet = s.mems.find((x) => !x.cancelada && x.inicio <= det && det <= x.venc);
      if (det < HOY && memEnDet && memEnDet.venc < HOY) {
        const r = await prisma.riesgoDesercion.create({ data: { id_socio: s.id!, motivo: 'inactividad', detalle: `${diasInactividad} días sin asistir (última visita ${ultima.dia}).`, estado: s.baja ? 'descartado' : 'resuelto', detectado_en: local(det, 6, 0), cerrado_en: local(sumarDias(memEnDet.venc, 1), 6, 0) } });
        riesgos++;
        if (prob(0.6)) await prisma.accionRiesgo.create({ data: { id_riesgo: r.id_riesgo, tipo_accion: elegir(['llamada', 'notificacion', 'promocion'] as const), descripcion: elegir(['Se le llamó; comenta falta de tiempo.', 'No contestó, se dejó mensaje.', 'Se ofreció 15% de descuento en trimestral.', 'Se envió recordatorio por la app.']), realizada_por: recepcion(s.sede), fecha: local(sumarDias(det, entero(1, 4)), 12, 0) } });
        if (recibeNotif(s, det)) notificaciones.push(notif(s.id!, null, 'recordatorio_inactividad', 'avisos', '¡Te extrañamos en GymHub!', 'Hace días que no te vemos. Tu rutina te está esperando: ¡vuelve hoy!', local(det, 6, 1)));
      }
    }
    // Actual: solo socios activos con membresía vigente o por vencer (sin congelar)
    if (s.baja || !m || congelada) continue;
    const ref = ultima?.dia ?? s.alta;
    const dias = diferenciaDias(ref, HOY);
    const porVencer = diferenciaDias(HOY, m.venc) <= diasAviso;
    const detectados: { motivo: 'inactividad' | 'membresia_por_vencer'; detalle: string; desde: string }[] = [];
    if (dias >= diasInactividad) detectados.push({ motivo: 'inactividad', detalle: ultima ? `${dias} días sin asistir (última visita ${ultima.dia}).` : `Sin visitas en ${dias} días desde su alta.`, desde: sumarDias(ref, diasInactividad) });
    // Si ya renovó por adelantado no está "por vencer"
    const renovada = s.mems.some((x) => !x.cancelada && x.inicio > m.venc);
    if (porVencer && !renovada) detectados.push({ motivo: 'membresia_por_vencer', detalle: `La membresía vence el ${m.venc} y no se ha renovado.`, desde: sumarDias(m.venc, -diasAviso) });
    for (const d of detectados) {
      const atendido = prob(0.35);
      const detectado = local(d.desde < HOY ? d.desde : HOY, 6, 0);
      const r = await prisma.riesgoDesercion.create({ data: { id_socio: s.id!, motivo: d.motivo, detalle: d.detalle, estado: atendido ? 'atendido' : 'abierto', detectado_en: detectado > AHORA ? AHORA : detectado } });
      riesgos++;
      if (atendido) {
        await prisma.accionRiesgo.create({ data: { id_riesgo: r.id_riesgo, tipo_accion: elegir(['llamada', 'notificacion', 'visita', 'promocion'] as const), descripcion: d.motivo === 'inactividad' ? elegir(['Se le llamó, dice que regresa la próxima semana.', 'Se le envió su rutina actualizada por la app.', 'Comentó una lesión leve; se agendó revisión con entrenador.']) : elegir(['Se le recordó la renovación en recepción.', 'Se ofreció cambiar a plan trimestral.', 'Pidió que se le recuerde el día del vencimiento.']), realizada_por: recepcion(s.sede), fecha: detectado > AHORA ? AHORA : masMinutos(detectado, entero(60, 600)) } });
      }
      if (recibeNotif(s, d.desde) && d.desde < HOY) {
        notificaciones.push(d.motivo === 'inactividad'
          ? notif(s.id!, null, 'recordatorio_inactividad', 'avisos', '¡Te extrañamos en GymHub!', 'Hace días que no te vemos. Tu rutina te está esperando: ¡vuelve hoy!', local(d.desde, 6, 1))
          : notif(s.id!, null, 'recordatorio_vencimiento', 'vencimiento', 'Tu membresía está por vencer', `${d.detalle} Renueva en recepción para no perder tu progreso.`, local(d.desde, 6, 1)));
      }
    }
  }
  log.log(`Riesgos de deserción: ${riesgos}.`);

  // --- Segmentos y campañas
  const segDefs = [
    ['Membresías por vencer', 'Socios con membresía que vence en los próximos días.', { estados_membresia: ['por_vencer'] }],
    ['Vencidos sin renovar', 'Socios activos cuya membresía ya venció.', { estados_membresia: ['vencida'] }],
    ['Inactivos con membresía vigente', 'Pagan pero vinieron 2 veces o menos en 30 días.', { estados_membresia: ['activa', 'por_vencer'], visitas_max: 2 }],
    ['Socios fieles', '12 o más visitas en los últimos 30 días.', { visitas_min: 12 }],
    ['Nuevos (últimos 30 días)', 'Altas recientes para seguimiento de bienvenida.', { antiguedad_max_dias: 30 }],
    ['Norte · pérdida de peso', 'Objetivo pérdida de peso en sede Norte.', { sedes: [sedes[1] ?? sedes[0]!], objetivos: ['perder_peso'] }],
    ['Adultos 40+', 'Socios de 40 años o más.', { edad_min: 40 }],
  ] as const;
  const segmentos: number[] = [];
  for (const [nombre, descripcion, filtros] of segDefs) {
    const existe = await prisma.segmento.findFirst({ where: { nombre } });
    if (existe) {
      segmentos.push(existe.id_segmento);
      continue;
    }
    const seg = await prisma.segmento.create({ data: { nombre, descripcion, filtros: JSON.stringify(filtros), creado_por: admin.id_usuario, creado_en: local('2026-02-02', 10, 0) } });
    segmentos.push(seg.id_segmento);
    corrida.segmentos.push(seg.id_segmento);
  }
  const campDefs: [string, string, string, number, string][] = [
    ['¡Arranca el año con todo!', 'Inscríbete en enero y llévate tu primera evaluación física gratis.', 'promociones', 4, '2026-01-20'],
    ['Promo San Valentín 2x1', 'Trae a tu pareja y paguen una sola inscripción en febrero.', 'promociones', 6, '2026-02-10'],
    ['Horario de Semana Santa', 'Del 2 al 5 de abril abrimos de 8:00 a 14:00.', 'avisos', 6, '2026-03-28'],
    ['Renueva y congela gratis', 'Renueva antes de vencer y obtén 7 días de congelamiento sin costo.', 'vencimiento', 0, '2026-05-15'],
    ['Nuevo equipo de cardio', 'Ya llegaron 6 caminadoras y 4 elípticas nuevas a la sede Matriz.', 'avisos', 3, '2026-07-07'],
    ['Te extrañamos', 'Vuelve esta semana y tu siguiente mensualidad tiene 20% de descuento.', 'promociones', 2, '2026-08-18'],
    ['Reto de septiembre', 'Completa 16 visitas este mes y gana una playera GymHub.', 'avisos', 3, '2026-09-01'],
    ['Buen Fin GymHub', 'Plan anual con 25% de descuento del 13 al 16 de noviembre.', 'promociones', 6, '2026-10-30'],
  ];
  let notifCampanas = 0;
  for (const [titulo, contenido, categoria, idxSeg, dia] of campDefs) {
    if (dia >= HOY) continue;
    const enviada = local(dia, 10, 0);
    const camp = await prisma.campana.create({ data: { titulo, contenido, categoria, tipo_destino: 'segmento', id_segmento: segmentos[idxSeg]!, modo_envio: 'programado', programada_para: enviada, estado: 'enviada', creada_por: admin.id_usuario, creada_en: masMinutos(enviada, -60 * 24 * entero(1, 4)) } });
    corrida.campanas.push(camp.id_campana);
    for (const s of socios) {
      if (!recibeNotif(s, dia) || (s.baja && s.baja.fecha <= dia) || s.alta > dia || !prob(0.55)) continue;
      notificaciones.push(notif(s.id!, camp.id_campana, 'campana', categoria, titulo, contenido, masMinutos(enviada, entero(0, 3))));
      interacciones.push({ id_socio: s.id!, tipo: 'notificacion', descripcion: `Notificación: ${titulo}`, id_usuario: null, fecha: enviada });
      notifCampanas++;
    }
  }
  const proxima = sumarDias(HOY, 3);
  const prog = await prisma.campana.create({ data: { titulo: 'Clase muestra de funcional', contenido: 'Este sábado a las 10:00 clase gratuita de entrenamiento funcional. ¡Invita a un amigo!', categoria: 'avisos', tipo_destino: 'segmento', id_segmento: segmentos[3]!, modo_envio: 'programado', programada_para: local(proxima, 9, 0), estado: 'programada', creada_por: admin.id_usuario } });
  const borrador = await prisma.campana.create({ data: { titulo: 'Encuesta de satisfacción', contenido: 'Cuéntanos cómo te sientes en GymHub y participa por un mes gratis.', categoria: 'avisos', tipo_destino: 'segmento', id_segmento: segmentos[6]!, modo_envio: 'inmediato', estado: 'borrador', creada_por: admin.id_usuario } });
  corrida.campanas.push(prog.id_campana, borrador.id_campana);
  await crearMuchos(prisma.notificacion, notificaciones);
  log.log(`Campañas enviadas con ${notifCampanas} notificaciones; ${notificaciones.length} notificaciones en total.`);

  // --- Interacciones (todas juntas)
  await crearMuchos(prisma.interaccionSocio, interacciones);

  // --- Bitácora: altas, pagos, cancelaciones, consultas de expediente y accesos del personal
  const bitacora: object[] = [];
  for (const s of socios) {
    bitacora.push({ id_usuario: s.mems[0]?.registro ?? admin.id_usuario, id_socio: s.id!, entidad: 'socio', id_entidad: String(s.id), accion: 'crear', valor_nuevo: JSON.stringify({ folio: `GH${String(s.id).padStart(6, '0')}`, nombre: s.nombre, id_sede: s.sede, objetivo: s.objetivo, telefono: '[cifrado]', correo: '[cifrado]', contacto_emergencia: '[cifrado]' }), ip: `10.118.55.${entero(2, 250)}`, fecha: local(s.alta, Math.max(7, Math.min(20, s.horaBase)), entero(0, 59)) });
    for (let i = 0, n = entero(1, 5); i < n; i++) {
      const d = sumarDias(s.alta, entero(0, Math.max(0, diferenciaDias(s.alta, HOY))));
      bitacora.push({ id_usuario: recepcion(s.sede), id_socio: s.id!, entidad: 'socio', id_entidad: String(s.id), accion: 'consulta', valor_nuevo: null, ip: `10.118.55.${entero(2, 250)}`, fecha: local(d, entero(7, 21), entero(0, 59)) });
    }
    if (s.baja) bitacora.push({ id_usuario: recepcion(s.sede), id_socio: s.id!, entidad: 'socio', id_entidad: String(s.id), accion: 'modificar', valor_anterior: JSON.stringify({ estado: 'activo' }), valor_nuevo: JSON.stringify({ estado: 'baja', motivo_baja: s.baja.motivo }), ip: `10.118.55.${entero(2, 250)}`, fecha: local(s.baja.fecha, 12, 0) });
  }
  for (const { s, m } of todas) {
    bitacora.push({ id_usuario: m.registro, id_socio: s.id!, entidad: 'pago', id_entidad: String(m.id), accion: 'crear', valor_nuevo: JSON.stringify({ plan: m.plan.nombre, monto: m.plan.precio, metodo: m.metodo, inicio: m.inicio, vencimiento: m.venc }), ip: `10.118.55.${entero(2, 250)}`, fecha: m.fechaPago });
    if (m.cancelada) bitacora.push({ id_usuario: admin.id_usuario, id_socio: s.id!, entidad: 'pago', id_entidad: String(m.id), accion: 'cancelar', valor_anterior: JSON.stringify({ estado: 'registrado' }), valor_nuevo: JSON.stringify({ estado: 'cancelado', motivo: m.cancelada.motivo }), ip: `10.118.55.${entero(2, 250)}`, fecha: m.cancelada.en });
  }
  for (let d = INICIO; d <= HOY; d = sumarDias(d, 1)) {
    for (const p of personal) {
      const trabaja = p.es_admin_general ? prob(0.55) : diaSemana(d) <= 6 && prob(0.92);
      if (!trabaja) continue;
      const hora = p.id_rol === 3 ? entero(6, 16) : entero(6, 14);
      if (d === HOY && hora >= horaActual) continue;
      if (prob(0.04)) bitacora.push({ id_usuario: p.id_usuario, entidad: 'usuario', id_entidad: String(p.id_usuario), accion: 'login_fallido', valor_nuevo: JSON.stringify({ correo: p.correo }), ip: `10.118.55.${entero(2, 250)}`, fecha: local(d, hora, entero(0, 20)) });
      bitacora.push({ id_usuario: p.id_usuario, entidad: 'usuario', id_entidad: String(p.id_usuario), accion: 'login', valor_nuevo: null, ip: `10.118.55.${entero(2, 250)}`, fecha: local(d, hora, entero(21, 59)) });
    }
  }
  bitacora.sort((a, b) => (a as { fecha: Date }).fecha.getTime() - (b as { fecha: Date }).fecha.getTime());
  await crearMuchos(prisma.bitacoraAuditoria, bitacora);

  // --- Solicitudes ARCO
  const arco: object[] = [];
  for (const s of socios.filter(() => prob(0.025))) {
    const creada = sumarDias(s.alta, entero(5, Math.max(5, diferenciaDias(s.alta, HOY))));
    if (creada > HOY) continue;
    const tipo = ponderado([['acceso', 0.45], ['rectificacion', 0.3], ['cancelacion', 0.15], ['oposicion', 0.1]] as const);
    const estado = diferenciaDias(creada, HOY) < 5 ? elegir(['recibida', 'en_proceso'] as const) : ponderado([['atendida', 0.8], ['rechazada', 0.2]] as const);
    arco.push({ id_socio: s.id!, tipo, descripcion: { acceso: 'Solicita copia de los datos personales que tiene el gimnasio.', rectificacion: 'Su número de teléfono cambió.', cancelacion: 'Solicita eliminar sus datos al darse de baja.', oposicion: 'No desea recibir promociones.' }[tipo], estado, atendida_por: estado === 'atendida' || estado === 'rechazada' ? admin.id_usuario : null, creada_en: local(creada, 12, 0), atendida_en: estado === 'atendida' || estado === 'rechazada' ? local(sumarDias(creada, entero(1, 4)), 13, 0) : null });
  }
  await crearMuchos(prisma.solicitudArco, arco);

  log.log(`Interacciones: ${interacciones.length}. Bitácora: ${bitacora.length}. ARCO: ${arco.length}.`);
  log.log(`Listo en ${((Date.now() - t0) / 1000).toFixed(1)} s. Contraseña de la app para los socios generados: ${PASSWORD_APP}`);
  return corrida;
}

/** Grupo muscular del ejercicio (para estimar cargas). */
const gruposPorNombre = new Map<string, string>();
function ejercicios_grupo(nombre: string): string {
  return gruposPorNombre.get(nombre) ?? '';
}

function notif(idSocio: number, idCampana: number | null, origen: string, categoria: string, titulo: string, contenido: string, creada: Date) {
  // Estados finales: la cola solo procesa las 'pendiente'
  const enviada = masMinutos(creada, entero(0, 2));
  const estado = ponderado([['entregado', 0.72], ['enviado', 0.18], ['fallido', 0.1]] as const);
  const entregada = estado === 'entregado' ? masMinutos(enviada, entero(0, 30)) : null;
  const leida = entregada && prob(0.55) ? masMinutos(entregada, entero(5, 60 * 24)) : null;
  return {
    id_campana: idCampana,
    id_socio: idSocio,
    origen,
    categoria,
    titulo,
    contenido,
    estado,
    intentos: estado === 'fallido' ? 5 : 1,
    error: estado === 'fallido' ? 'messaging/unavailable' : estado === 'enviado' ? 'Solo bandeja: el socio no tiene dispositivos activos.' : null,
    creada_en: creada,
    enviada_en: estado === 'fallido' ? null : enviada,
    entregada_en: entregada,
    leida_en: leida && leida < AHORA ? leida : null,
  };
}

async function crearMuchos(modelo: { createMany: (a: { data: never[] }) => Promise<unknown> }, filas: object[]) {
  for (const lote of lotes(filas)) await modelo.createMany({ data: lote as never[] });
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------
async function limpiar(prisma: PrismaService, mongo: MongoService, meta: Collection<MetaSemilla>) {
  const corridas = (await meta.findOne({ _id: 'semilla' }))?.corridas ?? [];
  if (!corridas.length) {
    log.log('No hay datos generados por la semilla.');
    return;
  }
  const socios = corridas.flatMap((c) => c.socios);
  const campanas = corridas.flatMap((c) => c.campanas);
  const segmentos = corridas.flatMap((c) => c.segmentos);
  const usuarios = corridas.flatMap((c) => c.usuarios);
  for (const ids of lotes(socios, 1000)) {
    const w = { id_socio: { in: ids } };
    const rutinas = (await prisma.rutinaAsignada.findMany({ where: w, select: { id_rutina: true } })).map((r) => r.id_rutina);
    const riesgos = (await prisma.riesgoDesercion.findMany({ where: w, select: { id_riesgo: true } })).map((r) => r.id_riesgo);
    const membresias = (await prisma.membresia.findMany({ where: w, select: { id_membresia: true } })).map((m) => m.id_membresia);
    await prisma.notificacion.deleteMany({ where: w });
    await prisma.interaccionSocio.deleteMany({ where: w });
    for (const r of lotes(riesgos, 1000)) await prisma.accionRiesgo.deleteMany({ where: { id_riesgo: { in: r } } });
    await prisma.riesgoDesercion.deleteMany({ where: w });
    await prisma.sesionEntrenamiento.deleteMany({ where: w });
    for (const r of lotes(rutinas, 1000)) await prisma.rutinaVersion.deleteMany({ where: { id_rutina: { in: r } } });
    await prisma.rutinaAsignada.deleteMany({ where: w });
    await prisma.datoSalud.deleteMany({ where: w });
    await prisma.sincronizacionSalud.deleteMany({ where: w });
    await prisma.preferenciaNotificacion.deleteMany({ where: w });
    await prisma.dispositivoPush.deleteMany({ where: w });
    await prisma.sesionApp.deleteMany({ where: w });
    await prisma.recuperacionPassword.deleteMany({ where: w });
    await prisma.cuentaApp.deleteMany({ where: w });
    await prisma.fichaSalud.deleteMany({ where: w });
    await prisma.consentimiento.deleteMany({ where: w });
    await prisma.solicitudArco.deleteMany({ where: w });
    await prisma.asistencia.deleteMany({ where: w });
    await prisma.pago.deleteMany({ where: w });
    for (const m of lotes(membresias, 1000)) await prisma.congelamientoMembresia.deleteMany({ where: { id_membresia: { in: m } } });
    await prisma.membresia.updateMany({ where: w, data: { id_membresia_anterior: null } });
    await prisma.membresia.deleteMany({ where: w });
    await prisma.bitacoraAuditoria.deleteMany({ where: w });
    await prisma.campana.deleteMany({ where: { id_socio_destino: { in: ids } } });
  }
  await prisma.notificacion.deleteMany({ where: { id_campana: { in: campanas } } });
  await prisma.campana.deleteMany({ where: { id_campana: { in: campanas } } });
  await prisma.campana.updateMany({ where: { id_segmento: { in: segmentos } }, data: { estado: 'cancelada' } });
  await prisma.segmento.deleteMany({ where: { id_segmento: { in: segmentos }, campanas: { none: {} } } });
  for (const ids of lotes(socios, 1000)) await prisma.socio.deleteMany({ where: { id_socio: { in: ids } } });
  await prisma.bitacoraAuditoria.deleteMany({ where: { id_usuario: { in: usuarios } } });
  await prisma.sesionUsuario.deleteMany({ where: { id_usuario: { in: usuarios } } });
  await prisma.usuarioSede.deleteMany({ where: { id_usuario: { in: usuarios } } });
  await prisma.usuario.deleteMany({ where: { id_usuario: { in: usuarios } } });
  await mongo.contenidos.deleteMany({ semilla: true } as never);
  await mongo.plantillas.deleteMany({ _id: { $in: corridas.flatMap((c) => c.plantillas) } });
  await mongo.ejercicios.deleteMany({ _id: { $in: corridas.flatMap((c) => c.ejercicios) } });
  await meta.deleteOne({ _id: 'semilla' });
  log.log(`Eliminados ${socios.length} socios, ${usuarios.length} usuarios, ${segmentos.length} segmentos y ${campanas.length} campañas generados por la semilla.`);
}

void main().catch((e: unknown) => {
  log.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
