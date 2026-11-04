# GymHub Backend

> **API REST modular construida con NestJS 12 y TypeScript para la plataforma CRM y App Móvil GymHub.**

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Estado de los Módulos](#estado-de-los-módulos)
- [Arquitectura de Persistencia Dual](#arquitectura-de-persistencia-dual)
- [Requisitos Previos](#requisitos-previos)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación y Configuración](#instalación-y-configuración)
- [Autenticación y Roles](#autenticación-y-roles)
- [Módulo: Socios y Membresías (API)](#módulo-socios-y-membresías-api)
- [Módulo: Rutinas y Entrenamiento (API)](#módulo-rutinas-y-entrenamiento-api)
- [Módulos: Asistencia, Retención, Analítica y Administración (API)](#módulos-asistencia-retención-analítica-y-administración-api)
- [Notificaciones push](#notificaciones-push)
- [Respaldos y restauración](#respaldos-y-restauración)
- [Comandos Disponibles](#comandos-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Pruebas y Calidad](#pruebas-y-calidad)

---

## Descripción General

El backend de **GymHub** está desarrollado sobre **NestJS 12** con módulos ECMAScript nativos (`"type": "module"`). Expone servicios REST para la administración de socios, planes y cobro de membresías, prescripción y versionado de rutinas, control de asistencia, campañas de retención con FCM y analítica operativa.

### Características Principales
* **Autenticación JWT y RBAC:** guards globales que validan el token y el rol en cada petición (`CRM-RNF-03`), y restricción por sede (`CRM-RF-19`).
* **Cifrado AES-256-GCM:** teléfonos, correos, contactos de emergencia y fichas de salud se guardan cifrados, con soporte para rotación de claves (`CRM-RNF-01`).
* **Índices ciegos (HMAC-SHA256 + pepper):** detectan duplicados por correo o teléfono sin descifrar.
* **Bitácora de auditoría:** cada alta, modificación, cancelación y consulta de datos sensibles queda registrada, sin valores sensibles en claro (`CRM-RF-20`).
* **Validación y saneamiento:** `ValidationPipe` global con `whitelist` y `forbidNonWhitelisted` (`CRM-RNF-04`).
* **Herramientas:** pruebas con **Vitest**, análisis estático con **Oxlint**.

---

## Estado de los Módulos

| Módulo | Requerimientos | Estado |
| :--- | :--- | :--- |
| **Socios y Membresías** | CRM-RF-01 a CRM-RF-05 | ✅ Implementado (incluye foto y fin anticipado de congelamientos). |
| Infraestructura común (cifrado, JWT/roles, bitácora) | CRM-RNF-01 a 04 | ✅ Implementada, con script de rotación de claves y OpenAPI en `/docs`. |
| **Rutinas y Entrenamiento** | CRM-RF-06 a 10 | ✅ Implementado (incluye subida de multimedia y aviso push al socio). |
| **Asistencia** | CRM-RF-11 | ✅ `src/asistencia/` |
| **Retención y Comunicación** | CRM-RF-12 a 15 | ✅ `src/retencion/` y `src/notificaciones/` |
| **Analítica y Reportes** | CRM-RF-16, 17 | ✅ `src/analitica/` |
| **Usuarios, Sedes y Seguridad** | CRM-RF-18 a 20, CRM-RNF-02 | ✅ `src/administracion/`, sesiones revocables en `src/auth/` |
| **API de la app móvil** | APP-RF-01 a 15 | ✅ `src/app-socio/`, con acuse de entrega de push y visitas del socio. |

---

## Arquitectura de Persistencia Dual

1. **SQL Server 2022 (transaccional, Docker en el puerto 1433):**
   * **Fuente de verdad:** [`database/sqlserver/gimnasio_crm.sql`](./database/sqlserver/gimnasio_crm.sql), seguido de [`002_vista_membresia_actual.sql`](./database/sqlserver/002_vista_membresia_actual.sql). La base se crea con esos scripts, **no** con `prisma db push`. Usa la intercalación `Modern_Spanish_CI_AI` (búsquedas sin distinguir acentos ni mayúsculas).
   * **Esquema Prisma:** [`prisma/sqlserver/schema.prisma`](./prisma/sqlserver/schema.prisma) refleja las tablas que ya usa el backend y solo sirve para generar el cliente tipado (`src/generated/prisma`, ignorado por Git). Al implementar un módulo nuevo, agrega sus tablas con los mismos nombres y tipos del script.
   * **Prisma 7:** se conecta con el driver adapter `@prisma/adapter-mssql`; la URL se lee de `SQLSERVER_URL` (ver `prisma.config.ts`).
   * **Transacciones:** asignar membresía y registrar pago, y asignar o versionar una rutina, ocurren en una transacción `SERIALIZABLE` (`CRM-RNF-07`).
   * **Bitácora:** es de solo inserción; un trigger rechaza `UPDATE` y `DELETE` sobre `bitacora_auditoria`.
   * **`seed_dev.sql`:** sedes, usuarios (contraseña `GymHub2026!`), aviso de privacidad y planes de prueba. **Solo para desarrollo.**

2. **MongoDB (documental, Docker en el puerto 27017, base `gymhub_rutinas`):**
   * **Script:** [`database/mongodb/gymhub_rutinas.js`](./database/mongodb/gymhub_rutinas.js). Es idempotente: crea las colecciones con validadores `$jsonSchema`, los índices (con intercalación en español) y un catálogo base de 16 ejercicios.
   * **Colecciones:** `ejercicios` (`CRM-RF-06`), `plantillas_rutina` (`CRM-RF-07`) y `contenidos_rutina` (contenido inmutable de cada versión asignada, `CRM-RF-09`). SQL Server guarda solo las referencias (`rutina_asignada.plantilla_mongo_id`, `rutina_version.contenido_mongo_id`).
   * **Cliente:** driver oficial `mongodb` (`src/mongo/`), porque Prisma 7 no soporta MongoDB.
   * **Consistencia:** el documento de la versión se inserta al final de la transacción de SQL Server. Si Mongo falla, la transacción se revierte. Si el commit de SQL Server falla, el documento se elimina.

---

## Requisitos Previos

* **Node.js** `>= 20.x` (probado con 24.x) y **npm** `v10.x` o superior.
* **Docker** con SQL Server 2022 (`mssql_container`) y MongoDB (`mongo_container`), con los scripts de `database/` aplicados.
* **Redis**, solo para notificaciones (pendiente).

---

## Variables de Entorno

```bash
cp .env.example .env
```

| Variable | Obligatoria | Descripción |
| :--- | :---: | :--- |
| `SQLSERVER_URL` | ✅ | `sqlserver://localhost:1433;database=gimnasio_crm;user=sa;password=...;encrypt=true;trustServerCertificate=true`. `trustServerCertificate` solo en desarrollo local. |
| `MONGODB_URL` | ✅ | `mongodb://usuario:contraseña@localhost:27017/gymhub_rutinas?authSource=admin`. El nombre de la base sale de la ruta. Los caracteres especiales de la contraseña van codificados (`#` → `%23`). |
| `JWT_SECRET` | ✅ | Secreto para firmar y verificar los JWT del personal. |
| `JWT_EXPIRES_IN` | | Vigencia del token (por defecto `8h`). |
| `LOGIN_MAX_INTENTOS` | | Intentos fallidos antes de bloquear la cuenta (por defecto 5). |
| `LOGIN_MINUTOS_BLOQUEO` | | Minutos de bloqueo (por defecto 15). Aplica también a la app. |
| `APP_JWT_EXPIRES_IN` | | Vigencia del access token de la app del socio (por defecto `15m`). |
| `APP_REFRESH_DIAS` | | Días de vigencia del refresh token de la app (por defecto 30). |
| `ENCRYPTION_KEY` | ✅ | Clave AES-256: 32 bytes en hex (64 caracteres) o base64. Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `ENCRYPTION_KEY_ID` | | Id de la clave activa (1-255, por defecto 1). Se guarda en cada valor cifrado. |
| `ENCRYPTION_OLD_KEYS` | | Claves anteriores tras una rotación: `"1:clavehex,2:clavehex"`. |
| `BLIND_INDEX_PEPPER` | ✅ | Pepper de los índices ciegos (mín. 16 caracteres). **No se puede cambiar** sin recalcular `correo_hash` y `telefono_hash`. |
| `APP_TIMEZONE` | | Zona horaria del gimnasio para calcular vigencias (por defecto `America/Mexico_City`). |
| `CONGELAMIENTO_MAX_DIAS` | | Máximo de días congelados por membresía (por defecto 90). |
| `CORS_ORIGIN` | | Orígenes permitidos, separados por coma. |
| `PORT` | | Puerto HTTP (por defecto 3000). |

> ⚠️ Si se pierde `ENCRYPTION_KEY` o `BLIND_INDEX_PEPPER`, los datos cifrados no se pueden recuperar. Guárdalos en un gestor de secretos.

---

## Instalación y Configuración

1. Instala las dependencias (genera el cliente Prisma en `postinstall`):
   ```bash
   npm install
   ```
2. Crea las bases en Docker. `gimnasio_crm.sql` **borra y recrea** `gimnasio_crm`; el seed es solo para desarrollo:
   ```bash
   for f in gimnasio_crm.sql 002_vista_membresia_actual.sql seed_dev.sql; do
     docker cp database/sqlserver/$f mssql_container:/tmp/$f
     docker exec mssql_container /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<contraseña>' -C -f 65001 -i /tmp/$f
   done
   docker cp database/mongodb/gymhub_rutinas.js mongo_container:/tmp/gymhub_rutinas.js
   docker exec mongo_container mongosh --quiet "mongodb://<usuario>:<contraseña>@localhost:27017/?authSource=admin" /tmp/gymhub_rutinas.js
   ```
   En Git Bash de Windows antepón `MSYS_NO_PATHCONV=1` a `docker exec`. `-f 65001` hace que `sqlcmd` lea el script en UTF-8 (acentos). En producción conviene un usuario con permisos limitados en lugar de `sa`.
3. Configura `.env` (ver la tabla anterior).
4. Inicia en modo desarrollo:
   ```bash
   npm run start:dev
   ```
5. Inicia sesión con un usuario del seed (`admin@gymhub.dev`, `recepcion@gymhub.dev` o `entrenador@gymhub.dev`, contraseña `GymHub2026!`), desde el frontend o con:
   ```bash
   curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json"         -d '{"correo":"recepcion@gymhub.dev","password":"GymHub2026!"}'
   ```
   Para cambiar la contraseña de un usuario (mínimo 10 caracteres con mayúscula, minúscula, número y símbolo):
   ```bash
   npm run usuario:password -- admin@gymhub.dev "N#evaContraseña2026"
   ```
   `npm run token:dev` sigue disponible para generar tokens sin pasar por el login.

---

## Autenticación y Roles

* Todas las rutas requieren JWT salvo `GET /` y `POST /auth/login` (marcadas con `@Public()`).
* Payload del token: `{ sub: id_usuario, rol, sedes: number[], admin_general?: boolean }`.

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/auth/login` | `{ correo, password }` → `{ access_token, usuario }`. Compara con bcrypt; ante cualquier fallo responde el mismo mensaje genérico. Tras `LOGIN_MAX_INTENTOS` fallos bloquea la cuenta `LOGIN_MINUTOS_BLOQUEO` minutos. Registra `login` y `login_fallido` en la bitácora. |
| `GET` | `/auth/me` | Perfil del usuario del token (lo usa el frontend al recargar). |
| `GET` | `/sedes` | Sedes activas a las que tiene acceso el usuario. |

* `@Roles(...)` limita cada ruta. El **administrador** siempre tiene acceso.
* Los usuarios solo ven y operan socios y pagos de **sus sedes**; con `admin_general` ven todas.

---

## Módulo: Socios y Membresías (API)

### Socios — `CRM-RF-01`, `CRM-RNF-02`

| Método | Ruta | Roles | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/avisos-privacidad/vigente` | recepción, entrenador | Aviso de privacidad que se muestra antes del alta. |
| `POST` | `/socios` | recepción | Alta con contacto cifrado, folio `GH000123`, validación de duplicados por correo o teléfono y consentimiento del aviso (`acepta_aviso_privacidad: true`). |
| `GET` | `/socios?q=&id_sede=&estado=&pagina=&por_pagina=` | recepción, entrenador | Búsqueda por nombre o folio (texto libre), correo exacto o teléfono exacto (índice ciego). Devuelve el teléfono enmascarado y el resumen de membresía. |
| `GET` | `/socios/:id` | recepción, entrenador | Expediente con datos descifrados y estado de membresía. Se registra en la bitácora como `consulta`. |
| `PATCH` | `/socios/:id` | recepción | Edición parcial; si cambian el correo o el teléfono, se re-cifran y se revisan duplicados. |
| `POST` | `/socios/:id/baja` | recepción | Baja lógica con `motivo`; conserva el historial. |
| `POST` | `/socios/:id/reactivar` | recepción | Reactiva al socio. |

Ejemplo de alta:
```json
{
  "nombre": "Laura Gómez",
  "fecha_nacimiento": "1995-04-12",
  "telefono": "55 1234 5678",
  "correo": "laura@mail.com",
  "contacto_emergencia": { "nombre": "Pedro Gómez", "parentesco": "padre", "telefono": "5598765432" },
  "objetivo": "tonificar",
  "id_sede": 1,
  "acepta_aviso_privacidad": true
}
```

### Planes — `CRM-RF-02`

| Método | Ruta | Roles | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/planes?incluir_inactivos=true` | todos | Catálogo (por defecto, solo activos). |
| `GET` | `/planes/:id` | todos | Detalle. |
| `POST` | `/planes` | admin | `{ nombre, tipo: mensual\|trimestral\|anual, precio, duracion_dias?, beneficios? }`. Duración por defecto: 30, 90 o 365 días. |
| `PATCH` | `/planes/:id` | admin | Edición. No altera las membresías ya asignadas. |
| `PATCH` | `/planes/:id/estado` | admin | `{ activo: false }`. Los planes no se borran: los inactivos no se pueden asignar, pero se conservan en el historial. |

### Membresías — `CRM-RF-03`

| Método | Ruta | Roles | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/socios/:id/membresias` | recepción, entrenador | Resumen vigente y el historial completo con estado calculado, congelamientos y pagos. |
| `POST` | `/socios/:id/membresias` | recepción | Asigna o renueva **y registra el pago en la misma transacción**. `{ id_plan, pago: { metodo, monto?, referencia?, id_sede? } }` |
| `POST` | `/membresias/:id/congelamientos` | recepción | `{ fecha_inicio?, fecha_fin, motivo? }`. Extiende el vencimiento los días congelados. |

**Reglas de vigencia** (`src/membresias/membresia.reglas.ts`):
* `fecha_vencimiento` es el **último día válido** (inclusive): un plan de 30 días que inicia el 2 de noviembre vence el 1 de diciembre.
* **Renovación acumulada:** si el socio sigue vigente, la nueva membresía inicia el día siguiente al vencimiento actual. Si ya venció, inicia hoy. En ambos casos queda `es_renovacion = 1` y ligada a la anterior.
* **Estados calculados:** `cancelada` → `congelada` (hoy cae dentro de un congelamiento) → `vencida` → `por_vencer` (faltan ≤ `dias_aviso_vencimiento` de `config_riesgo`, de la sede o global; 7 por defecto) → `activa`. En la BD solo se persisten `activa` y `cancelada`; el resto se calcula al consultar.
* **Congelamiento:** no retroactivo, inicia dentro de la vigencia, sin traslapes y con un máximo de `CONGELAMIENTO_MAX_DIAS` en total. Las renovaciones ya pagadas que iniciaban después se recorren los mismos días.
* El pago es obligatorio si el plan tiene precio > 0. El monto por defecto es el precio del plan; la referencia es obligatoria para transferencias.

### Pagos — `CRM-RF-04`

| Método | Ruta | Roles | Descripción |
| :--- | :--- | :--- | :--- |
| `GET` | `/pagos?id_socio=&id_sede=&estado=&desde=&hasta=` | recepción | Listado paginado, limitado a las sedes del usuario. |
| `GET` | `/pagos/:id` | recepción | Detalle. |
| `GET` | `/pagos/:id/comprobante` | recepción | Comprobante imprimible en HTML (folio `P20261102-000045`). Indica si el pago fue cancelado. |
| `POST` | `/pagos/:id/cancelar` | admin | `{ motivo }`. El administrador que cancela queda como `autorizado_por`. Si la membresía se queda sin pagos válidos, también se cancela; no se permite si existe una renovación posterior vigente. |

No se procesan cobros en línea.

### Ficha de salud — `CRM-RF-05`

| Método | Ruta | Roles | Descripción |
| :--- | :--- | :--- | :--- |
| `POST` | `/socios/:id/ficha-salud` | entrenador, recepción | Crea una **versión nueva** (nunca sobrescribe). Antecedentes, lesiones, alergias y medicamentos se cifran. La primera vez exige `acepta_tratamiento_datos_salud: true` y registra ese consentimiento. |
| `GET` | `/socios/:id/ficha-salud` | entrenador | Versión más reciente descifrada (se registra la consulta). |
| `GET` | `/socios/:id/ficha-salud/versiones` | entrenador | Historial de versiones (fecha, responsable, origen), sin datos clínicos. |
| `GET` | `/socios/:id/ficha-salud/versiones/:version` | entrenador | Una versión específica. |

`restricciones_rutina` acepta etiquetas no sensibles (por ejemplo `["evitar_rodilla"]`) que se guardan en claro para sugerir plantillas (`CRM-RF-08`).

### Errores
* `400`: validación (mensajes en español).
* `401`: sin token o token inválido.
* `403`: rol o sede sin permiso.
* `404`: el registro no existe.
* `503`: SQL Server o MongoDB no están disponibles (tiempos de espera de 5 s; en SQL Server se ajustan con `connectTimeout` y `poolTimeout` en `SQLSERVER_URL`).
* `409`: conflicto de negocio, como un duplicado, un plan inactivo o un pago ya cancelado.

---

## Módulo: Rutinas y Entrenamiento (API)

Todas las rutas son para el rol `entrenador` (y el administrador). Los ids de ejercicios y plantillas son ObjectId de MongoDB; un id mal formado responde `400`.

### Ejercicios — `CRM-RF-06`
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/ejercicios?q=&grupo_muscular=&incluir_inactivos=` | Catálogo. `q` ignora acentos y mayúsculas. |
| `GET` | `/ejercicios/grupos` | Grupos musculares en uso. |
| `GET` | `/ejercicios/:id` | Detalle. |
| `POST` | `/ejercicios` | Alta: `nombre`, `grupo_muscular`, `equipo`, `descripcion?`, `media_url?`, `media_tipo?` (`imagen`/`video`), `contraindicaciones?`. El nombre es único sin distinguir acentos (`409`). |
| `PATCH` | `/ejercicios/:id` | Edición. Un cambio de nombre se propaga a las plantillas, no a las versiones ya asignadas. |
| `PATCH` | `/ejercicios/:id/estado` | `{ activo }`. Un ejercicio desactivado no se puede agregar a plantillas nuevas. |

### Plantillas — `CRM-RF-07`
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/plantillas?q=&objetivo=&nivel=&incluir_inactivas=` | Listado con número de ejercicios. |
| `GET` | `/plantillas/:id` | Detalle; cada ejercicio incluye `activo` y `contraindicaciones`. |
| `POST` | `/plantillas` | `nombre`, `objetivo`, `nivel`, `descripcion?`, `dias_semana?` y `bloques[]`: `{ tipo: calentamiento|fuerza|cardio|estiramiento, ejercicios: [{ id_ejercicio, series, repeticiones, descanso_seg, notas? }] }`. |
| `PATCH` | `/plantillas/:id` | Edición. No altera las rutinas ya asignadas. |
| `POST` | `/plantillas/:id/duplicar` | `{ nombre }`. |
| `PATCH` | `/plantillas/:id/estado` | `{ activa }`. |

### Asignación, versiones y seguimiento — `CRM-RF-08` a `CRM-RF-10`
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/socios/:id/rutinas/sugerencias` | Plantillas activas ordenadas: primero las compatibles con la ficha de salud y después las que coinciden con el objetivo del socio. Incluye los conflictos de cada una. |
| `GET` | `/socios/:id/rutinas` | Rutina vigente con sus bloques e historial de rutinas. |
| `POST` | `/socios/:id/rutinas` | `id_plantilla`, `sesiones_planeadas_semana`, `fecha_inicio?`, `bloques?` (ajustes para el socio), `motivo?`, `confirmar_conflictos?`. Reemplaza la rutina vigente. |
| `GET` | `/rutinas/:id/versiones` | Versiones con fecha, autor y motivo. |
| `GET` | `/rutinas/:id/versiones/:n` | Contenido de la versión `n`. |
| `POST` | `/rutinas/:id/versiones` | Nueva versión: `bloques`, `motivo` (obligatorio), `confirmar_conflictos?`. |
| `POST` | `/rutinas/:id/finalizar` | `{ motivo? }`. |
| `GET` | `/socios/:id/seguimiento?desde=&hasta=` | Sesiones del periodo (30 días por defecto, máximo 12 meses) y resumen: planeadas, cumplidas, adherencia, minutos, calorías y FC promedio. |

Si la rutina incluye ejercicios cuyas `contraindicaciones` coinciden con las `restricciones_rutina` de la ficha de salud, la API responde `409` con `conflictos: [{ id_ejercicio, ejercicio, restricciones }]`. Para asignarla de todos modos, el entrenador envía `confirmar_conflictos: true`. Cada asignación, ajuste o finalización queda en la bitácora y en la línea de tiempo del socio (`cambio_rutina`).

---

## Módulos: Asistencia, Retención, Analítica y Administración (API)

La documentación interactiva de todos los endpoints está en `http://localhost:3000/docs` (Swagger; se desactiva con `SWAGGER=false`).

### Asistencia — `CRM-RF-11` (recepción)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/asistencia/buscar?q=` | Busca por nombre, teléfono (10 dígitos), folio o el texto del QR. Devuelve la membresía y la última visita. |
| POST | `/asistencia` | `{ id_sede, id_socio }` o `{ id_sede, codigo: "GYMHUB:GH000123" }`. Registra la entrada y responde `alerta` (`ok`, `aviso`, `error`) y un mensaje. Una entrada repetida en 60 min no se duplica. |
| GET | `/asistencia?id_sede=&fecha=` | Entradas del día con conteo por estado de la membresía. |
| GET | `/socios/:id/asistencias` | Historial del socio y visitas de los últimos 30 días. |

### Retención — `CRM-RF-12` a `CRM-RF-15`

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| GET / POST / PUT / DELETE | `/segmentos`, `/segmentos/:id` | Admin | Filtros: `estados_membresia`, `sedes`, `objetivos`, `visitas_min/max` (30 días), `antiguedad_min/max_dias`, `edad_min/max`, `incluir_bajas`. |
| POST | `/segmentos/previsualizar` | Admin | Socios que cumplen los filtros sin guardar. |
| GET | `/segmentos/:id/socios`, `/segmentos/:id/exportar` | Admin | Lista y CSV (sin datos de contacto). |
| GET | `/riesgo?estado=&id_sede=` | Recepción | Tablero (por defecto, casos abiertos y en seguimiento). |
| POST | `/riesgo/:id/acciones` | Recepción | `{ tipo_accion, descripcion, estado }`. `notificacion` manda el texto como push. |
| GET / PUT | `/riesgo/config` | Admin | Regla global (`id_sede: null`) o por sede: `dias_inactividad`, `dias_aviso_vencimiento`, `activa`. |
| POST | `/riesgo/evaluar` | Admin | Ejecuta la detección ya (también corre al arrancar y cada 6 h). |
| GET / POST | `/campanas` | Admin | `{ titulo, contenido, categoria, tipo_destino: socio\|segmento, id_socio_destino \| id_segmento, modo_envio: inmediato\|programado, programada_para, borrador }`. |
| GET | `/campanas/:id` | Admin | Detalle con el estado de cada notificación. |
| POST | `/campanas/:id/enviar`, `/cancelar`, `/reintentar` | Admin | Enviar un borrador o adelantar una programada, cancelar, reintentar fallidos. |
| GET / POST | `/socios/:id/interacciones` | Recepción, entrenador | Línea de tiempo; se agregan notas (`nota`) y llamadas (`llamada`). |

### Analítica — `CRM-RF-16`, `CRM-RF-17` (admin)

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/analitica/panel?id_sede=&desde=&hasta=` | Socios activos, altas, bajas, por vencer, vencidas, en riesgo, asistencia de hoy, ingresos, visitas por día y comparativo por sede. |
| GET | `/analitica/reportes?id_sede=&desde=&hasta=` | Horas pico (día × hora), visitas, ingresos, renovaciones, retención y adherencia por mes; ingresos por plan, sede y método. Periodo máximo de 12 meses. |

### Administración — `CRM-RF-18` a `CRM-RF-20`, `CRM-RNF-02`

| Método | Ruta | Rol | Descripción |
| :--- | :--- | :--- | :--- |
| GET / POST / PATCH | `/usuarios`, `/usuarios/:id` | Admin | Contraseña de 10+ caracteres con mayúscula, minúscula, número y símbolo. Cambiar rol, sedes, contraseña o desactivar cierra sus sesiones. |
| POST | `/usuarios/:id/desbloquear` | Admin | Quita el bloqueo por intentos fallidos. |
| GET / POST | `/usuarios/:id/sesiones`, `/usuarios/:id/sesiones/cerrar`, `/usuarios/:id/sesiones/:sesion/cerrar` | Admin | Sesiones activas y revocación. |
| POST | `/auth/logout` | Personal | Revoca la sesión actual. |
| GET / POST / PATCH | `/sedes-admin`, `/sedes-admin/:id` | Admin | Sedes con horario por día (`dia_semana` 1 = lunes). |
| GET | `/bitacora?id_usuario=&id_socio=&entidad=&accion=&desde=&hasta=&pagina=` | Admin | Bitácora paginada con valores antes y después. |
| GET | `/solicitudes-arco` | Recepción | Solicitudes de derechos ARCO. |
| POST | `/socios/:id/solicitudes-arco` | Recepción | `{ tipo: acceso\|rectificacion\|cancelacion\|oposicion, descripcion }`. |
| PATCH | `/solicitudes-arco/:id` | Admin | `{ estado }`. |
| GET | `/socios/:id/datos-personales` | Admin | Todos los datos del socio descifrados (derecho de acceso). |
| POST | `/congelamientos/:id/terminar` | Recepción | Termina hoy un congelamiento o lo anula si aún no empieza; recorre el vencimiento. |
| POST | `/archivos/socios/:id/foto` | Recepción | `multipart/form-data` con el campo `archivo` (JPG, PNG o WebP, 5 MB). |
| POST | `/archivos/ejercicios` | Entrenador | Imagen (5 MB) o video MP4/WebM (40 MB); devuelve `media_url`. |

---

## Notificaciones push

1. **Firebase:** en la consola de Firebase crea el proyecto, agrega la app Android con el paquete `com.example.gymhub` y descarga `google-services.json` a `android/app/`. En *Configuración del proyecto > Cuentas de servicio* genera una clave privada y copia `project_id`, `client_email` y `private_key` a `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` (con los saltos de línea como `\n`). También sirve `GOOGLE_APPLICATION_CREDENTIALS` con la ruta del JSON.
2. **Redis (opcional):**
   ```bash
   docker run -d --name gymhub-redis -p 6379:6379 -v gymhub-redis:/data redis:7-alpine redis-server --appendonly yes
   ```
   y `REDIS_URL="redis://localhost:6379"`. Sin Redis, el backend revisa la tabla `notificacion` cada 15 segundos.
3. **Flujo:** campañas, recordatorios de riesgo y cambios de rutina crean filas en `notificacion` (`pendiente`). La cola las envía con `sendEachForMulticast`; los tokens inválidos se desactivan, los errores temporales se reintentan hasta 5 veces y luego quedan `fallido`. La app marca `entregado` al recibir el push y `leida` al abrirlo.

---

## Respaldos y restauración

`npm run respaldo` (desde `backend/`) hace `BACKUP DATABASE` de SQL Server y `mongodump` de MongoDB dentro de los contenedores, copia los archivos a `backups/AAAA-MM-DD_HHmm/` y borra los respaldos con más de `BACKUP_DIAS` días (7 por defecto).

* **Programarlo diario (Windows):** Programador de tareas > Crear tarea básica > Diariamente > Iniciar un programa: `cmd.exe` con argumentos `/c cd /d "<ruta>\GymHub\backend" && npm run respaldo >> backups\respaldo.log 2>&1`.
* **Linux/macOS:** `0 3 * * * cd /ruta/GymHub/backend && npm run respaldo >> backups/respaldo.log 2>&1`.
* **Restaurar:** detén el backend y ejecuta `npm run respaldo -- --restaurar 2026-11-03_0300 --si`. Reemplaza `gimnasio_crm` (`RESTORE ... WITH REPLACE`) y las colecciones de `gymhub_rutinas` (`mongorestore --drop`). Sin `--si` solo muestra la advertencia.
* Copia la carpeta `backups/` a otro disco o a la nube: un respaldo en el mismo equipo no protege contra la pérdida del disco.

---

## API de la App Móvil (`/app`)

Rutas para el socio desde la app Android. Usan un token propio (`tipo: 'socio'`): no sirve en el CRM, y el token del personal no sirve aquí. Todas responden con datos del socio autenticado; no reciben `id_socio`.

### Acceso — `APP-RF-01`, `APP-RF-03`
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `POST` | `/app/auth/activar` | `folio`, `correo` (el registrado en el CRM), `password`, `dispositivo?`. Solo socios activos y una vez por socio. |
| `POST` | `/app/auth/login` | `correo`, `password`, `dispositivo?`. Bloqueo por intentos igual que el CRM. |
| `POST` | `/app/auth/refresh` | `refresh_token`. Devuelve un par nuevo; reusar uno viejo revoca todas las sesiones del socio. |
| `POST` | `/app/auth/recuperar` | `correo`. Respuesta genérica exista o no la cuenta. Fuera de producción el código se escribe en el log. |
| `POST` | `/app/auth/restablecer` | `token`, `password`. Código de un solo uso (30 min); cierra todas las sesiones. |
| `POST` | `/app/auth/logout` | `refresh_token`, `fcm_token?`. Revoca la sesión y desactiva el token push. |

Contraseña: mínimo 10 caracteres con mayúscula, minúscula, número y símbolo.

### Datos del socio — `APP-RF-02` a `APP-RF-15`
| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` / `PATCH` | `/app/perfil` | Perfil con membresía y sede. El PATCH acepta solo `telefono`, `correo`, `foto_url`, `contacto_emergencia`. |
| `GET` | `/app/membresia` | Plan, vigencia, congelamientos y pagos. |
| `GET` | `/app/credencial` | Datos de la credencial y `qr` (`GYMHUB:<folio>`). |
| `GET` | `/app/rutina` | Rutina vigente con bloques y versión. |
| `GET` / `POST` | `/app/sesiones` | Historial (`?desde=&hasta=`) / registrar sesión. El `uuid_cliente` hace el POST idempotente. |
| `GET` | `/app/progreso` | Adherencia por semana y mes, calorías, FC por sesión y rachas (12 semanas por defecto). |
| `GET` / `POST` | `/app/ficha-salud` | Ficha actual (cuerpo vacío si no hay) / nueva versión con origen `app`. |
| `GET` / `POST` | `/app/consentimientos` | `datos_salud`, `notificaciones`, `health_connect`. Cada cambio es un registro nuevo. |
| `POST` | `/app/salud/sincronizar` | `datos: [{ tipo, valor, inicio, fin }]` (hasta 2000). Ignora repetidos; exige consentimiento `health_connect`. |
| `GET` | `/app/salud/estado` | Fecha de la última sincronización exitosa. |
| `POST` | `/app/dispositivos` | `fcm_token` del teléfono (si ya era de otro socio, se reasigna). |
| `GET` | `/app/notificaciones` | Bandeja (últimas 100). |
| `PATCH` | `/app/notificaciones/:id/leida` | Marca como leída. |
| `GET` / `PUT` | `/app/notificaciones/preferencias` | `vencimiento`, `rutina`, `promociones`, `avisos`; sin registro, la categoría está activa. |

---

## Comandos Disponibles

| Script | Descripción |
| :--- | :--- |
| `npm run start:dev` | Modo desarrollo con recarga en caliente. |
| `npm run build` | Genera el cliente Prisma y compila a `dist/`. |
| `npm run start:prod` | Ejecuta `dist/main.js`. |
| `npm run prisma:generate` | Genera el cliente Prisma de SQL Server en `src/generated/prisma`. |
| `npm run db:pull:check` | Introspecciona la BD real y la imprime, para comparar con `schema.prisma` (no modifica nada). |
| `npm run token:dev` | Genera un JWT de personal para desarrollo (bloqueado en producción). |
| `npm run usuario:password` | Asigna una contraseña segura (bcrypt) a un usuario y desbloquea la cuenta. |
| `npm run respaldo` | Respalda SQL Server y MongoDB en `backups/` y borra los de más de 7 días. Con `-- --restaurar <carpeta> --si` restaura. |
| `npm run claves:rotar` | Re-cifra los datos con la clave activa después de cambiar `ENCRYPTION_KEY` (requiere `npm run build`). |
| `npm run test` / `test:cov` | Pruebas unitarias / cobertura. |
| `npm run test:e2e` | Pruebas End-to-End. |
| `npm run lint` | Oxlint sobre `src/` y `test/`. |

---

## Estructura del Proyecto

```text
backend/
├── database/
│   ├── sqlserver/
│   │   ├── gimnasio_crm.sql           # Esquema oficial (fuente de verdad)
│   │   ├── 002_vista_membresia_actual.sql
│   │   └── seed_dev.sql               # Datos de prueba
│   └── mongodb/gymhub_rutinas.js      # Colecciones, validadores, índices y ejercicios base
├── prisma/sqlserver/schema.prisma     # Modelos para el cliente tipado (sin db push)
├── prisma.config.ts                   # Config de Prisma 7 (schema + URL)
├── scripts/
│   ├── token-dev.mjs                  # JWT de desarrollo
│   └── usuario-password.mjs           # Cambio de contraseña de usuarios
├── src/
│   ├── common/
│   │   ├── audit/                     # Bitácora (CRM-RF-20) e interacciones (CRM-RF-15)
│   │   ├── auth/                      # Guards JWT y de roles, @Roles, @Public, @Ctx, sedes
│   │   ├── crypto/                    # AES-256-GCM + índices ciegos
│   │   └── utils/                     # Fechas (zona horaria), folios, serialización
│   ├── auth/                          # Login, /auth/me y /sedes (CRM-RF-18)
│   ├── prisma/                        # PrismaService (adapter mssql) y filtro de errores
│   ├── mongo/                         # Cliente de MongoDB y filtro de errores
│   ├── socios/                        # CRM-RF-01 + aviso de privacidad
│   ├── planes/                        # CRM-RF-02
│   ├── membresias/                    # CRM-RF-03 (reglas puras + servicio)
│   ├── pagos/                         # CRM-RF-04 + comprobante HTML
│   ├── ficha-salud/                   # CRM-RF-05
│   ├── rutinas/                       # CRM-RF-06 a 10: ejercicios, plantillas, asignación, versiones y seguimiento
│   ├── generated/                     # Cliente Prisma generado (no versionado)
│   ├── app.module.ts
│   └── main.ts                        # CORS, ValidationPipe global, filtros de Prisma y MongoDB
└── test/
    ├── helpers/                       # Dobles de Prisma y MongoDB para pruebas unitarias
    └── app.e2e-spec.ts
```

---

## Pruebas y Calidad

```bash
npm test          # 124 pruebas unitarias
npm run test:cov  # cobertura
npm run lint
```

Cobertura medida el 2026-11-02, antes del login y de los módulos de rutinas:

| Alcance | Líneas |
| :--- | :--- |
| Servicios del módulo (socios, membresías, pagos, planes, ficha de salud) | 86% a 98% |
| Cifrado, guards y reglas de vigencia | 91% a 100% |
| **Total de `src/`** | **~76%** |

El total no llega al 80% de la DoD porque controladores y DTOs no tienen pruebas e2e. Faltan pruebas con Supertest contra bases de prueba en los mismos contenedores de Docker.
