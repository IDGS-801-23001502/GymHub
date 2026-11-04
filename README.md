# GymHub

> **Plataforma CRM inteligente y aplicación móvil para la fidelización de socios, gestión de membresías, prescripción evolutiva de rutinas y prevención de deserción en gimnasios.**

---

## Tabla de Contenidos

- [Acerca del Proyecto](#acerca-del-proyecto)
- [Características Principales](#características-principales)
- [Arquitectura y Tecnologías](#arquitectura-y-tecnologías)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Flujo de Trabajo y Ramas](#flujo-de-trabajo-y-ramas)
- [Configuración del Entorno de Desarrollo](#configuración-del-entorno-de-desarrollo)
  - [Requisitos Previos](#requisitos-previos)
  - [Variables de Entorno](#variables-de-entorno)
  - [Instalación y Ejecución del Backend (NestJS)](#instalación-y-ejecución-del-backend-nestjs)
  - [Instalación y Ejecución del Frontend (React + Vite)](#instalación-y-ejecución-del-frontend-react--vite)
  - [Instalación y Ejecución de la App Móvil (Android)](#instalación-y-ejecución-de-la-app-móvil-android)
- [Bases de Datos y Persistencia Dual](#bases-de-datos-y-persistencia-dual)
- [Requerimientos del Sistema](#requerimientos-del-sistema)
  - [CRM — Requerimientos Funcionales](#crm--requerimientos-funcionales)
  - [CRM — Requerimientos No Funcionales](#crm--requerimientos-no-funcionales)
  - [App Móvil — Requerimientos Funcionales](#app-móvil--requerimientos-funcionales)
  - [App Móvil — Requerimientos No Funcionales](#app-móvil--requerimientos-no-funcionales)
- [Estado de Avance](#estado-de-avance)
- [Lista de Requerimientos y Correcciones por Realizar](#lista-de-requerimientos-y-correcciones-por-realizar)
- [Marco de Trabajo Ágil y Metodología](#marco-de-trabajo-ágil-y-metodología)
- [Equipo de Desarrollo (DevByte)](#equipo-de-desarrollo-devbyte)

---

## Acerca del Proyecto

**GymHub** es un ecosistema integral enfocado en la retención activa, personalización del entrenamiento y gestión operativa para gimnasios e instalaciones deportivas multisede. Combina un portal administrativo web (CRM) con una aplicación móvil nativa (Android) conectada a Google Health Connect, permitiendo a entrenadores, recepcionistas y administradores acompañar la trayectoria deportiva y el ciclo de vida de cada socio.

### Objetivos Principales
* **Fidelización y Retención Activa:** Algoritmo periódico de detección de riesgo de abandono basado en inactividad y vencimientos, con segmentación y campañas push preventivas.
* **Prescripción de Entrenamiento Evolutivo:** Creación y ajuste de plantillas de rutinas por bloques estructurados en MongoDB, con versionado en tiempo real, seguimiento de cargas y cálculo de adherencia.
* **Seguridad y Confidencialidad Rigurosa:** Cifrado simétrico AES-256 para información médica y datos de contacto, control de acceso por roles (RBAC) y bitácora de auditoría inmutable.
* **Continuidad Operativa:** Registro presencial ágil de asistencias (búsqueda o QR de credencial digital), gestión de planes, congelamientos y cobro de membresías con emisión de comprobante foliado.

---

## Características Principales

* **Gestión Integral de Socios y Membresías:**
  * Alta de socios con cifrado de contacto, validación de duplicados y bajas lógicas.
  * Catálogo de planes (mensual, trimestral, anual) con historial inmutable.
  * Renovaciones con cálculo automático de vigencias acumuladas y congelamiento temporal.
  * Registro de cobros presenciales (efectivo, tarjeta, transferencia), generación de folios, recibos imprimibles y cancelación auditada (sin cobros en línea).
  * Ficha médica y cuestionario de salud versionado con cifrado AES-256 y acceso restringido.
* **Motor Dinámico de Rutinas y Entrenamiento:**
  * Catálogo de ejercicios clasificados por grupos musculares y equipamiento en MongoDB.
  * Plantillas compuestas por bloques (calentamiento, fuerza, cardio, estiramiento), series y descansos.
  * Asignación guiada considerando objetivos y restricciones médicas del socio.
  * Versionado automático con autor, fecha y motivo de modificación.
  * Monitoreo de sesiones y cálculo de adherencia frente al plan previsto.
* **Control de Asistencia Rápido:**
  * Búsqueda por nombre, teléfono o escaneo directo de la credencial digital con código QR.
  * Validación instantánea de vigencia de membresía y registro de sede y hora.
* **Retención Inteligente y Notificaciones:**
  * Motor de segmentación multicriterio exportable para campañas dirigidas.
  * Detección proactiva de socios en riesgo de deserción por inactividad o vencimiento cercano.
  * Campañas y avisos automáticos despachados vía Redis y Firebase Cloud Messaging (FCM).
  * Línea de tiempo unificada con todo el historial de interacciones del socio.
* **Inteligencia de Negocio y Reportes:**
  * Dashboard directivo con KPIs de socios activos, altas, bajas, asistencia diaria y socios en riesgo.
  * Reportes de retención, horas pico, renovaciones e ingresos por membresías exportables a PDF y Excel.
* **App Móvil Nativa (Android / Kotlin):**
  * Activación de cuenta por folio/correo y perfil de usuario sincronizado.
  * Consulta de membresía, estado por color y credencial digital con código QR.
  * Ejecución de rutinas con cronómetro de descansos y registro de cargas en modo offline.
  * Sincronización en segundo plano con Google Health Connect (calorías, frecuencia cardíaca, pasos) vía WorkManager.
  * Bandeja y preferencias de notificaciones push de alta prioridad.
  * Gráficas de evolución, racha de asistencia y adherencia al entrenamiento.

---

## Arquitectura y Tecnologías

El proyecto implementa un enfoque de **monorepo modular** desacoplado, con persistencia dual diseñada para separar la alta consistencia transaccional del contenido dinámico y documental.

```
                  +-----------------------------------+
                  |         Clientes / Apps           |
                  |  [React Web CRM]    [Android App] |
                  +-----------------+-----------------+
                                    | REST API (HTTPS / JWT)
                                    v
                  +-----------------------------------+
                  |          NestJS Backend           |
                  +--------+-----------------+--------+
                           |                 |
             (Transaccional / Prisma)   (Documental / driver)
                           v                 v
                    +--------------+  +--------------+
                    | SQL Server   |  | MongoDB      |
                    | 2022         |  |              |
                    +--------------+  +--------------+
                           |
                     (Task Queues / Worker)
                           v
                    +--------------+
                    | Redis/BullMQ |
                    +-------+------+
                            | Push Notifications
                            v
                    +--------------+
                    | Firebase FCM |
                    +--------------+
```

### Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Frontend Web (CRM)** | React 19, TypeScript, Vite 8, React Router 7, ESLint | Panel administrativo y de recepción responsivo (escritorio y tablet) |
| **Backend API** | Node.js (v20+ / v22+), NestJS 12, TypeScript | REST API modular, inyección de dependencias, OpenAPI / Swagger |
| **Acceso a datos** | Prisma ORM 7 (`@prisma/adapter-mssql`) y driver oficial `mongodb` | Cliente tipado para SQL Server; el esquema oficial vive en `backend/database/sqlserver/gimnasio_crm.sql` |
| **Base de Datos Relacional** | SQL Server 2022 (Docker, puerto 1433) | Gestión transaccional ACID: usuarios, socios, membresías, pagos, sedes, fichas de salud, asignación de rutinas y auditoría |
| **Base de Datos Documental** | MongoDB 7+ (Docker, puerto 27017) | Catálogo de ejercicios, plantillas por bloques y contenido de cada versión de rutina |
| **App Móvil** | Android Nativo (Kotlin, Jetpack Compose, Material Design) | Aplicación nativa (minSdk 26) con integración a Google Health Connect |
| **Almacenamiento Local Móvil** | EncryptedSharedPreferences / Android Keystore, Room | Seguridad de tokens, datos locales y tolerancia a fallos offline |
| **Procesamiento en Segundo Plano** | WorkManager (Android), BullMQ / Redis (Backend) | Sincronización diferida de salud y colas de campañas de retención |
| **Notificaciones Push** | Firebase Cloud Messaging (FCM) | Envíos directos y automatizados de alta prioridad |
| **Cifrado y Seguridad** | AES-256-GCM, Bcrypt / Argon2, JWT | Cifrado en reposo para datos sensibles y autenticación robusta |
| **Pruebas y Calidad** | Vitest, Supertest, JUnit, Oxlint | Cobertura unitaria (>80%), pruebas E2E y análisis estático |

---

## Estructura del Proyecto

El repositorio está organizado como un **monorepo**:

```text
GymHub/
├── .env.example              # Plantilla de variables de entorno globales
├── .gitignore                # Reglas de exclusión de Git a nivel raíz
├── README.md                 # Documentación principal, requerimientos y matriz de tareas
│
├── backend/                  # Proyecto API Backend (NestJS 12) -> Ver [backend/README.md](./backend/README.md)
│   ├── .env.example          # Plantilla de entorno para backend
│   ├── .gitignore            # Exclusiones de Git específicas del backend
│   ├── nest-cli.json         # Configuración del CLI de NestJS
│   ├── oxlint.json           # Configuración del linter Oxlint
│   ├── package.json          # Dependencias y scripts del backend
│   ├── tsconfig.json         # Configuración de TypeScript
│   ├── database/
│   │   ├── sqlserver/        # Script oficial de SQL Server (fuente de verdad), vista 002 y seed de desarrollo
│   │   └── mongodb/          # Colecciones, validadores, índices y catálogo base de ejercicios
│   ├── prisma/sqlserver/     # schema.prisma: modelos para el cliente tipado (no crea tablas)
│   ├── src/                  # Módulos: common (cifrado, auth, bitácora), auth, socios, planes, membresias, pagos, ficha-salud, mongo, rutinas
│   └── test/                 # Pruebas unitarias y End-to-End con Vitest y Supertest
│
├── frontend/                 # Proyecto Web SPA CRM (React 19 + Vite 8) -> Ver [frontend/README.md](./frontend/README.md)
│   ├── .env.example          # Plantilla de entorno para frontend
│   ├── .gitignore            # Exclusiones de Git específicas del frontend
│   ├── eslint.config.js      # Configuración de ESLint (Flat Config)
│   ├── index.html            # Punto de entrada HTML
│   ├── package.json          # Dependencias y scripts del frontend
│   ├── tsconfig.json         # Configuración de TypeScript
│   ├── vite.config.ts        # Configuración de empaquetado Vite
│   ├── public/               # Recursos estáticos públicos
│   └── src/                  # api/ (cliente HTTP), auth/ (sesión), components/ (layout, UI, editor de bloques), pages/ (login, socios, pagos, planes, ejercicios, plantillas)
│
└── android/                  # Aplicación Móvil Nativa (Kotlin + Jetpack Compose)
    ├── build.gradle.kts      # Configuración de compilación raíz
    ├── settings.gradle.kts   # Configuración de módulos y repositorios Gradle
    └── app/
        ├── build.gradle.kts  # Dependencias Android (Compose, Navigation, Health Connect, WorkManager)
        └── src/
            ├── main/
            │   ├── AndroidManifest.xml # Permisos y configuración de la app
            │   ├── java/com/example/gymhub/
            │   │   ├── screens/        # Vistas Compose (Login, Dashboard, Membresía, Rutinas, Progreso)
            │   │   └── ui/theme/       # Paleta y tipografía Material Design
            │   └── res/                # Recursos gráficos, iconos y strings
            └── test/                   # Pruebas unitarias de ViewModels y repositorios
```

---

## Flujo de Trabajo y Ramas

Se utiliza una estrategia de ramificación basada en **GitFlow simplificado**:

```text
main  -------------------------------------[Release Tag v1.0]--->
        \                                     /
dev      *-------*-------------------*-------*------------------->
                  \                 /
feature            *--[feature/...]--*
```

* `main`: Entorno de producción estable. Solo recibe cambios integrados y validados.
* `dev`: Rama de desarrollo e integración continua activa para características probadas.
* `feature/RF-XX-descripcion`: Ramas de corta duración para desarrollar requerimientos específicos.
* `fix/bug-descripcion`: Ramas de corrección puntual de incidencias.

### Convención de Commits
Se aplican commits atómicos haciendo referencia al requerimiento correspondiente:
```bash
git commit -m "feat(CRM-RF-01): implementar alta de socios con cifrado AES-256"
git commit -m "fix(APP-RF-11): corrección en solicitud de permisos de Health Connect"
```

---

## Configuración del Entorno de Desarrollo

### Requisitos Previos
* **Node.js**: Versión LTS recomendada (`v20.x` o superior, compatible con `v22.x` y `v24.x`).
* **npm**: `v10.x` o superior.
* **Instancias de Base de Datos y Servicios**:
  * Docker con dos contenedores: SQL Server 2022 (`mssql_container`, puerto 1433) y MongoDB (`mongo_container`, puerto 27017).
  * Redis (para colas BullMQ y notificaciones; aún no se usa).
* **Entorno Móvil**:
  * Android Studio Ladybug / Koala o superior con Android SDK API 34+.
  * Dispositivo físico o emulador con Android 8.0 (API 26) o superior.

### Variables de Entorno

1. **Backend (`backend/.env`):**
   ```env
   PORT=3000
   NODE_ENV="development"
   APP_TIMEZONE="America/Mexico_City"
   JWT_SECRET="clave-super-secreta-para-firmar-jwt"
   ENCRYPTION_KEY="<64 caracteres hex = 32 bytes>"   # AES-256-GCM (CRM-RNF-01)
   ENCRYPTION_KEY_ID=1                               # rotación de claves
   BLIND_INDEX_PEPPER="<secreto de 16+ caracteres>"  # índices ciegos de correo/teléfono
   SQLSERVER_URL="sqlserver://localhost:1433;database=gimnasio_crm;user=sa;password=<contraseña>;encrypt=true;trustServerCertificate=true"
   MONGODB_URL="mongodb://<usuario>:<contraseña>@localhost:27017/gymhub_rutinas?authSource=admin"   # '#' se escribe %23
   REDIS_URL="redis://localhost:6379"
   FIREBASE_PROJECT_ID="gymhub-fcm"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   FIREBASE_CLIENT_EMAIL="firebase-adminsdk@gymhub.iam.gserviceaccount.com"
   ```
   La lista completa, con descripciones, está en [`backend/.env.example`](./backend/.env.example) y en el [README del backend](./backend/README.md#variables-de-entorno).

   Servicios opcionales (el backend funciona sin ellos):
   * **Redis** para la cola de notificaciones: `docker run -d --name gymhub-redis -p 6379:6379 -v gymhub-redis:/data redis:7-alpine redis-server --appendonly yes` y `REDIS_URL="redis://localhost:6379"`.
   * **Firebase** para el push: cuenta de servicio en `FIREBASE_*` (backend) y `google-services.json` en `android/app/` (app). Detalle en el [README del backend](./backend/README.md#notificaciones-push).
   * **SMTP** (`SMTP_*`) para mandar por correo el código de recuperación de contraseña de la app.

2. **Frontend (`frontend/.env`):**
   ```env
   VITE_API_URL="http://localhost:3000"
   VITE_MINUTOS_INACTIVIDAD=30       # cierre de sesión por inactividad (CRM-RNF-03)
   VITE_CONGELAMIENTO_MAX_DIAS=90    # igual que CONGELAMIENTO_MAX_DIAS del backend
   ```

---

### Instalación y Ejecución del Backend (NestJS)

1. Dirígete a la carpeta del backend:
   ```bash
   cd backend
   ```
2. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   # Edita .env con tus credenciales reales
   ```
3. Instala dependencias (también genera el cliente Prisma):
   ```bash
   npm install
   ```
4. Crea las bases en los contenedores de Docker. `gimnasio_crm.sql` **borra y recrea** `gimnasio_crm`; el seed es solo para desarrollo:
   ```bash
   # SQL Server
   for f in gimnasio_crm.sql 002_vista_membresia_actual.sql seed_dev.sql; do
     docker cp database/sqlserver/$f mssql_container:/tmp/$f
     docker exec mssql_container /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P '<contraseña>' -C -f 65001 -i /tmp/$f
   done
   # MongoDB (idempotente: crea colecciones, validadores, índices y 16 ejercicios base)
   docker cp database/mongodb/gymhub_rutinas.js mongo_container:/tmp/gymhub_rutinas.js
   docker exec mongo_container mongosh --quiet "mongodb://<usuario>:<contraseña>@localhost:27017/?authSource=admin" /tmp/gymhub_rutinas.js
   ```
   En Git Bash de Windows antepón `MSYS_NO_PATHCONV=1` a los `docker exec`. No uses `prisma db push`: borraría las tablas que aún no están modeladas en Prisma.
5. Usuarios del seed (contraseña `GymHub2026!`): `admin@gymhub.dev`, `recepcion@gymhub.dev` y `entrenador@gymhub.dev`. Cámbiala con `npm run usuario:password -- <correo> "<nueva>"`.
6. Inicia el servidor en modo desarrollo:
   ```bash
   npm run start:dev
   ```
   El backend estará disponible en `http://localhost:3000`.

7. **Pruebas y calidad de código:**
   ```bash
   npm run test        # Pruebas unitarias con Vitest
   npm run test:cov    # Cobertura de pruebas unitarias (>80%)
   npm run test:e2e    # Pruebas End-to-End con Vitest y Supertest
   npm run lint        # Análisis estático ultra rápido con Oxlint
   npm run build       # Compilación de producción
   ```

---

### Instalación y Ejecución del Frontend (React + Vite)

1. Dirígete a la carpeta del frontend:
   ```bash
   cd frontend
   ```
2. Configura las variables de entorno:
   ```bash
   cp .env.example .env
   ```
3. Instala dependencias:
   ```bash
   npm install
   ```
4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```
   El frontend estará disponible en `http://localhost:5173`. Inicia sesión con un usuario del seed.

   **Pantallas disponibles:**
   * **Login** con bloqueo por intentos fallidos y cierre automático por inactividad o expiración del token.
   * **Socios:** búsqueda por nombre, folio, correo o teléfono, con filtros de estado y sede.
   * **Nuevo socio:** asistente de 5 pasos con aviso de privacidad y aceptación explícita.
   * **Expediente del socio**, con cuatro pestañas:
     * Datos: edición, baja y reactivación.
     * Membresías y pagos: asignar o renovar con cobro, congelar y abrir comprobantes.
     * Ficha de salud: versiones, consentimiento y etiquetas de restricción para rutinas.
     * Rutina (entrenador): asistente de asignación en 3 pasos con sugerencias según objetivo y ficha de salud, ajustes con versión y motivo, comparación de versiones y seguimiento de sesiones con adherencia.
   * **Ejercicios** (entrenador): catálogo con grupo muscular, equipo, imagen o video y contraindicaciones.
   * **Plantillas** (entrenador): plantillas por bloques (calentamiento, fuerza, cardio, estiramiento), duplicado y desactivación.
   * **Pagos:** filtros por fecha, estado y sede, comprobante imprimible y cancelación (solo administrador).
   * **Planes:** catálogo; el administrador crea, edita y activa o desactiva planes.

   El menú y los botones se muestran según el rol, y el backend vuelve a validar cada petición. El diseño se adapta a escritorio y tablet.

5. **Compilación y calidad:**
   ```bash
   npm run build   # Verificación de tipos con tsc y build con Vite
   npm run lint    # Linter con ESLint
   npm run preview # Previsualización del build de producción
   ```

---

### Instalación y Ejecución de la App Móvil (Android)

Requisitos: Android Studio (JDK 21 incluido) y un emulador o teléfono con Android 8.0 (API 26) o superior. El backend debe estar corriendo.

1. Abre la carpeta `android` en **Android Studio** y sincroniza Gradle.
2. URL del backend:
   * **Emulador:** no hay que configurar nada; la versión debug usa `http://10.0.2.2:3000/` (el `localhost` de tu PC).
   * **Teléfono físico** en la misma red Wi-Fi: agrega `gymhub.apiUrl=http://IP_DE_TU_PC:3000/` a `android/gradle.properties` (o a `~/.gradle/gradle.properties`).
   * **Release:** usa `gymhub.apiUrlProd` (solo HTTPS; el tráfico sin cifrar está bloqueado fuera de debug).
3. **Notificaciones push (opcional):** descarga `google-services.json` de la consola de Firebase y colócalo en `android/app/`. Si no existe, la app compila igual y las push quedan desactivadas.
4. Compila, instala y prueba:
   ```bash
   cd android
   ./gradlew installDebug          # instala en el emulador/teléfono conectado
   ./gradlew testDebugUnitTest     # pruebas de ViewModels, repositorio y tokens
   ```
5. Para entrar se necesita un socio dado de alta en el CRM con correo. En la app: **Activar mi cuenta** → folio (`GH000123`) + ese correo + una contraseña nueva.

---

## Bases de Datos y Persistencia Dual

GymHub implementa una separación arquitectónica estricta para garantizar consistencia transaccional y flexibilidad documental:

1. **SQL Server transaccional (`backend/database/sqlserver/gimnasio_crm.sql`):**
   * **Propósito:** Integridad referencial ACID para operaciones críticas de membresías y finanzas (CRM-RNF-07).
   * **Entidades:** Sedes y horarios, Usuarios y Roles del personal, Socios (contacto cifrado e índices ciegos), Consentimientos y avisos de privacidad, Fichas de salud versionadas y cifradas, Catálogo de planes, Membresías y congelamientos, Pagos foliados, Asistencia, asignación y versiones de rutinas, sesiones de entrenamiento, datos de Health Connect, segmentos, riesgo de deserción, campañas y notificaciones, y Bitácora de auditoría de solo lectura.
   * **Cliente:** Prisma 7 con `@prisma/adapter-mssql`. `backend/prisma/sqlserver/schema.prisma` refleja las tablas que ya usa el backend.
   * **Respaldos:** Respaldos automáticos diarios con retención mínima de 7 días (CRM-RNF-10).

2. **MongoDB documental (`backend/database/mongodb/gymhub_rutinas.js`, base `gymhub_rutinas`):**
   * **Propósito:** Estructuras jerárquicas y flexibles (CRM-RNF-06). Los validadores `$jsonSchema` exigen los campos clave pero admiten campos nuevos sin migrar datos.
   * **Colecciones:** `ejercicios`, `plantillas_rutina` y `contenidos_rutina` (contenido inmutable de cada versión asignada). SQL Server solo guarda las referencias (`plantilla_mongo_id`, `contenido_mongo_id`).
   * **Cliente:** driver oficial `mongodb` (Prisma 7 no soporta MongoDB).
   * **Consistencia entre bases (CRM-RNF-07):** al asignar o versionar una rutina, las filas de SQL Server y el documento de Mongo se escriben dentro de la misma transacción `SERIALIZABLE`; si algo falla, la transacción se revierte y el documento se elimina.

---

## Requerimientos del Sistema

### CRM — Requerimientos Funcionales

#### Módulo: Socios y Membresías

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RF-01** | Alta y gestión de socios | Recepción o administración registra socios con nombre, fecha de nacimiento, teléfono, correo, contacto de emergencia, fotografía opcional y sede. Valida campos obligatorios y evita duplicados por correo o teléfono. Permite editar, dar de baja (baja lógica) y reactivar, conservando el historial. Los datos de contacto se almacenan cifrados. |
| **CRM-RF-02** | Catálogo de planes de membresía | El administrador define planes (mensual, trimestral, anual) con nombre, duración, precio, beneficios y estado. Los planes desactivados no se pueden asignar, pero se conservan en el historial de los socios que los usaron. |
| **CRM-RF-03** | Asignación y renovación de membresías | Al asignar o renovar un plan, el sistema calcula la fecha de vencimiento y el estado (activa, por vencer, vencida, congelada). Si la membresía sigue vigente, la renovación se suma a la fecha actual. Permite congelar por un periodo y conserva el historial de planes del socio. |
| **CRM-RF-04** | Registro de pagos de membresía | Recepción registra cada pago indicando socio, plan, monto, método (efectivo, tarjeta o transferencia) y referencia. Genera un folio y un comprobante imprimible, y vincula el pago con la membresía asignada. Permite cancelar un pago con motivo y autorización, y deja constancia en la bitácora. No procesa cobros en línea. |
| **CRM-RF-05** | Ficha de salud | Permite capturar el cuestionario de salud (antecedentes, lesiones, alergias, medicamentos, nivel de actividad y objetivo). Los datos se guardan cifrados y versionados, con fecha y responsable de cada actualización. Solo administrador y entrenador pueden consultarla completa. |

#### Módulo: Rutinas y Entrenamiento

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RF-06** | Catálogo de ejercicios | El entrenador administra ejercicios con nombre, grupo muscular, equipo necesario, descripción e imagen o video opcional. Los ejercicios se almacenan en MongoDB y pueden reutilizarse en cualquier plantilla. |
| **CRM-RF-07** | Plantillas de rutinas por bloques | El entrenador crea plantillas con bloques (calentamiento, fuerza, cardio, estiramiento), cada uno con ejercicios, series, repeticiones, descanso y notas. Las plantillas pueden duplicarse y clasificarse por objetivo y nivel. |
| **CRM-RF-08** | Asignación de rutinas al socio | El entrenador asigna una plantilla a un socio considerando su objetivo y las restricciones de su ficha de salud. El sistema sugiere plantillas compatibles y el entrenador confirma o ajusta antes de publicarla en la app. |
| **CRM-RF-09** | Ajuste y versionado de rutinas | El entrenador puede modificar la rutina asignada en cualquier momento. Cada cambio genera una versión nueva con fecha, autor y motivo, visible de inmediato para el socio. Se conserva el historial de versiones para consulta y comparación. |
| **CRM-RF-10** | Seguimiento de entrenamiento | Consolida las sesiones registradas desde la app (ejercicios, cargas, repeticiones, duración y datos de Health Connect) y calcula la adherencia como porcentaje de sesiones cumplidas frente a las planeadas. El entrenador lo consulta en el expediente del socio, filtrable por periodo. |

#### Módulo: Asistencia

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RF-11** | Registro de asistencia | Recepción registra la entrada del socio buscándolo por nombre, teléfono o folio, o escaneando el QR de su credencial digital. El sistema valida que la membresía esté vigente y avisa si está vencida o por vencer, pero no controla barreras físicas. Guarda fecha, hora y sede de cada visita. |

#### Módulo: Retención y Comunicación

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RF-12** | Segmentación de socios | Permite crear y guardar segmentos combinando filtros como estado de membresía, sede, objetivo, frecuencia de asistencia, antigüedad y rango de edad. El resultado puede visualizarse, exportarse y usarse como destino de campañas. |
| **CRM-RF-13** | Detección de riesgo de deserción | Un proceso automático evalúa periódicamente a los socios y marca como "en riesgo" a quienes superan un umbral de inactividad (por ejemplo, 10 días sin asistir) o tienen la membresía por vencer sin renovación. Los umbrales son configurables, y el tablero de seguimiento muestra el motivo y permite registrar la acción tomada. |
| **CRM-RF-14** | Campañas y notificaciones Push | El administrador crea mensajes con título, contenido, destinatarios (socio o segmento) y envío inmediato o programado. Además, el sistema envía automáticamente recordatorios de vencimiento e inactividad. Cada envío queda registrado con su estado (enviado, entregado, fallido) y se procesa con Redis y FCM. |
| **CRM-RF-15** | Historial de interacciones | Registra en una línea de tiempo cada contacto con el socio (notificaciones, renovaciones, cambios de rutina, llamadas y notas manuales) con fecha, responsable y descripción. El personal puede agregar notas y consultar el historial completo desde el expediente. |

#### Módulo: Analítica y Reportes

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RF-16** | Panel de indicadores | Muestra al administrador un panel con socios activos, altas y bajas del mes, membresías por vencer, socios en riesgo y asistencia del día, con filtros por sede y periodo. |
| **CRM-RF-17** | Reportes de retención y asistencia | Genera reportes de horas pico, adherencia al entrenamiento, tasa de retención y renovaciones por mes, plan y sede, además de ingresos por membresías con base en los pagos registrados. Se presentan con gráficos y tablas y se exportan a PDF o Excel. |

#### Módulo: Usuarios, Sedes y Seguridad

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RF-18** | Gestión de usuarios y roles | El administrador crea, edita y desactiva usuarios del personal (administrador, recepcionista, entrenador) y les asigna rol y sedes. El inicio de sesión usa correo y contraseña robusta, y la cuenta se bloquea tras varios intentos fallidos. |
| **CRM-RF-19** | Gestión de sedes | Permite dar de alta sucursales con sus datos, horarios y personal asignado. Los usuarios operan solo en sus sedes, y el administrador general puede consultar y comparar la información de todas. |
| **CRM-RF-20** | Consulta de bitácora de auditoría | El administrador puede consultar y filtrar la bitácora de accesos y modificaciones a datos personales, de salud y pagos (usuario, fecha, acción y valores anterior/nuevo). La bitácora es de solo lectura. |

---

### CRM — Requerimientos No Funcionales

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **CRM-RNF-01** | Cifrado de datos sensibles | Los datos de contacto y antecedentes médicos se cifran con AES-256 antes de almacenarse y se descifran solo en el backend ante una solicitud autorizada. Las claves se guardan fuera del código (variables de entorno o gestor de secretos) y pueden rotarse sin pérdida de información. |
| **CRM-RNF-02** | Protección de datos personales | El sistema cumple la legislación local vigente: muestra el aviso de privacidad al registrar al socio, guarda su consentimiento con fecha y versión, y permite atender solicitudes de acceso, corrección o eliminación de datos. |
| **CRM-RNF-03** | Control de acceso por rol | Cada petición se autentica con token (JWT) con expiración y se autoriza según el rol. Un rol sin permiso recibe acceso denegado y las pantallas ocultan las opciones no permitidas. Las sesiones inactivas se cierran automáticamente. |
| **CRM-RNF-04** | Seguridad de las comunicaciones y credenciales | Todas las comunicaciones usan HTTPS/TLS, las contraseñas se guardan con hash y sal (bcrypt o argon2) y el backend valida y sanea las entradas para prevenir inyección SQL y XSS. |
| **CRM-RNF-05** | Rendimiento | La búsqueda y consulta de socios y rutinas responde en menos de 2 segundos con hasta 5,000 socios, y los reportes se generan en menos de 5 segundos para periodos de hasta 12 meses. |
| **CRM-RNF-06** | Escalabilidad del motor de rutinas | El diseño de colecciones en MongoDB permite agregar nuevos tipos de ejercicios, bloques o campos sin migrar datos existentes, y las consultas frecuentes tienen índices para mantener el rendimiento. |
| **CRM-RNF-07** | Integridad de datos entre bases | Las operaciones críticas (asignar membresía y registrar pago) se ejecutan como transacciones atómicas en SQL Server. Los eventos hacia MongoDB y notificaciones se procesan de forma asíncrona con reintentos para evitar inconsistencias. |
| **CRM-RNF-08** | Usabilidad | La interfaz es responsiva (escritorio y tablet), tiene un diseño consistente y permite completar tareas frecuentes, como registrar un socio o asignar una rutina, en máximo 5 pasos, con mensajes de error claros. |
| **CRM-RNF-09** | Disponibilidad | La API y el portal están disponibles al menos el 99% del tiempo durante el horario de operación de las sucursales, y los mantenimientos se programan fuera de ese horario. |
| **CRM-RNF-10** | Respaldo y recuperación | Se realizan respaldos automáticos diarios de SQL Server y MongoDB con retención mínima de 7 días y un procedimiento de restauración documentado y probado. |
| **CRM-RNF-11** | Compatibilidad | El portal funciona en las dos últimas versiones de Chrome, Edge, Firefox y Safari, desde tablet (768 px) hasta escritorio, sin soporte para navegadores obsoletos. |
| **CRM-RNF-12** | Mantenibilidad | El backend en NestJS usa arquitectura modular, cobertura de pruebas unitarias superior al 80%, análisis estático (ESLint, SonarQube) y especificación OpenAPI actualizada. |

---

### App Móvil — Requerimientos Funcionales

#### Módulo: Acceso y Perfil

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RF-01** | Inicio de sesión y activación de cuenta | El socio activa su cuenta con su folio y correo, e inicia sesión con sus credenciales. La app valida los campos, muestra errores claros, mantiene la sesión con un token renovable e incluye la recuperación de contraseña. |
| **APP-RF-02** | Perfil del socio | Muestra los datos del socio (nombre, foto, sede, objetivo) y permite actualizar teléfono, correo, foto y contacto de emergencia. Los cambios se validan y se sincronizan con el backend. |
| **APP-RF-03** | Cierre de sesión | Permite cerrar sesión desde la configuración. La app invalida el token en el servidor y borra del dispositivo los datos locales sensibles (token, caché de rutina y datos de salud). |

#### Módulo: Membresía

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RF-04** | Consulta de membresía y pagos | Muestra el plan activo, la fecha de vencimiento, los días restantes y el estado con un indicador de color (vigente, por vencer, vencida), además del historial de pagos y renovaciones registrados por el gimnasio. Es solo de consulta. |
| **APP-RF-05** | Credencial digital | Presenta una credencial con foto, nombre, folio y código QR para que recepción registre la asistencia. Si la membresía está vencida, la credencial lo indica. |

#### Módulo: Rutinas y Entrenamiento

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RF-06** | Consulta de rutina asignada | Muestra la rutina vigente por día y bloques, con ejercicios, series, repeticiones, descanso y notas del entrenador. Indica la fecha de la última actualización y permite consultarla sin conexión una vez descargada. |
| **APP-RF-07** | Registro de entrenamiento | Durante la sesión, el socio marca ejercicios completados, captura cargas y repeticiones realizadas y usa un cronómetro de descanso. Al finalizar guarda la sesión y la envía al backend, o la encola si no hay conexión. |
| **APP-RF-08** | Historial de entrenamiento | Presenta las sesiones pasadas en orden cronológico con fecha, duración, ejercicios y cargas, con filtro por periodo y comparación de la evolución de un ejercicio. |

#### Módulo: Salud y Actividad Física

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RF-09** | Cuestionario de salud | Permite llenar o actualizar el cuestionario de salud desde el móvil con guardado parcial. Antes de enviarlo, informa el uso que se dará a los datos y solicita la aceptación del socio. |
| **APP-RF-10** | Consentimiento y permisos | Solicita y registra de forma explícita el consentimiento para tratar datos de salud, junto con los permisos de notificaciones y Health Connect. El socio puede revisarlos y revocarlos desde la configuración, y la app deja de usar esos datos de inmediato. |
| **APP-RF-11** | Integración con Health Connect | Con autorización del socio, lee desde Google Health Connect el gasto calórico, la frecuencia cardíaca y los pasos. Si Health Connect no está disponible o se deniega el permiso, la app explica cómo habilitarlo y sigue funcionando sin esos datos. |
| **APP-RF-12** | Sincronización de datos de salud | De forma periódica y en segundo plano, envía al backend los datos nuevos desde la última sincronización, evita duplicados con marcas de tiempo, reintenta si falla la red y muestra la fecha de la última sincronización exitosa. |

#### Módulo: Notificaciones

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RF-13** | Recepción de notificaciones Push | Recibe por FCM recordatorios de vencimiento, avisos por inactividad y mensajes del gimnasio, incluso con la app cerrada o en segundo plano. Al tocar una notificación abre la pantalla relacionada. |
| **APP-RF-14** | Preferencias de notificaciones | Permite al socio activar o desactivar por categoría (vencimiento, rutina, promociones y avisos) las notificaciones que desea recibir, y consultar las recibidas en una bandeja dentro de la app. |

#### Módulo: Progreso

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RF-15** | Visualización de progreso | Muestra gráficos de adherencia semanal y mensual, calorías gastadas y frecuencia cardíaca promedio por sesión, con selector de periodo. Destaca logros como rachas de asistencia y metas cumplidas. |

---

### App Móvil — Requerimientos No Funcionales

| ID | Nombre | Descripción |
| :--- | :--- | :--- |
| **APP-RNF-01** | Seguridad en tránsito | Toda comunicación con el backend usa HTTPS/TLS 1.2 o superior. La app rechaza certificados inválidos y no envía datos sensibles en URLs ni en logs. |
| **APP-RNF-02** | Seguridad en el dispositivo | Los tokens y datos sensibles se almacenan cifrados con Android Keystore y EncryptedSharedPreferences. La app no guarda contraseñas y bloquea capturas de pantalla en las vistas con datos de salud. |
| **APP-RNF-03** | Privacidad de datos de salud | Los datos de Health Connect se leen solo con permiso explícito y únicamente los tipos necesarios, con posibilidad de revocarlos en cualquier momento. La app cumple la política de privacidad de Google Play y el aviso de privacidad del gimnasio. |
| **APP-RNF-04** | Compatibilidad | Funciona en Android 8.0 (API 26) o superior, con distintos tamaños de pantalla y densidades. La integración con Health Connect se habilita solo en dispositivos compatibles. |
| **APP-RNF-05** | Rendimiento | La app inicia y carga sus pantallas principales en menos de 3 segundos con conexión estable, y las operaciones de red se ejecutan fuera del hilo principal para mantener la interfaz fluida. |
| **APP-RNF-06** | Fiabilidad de notificaciones | Las notificaciones Push se despachan en menos de 5 segundos desde la ejecución del flujo en el servidor, usando un canal de alta prioridad en FCM. Si el ahorro de batería las bloquea, la app muestra una alerta con los pasos para permitirlas. |
| **APP-RNF-07** | Consumo de batería | La sincronización en segundo plano usa WorkManager con restricciones (red disponible, batería no crítica) y agrupa operaciones, sin mantener servicios activos innecesarios. |
| **APP-RNF-08** | Usabilidad y accesibilidad | La interfaz sigue Material Design, con textos legibles y contrastes adecuados, y permite llegar a las funciones principales (rutina, membresía, progreso) en máximo 2 toques desde el inicio. |
| **APP-RNF-09** | Tolerancia a fallos de red | Sin conexión, la app muestra la última información descargada y guarda localmente los entrenamientos. Al recuperar la red sincroniza automáticamente, y en caso de conflicto prevalece el dato más reciente. |
| **APP-RNF-10** | Mantenibilidad | El código usa arquitectura por capas (MVVM), sigue las convenciones de Kotlin y cuenta con pruebas unitarias de ViewModels y repositorios. |

---

## Estado de Avance

> Última actualización: 2026-11-03

| Módulo (CRM) | Requerimientos | Backend | Frontend | Notas |
| :--- | :--- | :---: | :---: | :--- |
| **Socios y Membresías** | CRM-RF-01 a CRM-RF-05 | ✅ | ✅ | API documentada en el [README del backend](./backend/README.md#módulo-socios-y-membresías-api). Fotos subidas desde el expediente y fin anticipado de congelamientos. |
| Infraestructura común | CRM-RNF-01 a 04, 07, 10 | ✅ | ✅ | Cifrado AES-256-GCM con script de rotación, índices ciegos, guards JWT/roles/sede, bitácora, validación global, OpenAPI en `/docs`, respaldos con retención de 7 días. |
| **Rutinas y Entrenamiento** | CRM-RF-06 a CRM-RF-10 | ✅ | ✅ | Subida de imagen o video por ejercicio. El socio recibe un push cuando cambia su rutina. |
| **Asistencia** | CRM-RF-11 | ✅ | ✅ | Recepción por búsqueda, lector USB o cámara (QR `GYMHUB:<folio>`). Avisa si la membresía no está vigente y evita registros dobles en 60 min. |
| **Retención y Comunicación** | CRM-RF-12 a 15 | ✅ | ✅ | Segmentos con vista previa y CSV, detección automática de riesgo cada 6 h con recordatorios, campañas push inmediatas o programadas, línea de tiempo con notas y llamadas. |
| **Analítica y Reportes** | CRM-RF-16, 17 | ✅ | ✅ | Panel con indicadores y comparativo por sede; reportes de horas pico, adherencia, retención, renovaciones e ingresos. Exportación a Excel (CSV) y PDF (impresión). |
| **Usuarios, Sedes y Seguridad** | CRM-RF-18 a 20, CRM-RNF-02 | ✅ | ✅ | CRUD de usuarios con sesiones revocables (`sesion_usuario`), sedes con horario, consulta de bitácora y solicitudes ARCO con exportación de datos. |

| App móvil | Requerimientos | API (`/app`) | Android | Notas |
| :--- | :--- | :---: | :---: | :--- |
| Acceso y perfil | APP-RF-01 a 03 | ✅ | ✅ | Activación con folio + correo, login con bloqueo, refresh token rotativo, recuperación de contraseña, edición de contacto. |
| Membresía | APP-RF-04, 05 | ✅ | ✅ | Historial de pagos y credencial con QR (`GYMHUB:<folio>`), disponible sin conexión. |
| Rutinas y entrenamiento | APP-RF-06 a 08 | ✅ | ✅ | Rutina offline, registro de series/cargas con temporizador de descanso, cola offline sin duplicados (`uuid_cliente`). |
| Salud y actividad | APP-RF-09 a 12 | ✅ | ✅ | Ficha de salud con borrador, consentimientos revocables, Health Connect (pasos, FC, calorías) con deduplicación. |
| Notificaciones | APP-RF-13, 14 | ✅ | ✅ | Envío con Firebase Admin y cola BullMQ (o sondeo de la tabla si no hay Redis). La app confirma la entrega y respeta las categorías desactivadas. |
| Progreso | APP-RF-15 | ✅ | ✅ | Adherencia semanal/mensual, calorías, FC por sesión y rachas. |

En total: 124 pruebas unitarias en el backend (Vitest) y 20 en Android (JUnit + MockWebServer). La API de la app tiene además un recorrido de 42 casos contra SQL Server y MongoDB en Docker. El CRM web usa la misma estética que la app (tema oscuro, morado `#8A2BE2` con degradado, tarjetas de 20 px).

### Módulo Socios y Membresías: decisiones tomadas
* **Motor relacional:** SQL Server 2022 en Docker, con el script oficial `backend/database/sqlserver/gimnasio_crm.sql` (collation `Modern_Spanish_CI_AI`).
* **Esquema:** el script SQL es la fuente de verdad. Prisma solo genera el cliente tipado; no se usa `db push`.
* **Vigencias:** `fecha_vencimiento` es el último día válido. Las renovaciones con vigencia se acumulan al vencimiento actual. Los estados `por_vencer`, `vencida` y `congelada` se calculan al consultar; en la BD solo se guardan `activa` y `cancelada`. La vista `v_membresia_actual` (script `002`) usa la misma lógica.
* **Pago y membresía:** se registran juntos en una sola transacción `SERIALIZABLE`. Cancelar el pago con motivo es exclusivo del administrador (`autorizado_por`) y cancela la membresía si se queda sin pagos válidos.
* **Folios:** socio `GH000123`; pago `P20261102-000045`. El comprobante es HTML imprimible.
* **Privacidad:** el alta exige aceptar el aviso de privacidad vigente. La primera ficha de salud exige el consentimiento de datos de salud. La bitácora nunca guarda datos sensibles en claro.
* **Ficha de salud:** se guarda en SQL Server (tabla `ficha_salud`), no en MongoDB, según el esquema oficial.
* **App móvil:** el socio activa su cuenta con el folio `GH000123` y el correo registrado en recepción (tabla `cuenta_app`). Desde la app solo puede cambiar teléfono, correo, foto y contacto de emergencia; la sede, el nombre y la membresía los cambia el personal.

### Módulo Rutinas y Entrenamiento: decisiones tomadas
* **Dónde vive cada dato:** el catálogo, las plantillas y el contenido de cada versión están en MongoDB. La asignación (`rutina_asignada`), las versiones (`rutina_version`, con autor, fecha y motivo) y las sesiones están en SQL Server.
* **Versiones inmutables (CRM-RF-09):** cada ajuste crea un documento nuevo en `contenidos_rutina`. Editar o renombrar un ejercicio actualiza las plantillas, pero no las versiones ya asignadas.
* **Restricciones de salud (CRM-RF-08):** la ficha de salud guarda etiquetas no sensibles (`sin_impacto`, `sin_saltos`, `evitar_rodilla`, `evitar_hombro`, `evitar_lumbar`, `sin_carga_axial`). Los ejercicios tienen `contraindicaciones` con las mismas etiquetas. Si una rutina choca con la ficha, la API responde 409 con la lista de ejercicios, salvo que el entrenador confirme que la revisó.
* **Una rutina vigente por socio:** asignar otra deja la anterior como `reemplazada` y la conserva en el historial.
* **Adherencia (CRM-RF-10):** sesiones completadas ÷ sesiones planeadas en el periodo. Las planeadas se calculan como `sesiones_planeadas_semana × días que estuvo vigente cada rutina ÷ 7`.
* **Permisos:** catálogo, plantillas y rutinas son solo para el entrenador (y el administrador). Recepción no tiene acceso.

### App móvil: decisiones tomadas
* **Tokens separados del CRM:** el socio recibe un access token de 15 minutos (`tipo: 'socio'`) y un refresh token de 30 días que rota en cada uso; se guarda solo su hash (`sesion_app`). Reusar un refresh ya rotado revoca todas las sesiones del socio. Un token del socio no abre rutas del CRM y uno del personal no abre rutas `/app`.
* **Arquitectura Android:** MVVM con Compose, `ViewModel` + `StateFlow`, un `Repositorio` único y un contenedor de dependencias manual (sin Hilt, para no agregar procesadores de anotaciones). Retrofit + kotlinx.serialization; OkHttp renueva el token al recibir 401.
* **Offline:** la caché (perfil, membresía, credencial, rutina y progreso) y la cola de sesiones se guardan como JSON en `EncryptedSharedPreferences` (llave en Android Keystore). Se eligió en lugar de Room porque los volúmenes son pequeños y así todo queda cifrado. WorkManager sube la cola y los datos de Health Connect cada hora o en cuanto vuelve la red.
* **Sesiones sin duplicados:** cada sesión lleva un `uuid_cliente`; reenviarla devuelve la ya guardada. Una sesión cuenta como *completada* si se hizo al menos la mitad de las series.
* **Privacidad:** `FLAG_SECURE` en ficha de salud y Health Connect, sin respaldos de Android, sin registrar cuerpos HTTP, y la caché se borra al cerrar sesión o al entrar otro socio en el mismo teléfono.

### Asistencia, retención y analítica: decisiones tomadas
* **Asistencia:** se registra aunque la membresía esté vencida (el CRM no controla torniquetes); recepción ve el aviso y un botón para renovar. Una segunda entrada del mismo socio en la misma sede dentro de 60 minutos no se duplica.
* **Riesgo de deserción:** solo se evalúa a socios con membresía vigente o por vencer. Motivos: días sin asistir (por defecto 10) y membresía por vencer sin renovación (por defecto 7 días). La regla es global o por sede (`config_riesgo`). El proceso corre al arrancar y cada 6 horas, abre casos nuevos, cierra solos los que ya no aplican y envía un recordatorio push al detectar el caso.
* **Notificaciones:** la tabla `notificacion` es la fuente de verdad. Con `REDIS_URL` se usa una cola BullMQ con reintentos exponenciales; sin Redis, el backend revisa la tabla cada 15 s. Sin credenciales de Firebase la notificación queda solo en la bandeja de la app. Solo se envía a socios con la app activada, consentimiento de notificaciones vigente y la categoría habilitada.
* **Segmentos:** los filtros se guardan como JSON y se recalculan en cada uso (una campaña programada usa los socios que cumplan al momento de enviarse). El CSV no incluye datos de contacto.
* **Reportes:** la retención es el porcentaje de membresías que vencieron en el mes y tuvieron una siguiente (encadenada o iniciada a ±30 días). Excel se entrega como CSV con BOM UTF-8; el PDF se obtiene con la impresión del navegador (la hoja de impresión oculta el menú).
* **Sesiones del personal:** cada JWT lleva un `jti` registrado en `sesion_usuario`. Cerrar sesión, desactivar al usuario o cambiar su rol, sedes o contraseña revoca sus sesiones al momento.
* **Archivos:** fotos (JPG/PNG/WebP, 5 MB) y videos de ejercicios (MP4/WebM, 40 MB) se guardan en `backend/uploads/` con nombre aleatorio y se valida la firma real del archivo. Se sirven en `/uploads` sin token, así que su URL solo debe compartirse dentro del sistema.

### Pendientes
* Convertir los recorridos manuales en pruebas e2e con Supertest y llevar la cobertura total de `src/` al 80%.
* Probar las pantallas nuevas en el navegador con usuarios reales de cada rol y en una tableta.
* Configurar en el equipo de producción: `google-services.json` y la cuenta de servicio de Firebase, un servidor SMTP, Redis y la tarea diaria de respaldo.
* Pruebas de interfaz de la app en un emulador.

---

## Lista de Requerimientos y Correcciones por Realizar

A partir del análisis exhaustivo del estado actual del repositorio frente a la nueva especificación de requerimientos, se identifican las siguientes acciones correctivas y desarrollos técnicos obligatorios:

### 1. Correcciones en Modelado y Persistencia de Datos

| Componente | Requerimiento Afectado | Diagnóstico Actual | Corrección / Tarea a Realizar |
| :--- | :--- | :--- | :--- |
| **Motor relacional** | `CRM-RNF-07`, `CRM-RNF-10` | Se probó MySQL 8, pero el equipo trabaja con SQL Server en Docker. | ✅ **Resuelto (2026-11-03):** SQL Server 2022 en Docker con `backend/database/sqlserver/gimnasio_crm.sql`, Prisma 7 + `@prisma/adapter-mssql` y operaciones críticas en `$transaction` `SERIALIZABLE`. |
| **Modelo Relacional de Membresías y Socios** | `CRM-RF-01` al `CRM-RF-04`, `CRM-RF-18`, `CRM-RF-19` | En Prisma solo existe un modelo `User` genérico. | ✅ **Hecho:** el modelo completo está en `backend/database/sqlserver/gimnasio_crm.sql`. Prisma ya incluye `sede`, `rol`, `usuario`, `usuario_sede`, `socio`, `aviso_privacidad`, `consentimiento`, `ficha_salud`, `plan_membresia`, `membresia`, `congelamiento_membresia`, `pago`, `config_riesgo`, `interaccion_socio`, `bitacora_auditoria`, `rutina_asignada`, `rutina_version` y `sesion_entrenamiento`. ✅ También `asistencia`, `segmento`, `riesgo_desercion`, `accion_riesgo`, `campana`, `notificacion`, `sede_horario`, `sesion_usuario` y `solicitud_arco`. |
| **Modelo Documental de Rutinas** | `CRM-RF-06` al `CRM-RF-10`, `CRM-RNF-06` | Solo existía un modelo `Log` de prueba. | ✅ **Hecho:** `backend/database/mongodb/gymhub_rutinas.js` crea `ejercicios`, `plantillas_rutina` y `contenidos_rutina` con validadores e índices. La ficha de salud y la bitácora se quedan en SQL Server, según el esquema oficial. |
| **Desacoplamiento de POS Retail** | `CRM-RF-04` | Existían restos conceptuales de cobro con WebUSB, catálogo de productos, inventario de suplementos y arqueos de caja. | Eliminar modelos de productos y stock comercial. Ajustar la capa financiera exclusivamente al registro presencial de pagos de membresías con comprobante foliado y motivo de cancelación auditada. |

---

### 2. Correcciones y Tareas en Backend API (NestJS 12)

| Módulo | Requerimiento Afectado | Diagnóstico Actual | Corrección / Tarea a Realizar |
| :--- | :--- | :--- | :--- |
| **Criptografía y Privacidad** | `CRM-RNF-01`, `CRM-RF-01`, `CRM-RF-05` | No existe servicio de cifrado implementado en el backend. | ✅ **Hecho:** `src/common/crypto/encryption.service.ts` (AES-256-GCM, id de clave para rotación e índices ciegos HMAC-SHA256 con pepper). |
| **Autenticación y RBAC** | `CRM-RF-18`, `CRM-RNF-03`, `CRM-RNF-04` | No hay autenticación con JWT ni protección de rutas por roles. | ✅ **Hecho:** ya existen los guards globales `JwtAuthGuard` y `RolesGuard`, `@Roles('recepcionista', ...)`, `@Public()` y la restricción por sede. ✅ Login (`POST /auth/login`) con bcrypt y bloqueo por intentos fallidos; el CRM cierra sesión por inactividad. ✅ Sesiones revocables en `sesion_usuario` y `POST /auth/logout`. |
| **Gestión de Membresías y Pagos** | `CRM-RF-01` al `CRM-RF-04` | No existen controladores ni lógica de negocio. | ✅ **Hecho:** módulos `socios`, `planes`, `membresias`, `pagos` y `ficha-salud`. El comprobante foliado se genera en HTML imprimible (se puede guardar como PDF desde el navegador). |
| **Motor de Asistencia** | `CRM-RF-11` | Sin endpoint de check-in. | ✅ **Hecho:** módulo `asistencia` (búsqueda por nombre, teléfono, folio o QR; aviso de vigencia; historial por socio y por día). |
| **Rutinas y Adherencia** | `CRM-RF-06` al `CRM-RF-10` | Sin lógica de prescripción. | ✅ **Hecho:** módulo `rutinas` (ejercicios, plantillas, sugerencias por objetivo y ficha de salud, asignación, versiones inmutables y seguimiento con adherencia). Falta el endpoint con el que la app registrará las sesiones (`APP-RF-07`). |
| **Retención y Tareas Programadas** | `CRM-RF-12`, `CRM-RF-13`, `CRM-RF-14` | Sin worker ni cron jobs. | ✅ **Hecho:** módulos `retencion` y `notificaciones`: segmentos, evaluación de riesgo cada 6 h, campañas programadas (revisión cada minuto) y envío con Firebase Admin por BullMQ/Redis o sondeo de la tabla. |
| **Línea de Tiempo y Auditoría** | `CRM-RF-15`, `CRM-RF-20` | Solo log básico sin trazabilidad. | ✅ **Hecho:** `AuditService` ya registra cada operación (bitácora de solo inserción protegida con trigger) e `interaccion_socio` (renovaciones, pagos, cambios de rutina). ✅ Consulta de la bitácora (`/bitacora`) y línea de tiempo con notas y llamadas en el expediente. |
| **Analítica y Exportación** | `CRM-RF-16`, `CRM-RF-17`, `CRM-RNF-05` | Sin módulo de analítica. | ✅ **Hecho:** `/analitica/panel` y `/analitica/reportes` (periodo máximo de 12 meses); la exportación a Excel y PDF se hace en el CRM. |

---

### 3. Correcciones y Tareas en Frontend Web (React 19 + Vite)

| Vista / Funcionalidad | Requerimiento Afectado | Diagnóstico Actual | Corrección / Tarea a Realizar |
| :--- | :--- | :--- | :--- |
| **Estructura Base del CRM** | `CRM-RNF-08`, `CRM-RNF-11` | El proyecto contenía la plantilla por defecto de Vite. | ✅ **Hecho:** React Router 7, layout responsivo con sidebar (barra superior en tablet), contexto de autenticación con menú por rol y cierre por inactividad. |
| **Flujos de Recepción Ágiles** | `CRM-RF-01`, `CRM-RF-04`, `CRM-RF-11`, `CRM-RNF-08` | Inexistentes. | ✅ **Hecho:** ✅ alta de socio en 5 pasos con aviso de privacidad (`CRM-RNF-02`) y cobro con impresión del comprobante. ✅ Terminal de asistencia con QR por cámara o lector USB (`/asistencia`). |
| **Editor de Rutinas por Bloques** | `CRM-RF-06` al `CRM-RF-10` | Inexistente. | ✅ **Hecho:** páginas de Ejercicios y Plantillas, editor de bloques reutilizable (selección y reordenamiento), pestaña Rutina con asistente de asignación, comparación de versiones y seguimiento. |
| **Tablero de Retención y Segmentación** | `CRM-RF-12`, `CRM-RF-13`, `CRM-RF-14` | Inexistente. | ✅ **Hecho:** `/riesgo`, `/segmentos` (vista previa en vivo y CSV) y `/campanas` (vista previa del push y estado de cada envío). |
| **Dashboard y Reportes** | `CRM-RF-16`, `CRM-RF-17` | Inexistente. | ✅ **Hecho:** `/panel` y `/reportes` con mapa de calor de horas pico, gráficas, selector de sede y periodo, y descarga en Excel (CSV) y PDF. |

---

### 4. Correcciones y Tareas en App Móvil Android (Kotlin)

| Componente Móvil | Requerimiento | Estado |
| :--- | :--- | :--- |
| Compatibilidad SDK | `APP-RNF-04` | ✅ `minSdk = 26`. |
| Arquitectura MVVM y pruebas | `APP-RNF-10` | ✅ ViewModels + repositorio; 20 pruebas unitarias (JUnit, coroutines-test, MockWebServer). |
| Seguridad local y de pantalla | `APP-RNF-01` a `03` | ✅ `EncryptedSharedPreferences`, `FLAG_SECURE` en salud, solo HTTPS en release. |
| Google Health Connect | `APP-RF-11`, `APP-RF-12` | ✅ Permisos de lectura revocables, consentimiento en GymHub y sincronización con WorkManager. |
| Credencial digital con QR | `APP-RF-05` | ✅ ZXing (`com.google.zxing:core`). |
| Registro de sesión y modo offline | `APP-RF-06`, `07`, `APP-RNF-09` | ✅ Caché y cola cifradas (ver decisiones); idempotencia por `uuid_cliente`. |
| Firebase Cloud Messaging | `APP-RF-13`, `14` | ✅ Servicio, canales por categoría, bandeja, preferencias y acuse de entrega. Solo falta poner el `google-services.json` del proyecto de Firebase. |

---

## Marco de Trabajo Ágil y Metodología

El desarrollo de GymHub sigue el marco **Scrum** complementado con **Extreme Programming (XP)** y **Kanban**.

* **Sprints:** 6 Sprints de 2 semanas de duración cada uno.
* **Criterios de Calidad (DoD - Definition of Done):**
  * Cobertura de pruebas unitarias superior al 80%.
  * Revisión de código por pares (Code Review) aprobada mediante Pull Request.
  * Análisis de código sin alertas críticas ni errores de lint.
  * Despliegue correcto en el entorno de Staging.

---

## Equipo de Desarrollo (DevByte)

| Nombre | Rol Principal |
| :--- | :--- |
| **Alan Josué Flores Arteaga** | Líder de Proyecto / Desarrollador Backend |
| **Noe Villanueva Mena** | Desarrollador Backend |
| **Flor Rocío Nava Carrillo** | QA Tester / Desarrolladora Frontend |
| **Emiliano Mendoza Maldonado** | Especialista en Bases de Datos |
| **Jose Isaac Velazquez Martinez** | Diseñador & Desarrollador Frontend |
| **Giovanni Paolo Rivas Camacho** | QA Tester / Desarrollador Backend |

---
