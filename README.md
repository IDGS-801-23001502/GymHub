# GymHub

> **Plataforma ERP integral con Punto de Venta (POS) y CRM para la gestión inteligente y retención de usuarios en gimnasios.**

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
  - [Instalación y Ejecución del Backend](#instalación-y-ejecución-del-backend-nestjs)
  - [Instalación y Ejecución del Frontend](#instalación-y-ejecución-del-frontend-react--vite)
- [Bases de Datos y Persistencia](#bases-de-datos-y-persistencia-dual)
- [Marco de Trabajo Ágil y Metodología](#marco-de-trabajo-ágil-y-metodología)
- [Equipo de Desarrollo (DevByte)](#equipo-de-desarrollo-devbyte)

---

## Acerca del Proyecto

**GymHub** es una solución tecnológica centralizada orientada a resolver la fragmentación operativa en gimnasios e instalaciones deportivas. Integra un módulo comercial ERP/POS para la venta directa en mostrador con un motor CRM y de personalización de rutinas que incrementa la adherencia y retención de los socios.

### Objetivos Principales
* **Automatización Comercial:** Control y gestión instantánea de ventas en recepción (suplementos, membresías, insumos) con actualización de stock en tiempo real.
* **Fidelización y CRM:** Gestión técnica de socios con perfiles de salud, historial de visitas y un motor evolutivo de rutinas de entrenamiento.
* **Estrategia Preventiva:** Notificaciones Push automáticas para alertar sobre vencimientos de membresía, inactividad o métricas de progreso.

---

## Características Principales

* **Hub Punto de Venta (POS) & ERP:**
  * Cobro presencial (Efectivo/Tarjeta).
  * Control de stock e inventario transaccional.
  * Gestión de turnos y arqueos de caja.
  * Compatibilidad con escáneres y periféricos vía API WebUSB.
* **Motor Dinámico de Rutinas:**
  * Generación y ajuste de entrenamiento estructurado por bloques, series y repeticiones.
  * Almacenamiento flexible en documentos para adaptarse a rutinas cambiantes.
* **Gestión de Miembros:**
  * Alta de socios, cuestionarios médicos y seguimiento de perfil.
  * Cifrado de datos personales y sensibles bajo estándar **AES-256**.
* **Aplicación Móvil & Health Connect (Planificado):**
  * Sincronización de gasto calórico y frecuencia cardíaca con **Google Health Connect**.
  * Recepción de notificaciones Push preventivas mediante **Firebase Cloud Messaging (FCM)**.
* **Dashboard & Analítica:**
  * Gráficos interactivos de retención, horas pico y adherencia.

---

## Arquitectura y Tecnologías

El proyecto implementa un enfoque de **monorepo** desacoplado con arquitectura dual de bases de datos para separar la carga transaccional del contenido dinámico no estructurado.

```
                  +-----------------------------------+
                  |         Clientes / Apps           |
                  |  [React Web Admin]  [Android App] |
                  +-----------------+-----------------+
                                    | REST API (HTTP/JSON + CORS)
                                    v
                  +-----------------------------------+
                  |          NestJS Backend           |
                  +--------+-----------------+--------+
                           |                 |
            (Transaccional / Prisma)         (Documental / Prisma)
                           v                 v
                    +--------------+  +--------------+
                    | Azure SQL    |  | MongoDB      |
                    | Server (Rel) |  | NoSQL        |
                    +--------------+  +--------------+
                           |
                     (Task Queues)
                           v
                    +--------------+
                    | Redis/BullMQ |
                    +--------------+
```

### Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Frontend Web** | React 19, TypeScript, Vite 8, ESLint | Interfaz reactiva para Administración y POS Hub |
| **Backend API** | Node.js (v20+ / v24+), NestJS 12, TypeScript | REST API modular, inyección de dependencias y CORS configurado |
| **ORM & Modelado** | Prisma ORM (Multi-Schema) | Clientes tipados independientes para SQL Server y MongoDB |
| **Base de Datos Relacional** | Azure SQL Server | Gestión transaccional: usuarios, membresías, POS, inventarios y caja |
| **Base de Datos Documental** | MongoDB (Atlas / Local) | Estructuración de rutinas, bloques dinámicos y logs de auditoría |
| **App Móvil (Roadmap)** | Android Native (Kotlin) | Integración con Health Connect SDK y notificaciones |
| **Caché y Tareas (Roadmap)** | BullMQ / Redis | Procesamiento en segundo plano y colas de notificación |
| **Notificaciones (Roadmap)**| Firebase Cloud Messaging (FCM) | Envíos directos a dispositivos móviles |
| **Pruebas y Calidad** | Vitest, Supertest, Oxlint | Pruebas unitarias, pruebas E2E y análisis estático ultra rápido |

---

## Estructura del Proyecto

El repositorio está organizado como un **monorepo**:

```text
GymHub/
├── .env.example              # Plantilla de variables de entorno globales
├── .gitignore                # Reglas de exclusión de Git a nivel raíz
├── README.md                 # Documentación principal del proyecto
│
├── backend/                  # Proyecto API Backend (NestJS 12) -> Ver [backend/README.md](./backend/README.md)
│   ├── .env.example          # Plantilla de entorno para backend
│   ├── .gitignore            # Exclusiones de Git específicas del backend
│   ├── nest-cli.json         # Configuración del CLI de NestJS
│   ├── oxlint.json           # Configuración del linter Oxlint
│   ├── package.json          # Dependencias y scripts del backend
│   ├── tsconfig.json         # Configuración de TypeScript
│   ├── prisma/
│   │   ├── sqlserver/
│   │   │   └── schema.prisma # Esquema relacional (Azure SQL Server)
│   │   └── mongodb/
│   │       └── schema.prisma # Esquema documental (MongoDB)
│   ├── src/                  # Código fuente del backend (módulos, controladores, servicios)
│   └── test/                 # Pruebas End-to-End (E2E) con Vitest y Supertest
│
└── frontend/                 # Proyecto Web SPA (React 19 + Vite 8) -> Ver [frontend/README.md](./frontend/README.md)
    ├── .env.example          # Plantilla de entorno para frontend
    ├── .gitignore            # Exclusiones de Git específicas del frontend
    ├── eslint.config.js      # Configuración de ESLint (Flat Config)
    ├── index.html            # Punto de entrada HTML
    ├── package.json          # Dependencias y scripts del frontend
    ├── tsconfig.json         # Configuración de TypeScript
    ├── vite.config.ts        # Configuración de empaquetado Vite
    ├── public/               # Recursos estáticos públicos
    └── src/                  # Componentes, estilos y lógica de la aplicación
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
Se aplican commits atómicos haciendo referencia a fecha y módulo:
```bash
git commit -m "feat(pos): agregar soporte para lectura de escáner USB en cobro rápido"
git commit -m "fix(auth): corrección en validación de token JWT al renovar membresía"
```

---

## Configuración del Entorno de Desarrollo

### Requisitos Previos
* **Node.js**: Versión LTS recomendada (`v20.x` o superior, compatible con `v22.x` y `v24.x`).
* **npm**: `v10.x` o superior.
* **Instancias de Base de Datos**:
  * Azure SQL Server (o SQL Server local / contenedor Docker).
  * MongoDB (MongoDB Atlas o contenedor local).

### Variables de Entorno

Cada parte del proyecto cuenta con su archivo `.env.example` correspondiente:

1. **Backend (`backend/.env`):**
   ```env
   PORT=3000
   AZURE_SQLSERVER_URL="sqlserver://tu-servidor.database.windows.net:1433;database=tu_base;user=tu_usuario;password=tu_contraseña;encrypt=true"
   MONGODB_URL="mongodb+srv://usuario:password@cluster.mongodb.net/tu_base_mongo?retryWrites=true&w=majority"
   ```

2. **Frontend (`frontend/.env`):**
   ```env
   VITE_API_URL="http://localhost:3000"
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

3. Instala dependencias:
   ```bash
   npm install
   ```

4. Genera los clientes tipados de Prisma:
   ```bash
   npm run prisma:generate
   ```

5. (Opcional) Sincroniza los esquemas con tus bases de datos:
   ```bash
   npm run db:push:sql     # Sincroniza Azure SQL Server
   npm run db:push:mongo   # Sincroniza MongoDB
   ```

6. Inicia el servidor en modo desarrollo:
   ```bash
   npm run start:dev
   ```
   El backend estará disponible en `http://localhost:3000`.

7. **Pruebas y calidad de código:**
   ```bash
   npm run test        # Pruebas unitarias con Vitest
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
   El frontend estará disponible en `http://localhost:5173`.

5. **Compilación y calidad:**
   ```bash
   npm run build   # Verificación de tipos con tsc y build con Vite
   npm run lint    # Linter de React y TypeScript con ESLint
   npm run preview # Previsualización del build de producción
   ```

---

## Bases de Datos y Persistencia Dual

GymHub cuenta con dos esquemas Prisma independientes para garantizar la separación de responsabilidades:

1. **Azure SQL Server (`backend/prisma/sqlserver/schema.prisma`):**
   * Gestiona entidades de alta consistencia transaccional (Usuarios, Membresías, Cobros, Inventario).
   * Genera el cliente en `@prisma/sqlserver-client`.

2. **MongoDB (`backend/prisma/mongodb/schema.prisma`):**
   * Gestiona documentos con estructuras dinámicas y evolutivas (Catálogo de Ejercicios, Bloques de Rutinas personalizadas, Logs de Auditoría).
   * Genera el cliente en `@prisma/mongodb-client`.

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