# GymHub Backend

> **API REST modular construida con NestJS 12 y TypeScript para la plataforma GymHub (ERP/POS y CRM).**

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Arquitectura de Persistencia Dual](#arquitectura-de-persistencia-dual)
- [Requisitos Previos](#requisitos-previos)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación y Configuración](#instalación-y-configuración)
- [Comandos Disponibles](#comandos-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Pruebas y Calidad](#pruebas-y-calidad)

---

## Descripción General

El backend de **GymHub** está desarrollado sobre el framework **NestJS 12** con soporte para módulos ECMAScript nativos (`"type": "module"`). Expone servicios RESTful para el Punto de Venta (POS), control de membresías, administración de inventario y personalización de rutinas de entrenamiento.

### Características Principales
* **CORS Habilitado:** Configurado en `src/main.ts` para aceptar peticiones provenientes del cliente frontend SPA (Vite / React).
* **Persistencia Dual con Prisma:** Separación de dominios entre almacenamiento relacional y documental.
* **Herramientas Modernas:** Pruebas unitarias y E2E mediante **Vitest** y análisis estático ultra rápido con **Oxlint**.

---

## Arquitectura de Persistencia Dual

Para optimizar el rendimiento y el modelado de datos, el backend utiliza dos conexiones independientes gestionadas con **Prisma ORM**:

1. **Azure SQL Server (`prisma/sqlserver/schema.prisma`):**
   * **Propósito:** Almacén transaccional con integridad relacional estricta.
   * **Entidades:** Usuarios, membresías, roles, arqueos de caja, inventario y ventas POS.
   * **Cliente generado:** `@prisma/sqlserver-client`.
   * **Variable de conexión:** `AZURE_SQLSERVER_URL`.

2. **MongoDB (`prisma/mongodb/schema.prisma`):**
   * **Propósito:** Almacén documental flexible y dinámico.
   * **Entidades:** Catálogo de ejercicios, bloques de rutinas personalizadas y bitácoras/logs de auditoría.
   * **Cliente generado:** `@prisma/mongodb-client`.
   * **Variable de conexión:** `MONGODB_URL`.

---

## Requisitos Previos

* **Node.js**: Versión LTS recomendada (`>= 20.x`, compatible con `22.x` y `24.x`).
* **npm**: `v10.x` o superior.
* Acceso a una instancia de **Azure SQL Server** (o SQL Server local/Docker).
* Acceso a un cluster de **MongoDB** (Atlas o local/Docker).

---

## Variables de Entorno

Copia el archivo de ejemplo y define los valores correspondientes:

```bash
cp .env.example .env
```

Contenido de `.env`:

```env
# Puerto del servidor backend
PORT=3000

# Cadena de conexión para Azure SQL Server
AZURE_SQLSERVER_URL="sqlserver://tu-servidor.database.windows.net:1433;database=tu_base;user=tu_usuario;password=tu_contraseña;encrypt=true"

# Cadena de conexión para MongoDB
MONGODB_URL="mongodb+srv://usuario:password@cluster.mongodb.net/tu_base_mongo?retryWrites=true&w=majority"
```

---

## Instalación y Configuración

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Generar clientes de Prisma:**
   Genera los clientes tipados para SQL Server y MongoDB:
   ```bash
   npm run prisma:generate
   ```

3. **Sincronizar esquemas (opcional para desarrollo):**
   ```bash
   npm run db:push:sql     # Aplica cambios en SQL Server
   npm run db:push:mongo   # Aplica cambios en MongoDB
   ```

4. **Iniciar en modo desarrollo (Watch Mode):**
   ```bash
   npm run start:dev
   ```
   El servidor estará disponible en `http://localhost:3000`.

---

## Comandos Disponibles

| Script | Descripción |
| :--- | :--- |
| `npm run start:dev` | Inicia el backend en modo desarrollo con recarga en caliente (watch). |
| `npm run start` | Inicia el backend sin modo watch. |
| `npm run start:prod` | Ejecuta la versión compilada de producción (`dist/main.js`). |
| `npm run build` | Compila el proyecto con el compilador de NestJS (`dist/`). |
| `npm run prisma:generate` | Genera los clientes de Prisma para ambos esquemas. |
| `npm run db:push:sql` | Sincroniza el esquema relacional con Azure SQL Server. |
| `npm run db:push:mongo` | Sincroniza el esquema documental con MongoDB. |
| `npm run test` | Ejecuta las pruebas unitarias con Vitest. |
| `npm run test:watch` | Ejecuta pruebas unitarias en modo interactivo. |
| `npm run test:cov` | Genera reporte de cobertura de código. |
| `npm run test:e2e` | Ejecuta pruebas End-to-End con Vitest y Supertest. |
| `npm run lint` | Ejecuta el linter Oxlint sobre `src/` y `test/`. |
| `npm run format` | Da formato al código fuente usando Prettier. |

---

## Estructura del Proyecto

```text
backend/
├── .env.example          # Plantilla de variables de entorno
├── .gitignore            # Reglas de exclusión de Git
├── .prettierrc           # Configuración de Prettier
├── nest-cli.json         # Configuración del CLI de NestJS
├── oxlint.json           # Configuración de Oxlint
├── package.json          # Dependencias y scripts npm
├── tsconfig.json         # Configuración TypeScript base
├── tsconfig.build.json   # Configuración TypeScript para compilación
├── vitest.config.ts      # Configuración de Vitest para pruebas unitarias
├── vitest.config.e2e.ts  # Configuración de Vitest para pruebas E2E
├── prisma/
│   ├── sqlserver/
│   │   └── schema.prisma # Esquema Prisma para Azure SQL Server
│   └── mongodb/
│       └── schema.prisma # Esquema Prisma para MongoDB
├── src/
│   ├── app.controller.ts # Controlador base
│   ├── app.controller.spec.ts # Pruebas del controlador
│   ├── app.module.ts     # Módulo raíz de la aplicación
│   ├── app.service.ts    # Servicio base
│   └── main.ts           # Punto de entrada (NestFactory, CORS, puerto)
└── test/
    └── app.e2e-spec.ts   # Pruebas End-to-End de la API
```

---

## Pruebas y Calidad

El proyecto utiliza **Vitest** en lugar de Jest para una ejecución más veloz y compatibilidad nativa con ESM:

```bash
# Pruebas unitarias
npm test

# Pruebas End-to-End
npm run test:e2e

# Análisis estático
npm run lint
```
