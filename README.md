# GymHub

> **Plataforma ERP integral con Punto de Venta (POS) y CRM para la gestión inteligente y retención de usuarios en gimnasios.**

---

## Tabla de Contenidos

- [Acerca del Proyecto](#-acerca-del-proyecto)
- [Características Principales](#-características-principales)
- [Arquitectura y Tecnologías](#-arquitectura-y-tecnologías)
- [Estructura del Proyecto y Flujo de Ramas](#-estructura-del-proyecto-y-flujo-de-ramas)
- [Configuración del Entorno de Desarrollo](#-configuración-del-entorno-de-desarrollo)
- [Marco de Trabajo Ágil y Metodología](#-marco-de-trabajo-ágil-y-metodología)
- [Equipo de Desarrollo (DevByte)](#-equipo-de-desarrollo-devbyte)

---

## Acerca del Proyecto

**GymHub** es una solución tecnológica centralizada orientada a resolver la fragmentación operativa en gimnasios e instalaciones deportivas. Integra un módulo comercial ERP/POS para la venta directa en mostrador con un motor CRM y de personalización de rutinas que incrementa la adherencia y retención de los socios.

### Objetivos Principales
* **Automatización Comercial:** Control y gestión instantánea de ventas en recepción (suplementos, insumos, ropa) con actualización de stock en tiempo real.
* **Fidelización y CRM:** Gestión técnica de socios con perfiles de salud y un motor evolutivo de rutinas de entrenamiento.
* **Estrategia Preventiva:** Notificaciones Push automáticas para alertar sobre vencimientos de membresía e inactividad.

---

## Características Principales

* **Hub Punto de Venta (POS) & ERP:**
  * Cobro presencial (Efectivo/Tarjeta).
  * Control de stock e inventario por lotes (MySQL).
  * Gestión de turnos y arqueos de caja.
  * Compatibilidad con escáneres y periféricos vía API WebUSB.
* **Motor Dinámico de Rutinas:**
  * Generación y ajuste de entrenamiento estructurado por bloques, series y repeticiones.
  * Almacenamiento no estructurado y flexible (MongoDB).
* **Gestión de Miembros:**
  * Alta de socios, cuestionarios médicos y seguimiento de perfil.
  * Cifrado de datos personales y médicos bajo estándar **AES-256**.
* **Aplicación Móvil & Health Connect:**
  * Sincronización de gasto calórico y frecuencia cardíaca con **Google Health Connect**.
  * Recepción de notificaciones Push preventivas mediante **Firebase Cloud Messaging (FCM)**.
* **Dashboard & Analítica:**
  * Gráficos interactivos de retención, horas pico y adherencia creados con **Chart.js / Recharts**.

---

## Arquitectura y Tecnologías

El proyecto implementa un enfoque de **arquitectura dual de bases de datos** y backend desacoplado en TypeScript.

```
                  +-----------------------------------+
                  |         Clientes / Apps           |
                  |  [React Web Admin]  [Android App] |
                  +-----------------+-----------------+
                                    | REST API
                                    v
                  +-----------------------------------+
                  |          NestJS Backend           |
                  +--------+-----------------+--------+
                           |                 |
             (Transaccional)                 (Documental / Rutinas)
                           v                 v
                    +--------------+  +--------------+
                    | MySQL (Rel)  |  | MongoDB NoSQL|
                    +--------------+  +--------------+
                           |
                     (Task Queues)
                           v
                    +--------------+
                    |     FCM      |
                    +--------------+
```

### Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Frontend Web** | React.js, TypeScript, Tailwind CSS, Shadcn UI | Interfaz reactiva para Administración y POS Hub |
| **App Móvil** | Android Native (Kotlin) | Aplicación nativa con Health Connect SDK |
| **Backend** | Node.js, NestJS, Prisma | REST APIs modulares |
| **Base de Datos Relacional** | MySQL | Gestión de socios, POS, inventarios y cierres de caja |
| **Base de Datos Documental** | MongoDB | Estructuración de rutinas y bloques dinámicos |
| **Caché y Tareas** | BullMQ | Procesamiento en segundo plano y colas de notificación |
| **Notificaciones Push** | Firebase Cloud Messaging (FCM) | Envíos directos a dispositivos móviles |
| **Pruebas y Calidad** | Jest, ESLint, SonarQube | CI, cobertura unitaria (>80%) y análisis de código |

---

## Estructura del Proyecto y Flujo de Ramas

Se utiliza una estrategia de ramificación basada en **GitFlow simplificado**:

```
main  -------------------------------------[Release Tag v1.0]--->
        \                                     /
develop  *-------*-------------------*-------*------------------->
                  \                 /
feature            *--[feature/...]--*
```

* `main`: Entorno de producción. Solo se realizan merge mediante tags versionados.
* `develop`: Rama principal de integración para características probadas.
* `feature/RF-XX-descripcion`: Ramas cortas para el desarrollo de nuevas características.
* `fix/bug-descripcion`: Ramas destinadas a correcciones de errores.

### Convención de Commits
Se aplican commits atómicos haciendo referencia al ID del requerimiento:
```bash
git commit -m "01/09/2026. feat(pos): se agrega soporte para lectura de escáner USB en cobro rápido"
git commit -m "01/09/2026. fix(auth): corrección en validación de token JWT al renovar membresía"
```

---

## Configuración del Entorno de Desarrollo

### Requisitos Previos
* **Node.js**: `v18.x` o superior
* **Docker** & **Docker Compose**(En revisión)
* **JDK & Android Studio**: Para desarrollo en Android Nativo (Kotlin)

### Pasos de Instalación Local

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/gymhub.git
   cd gymhub
   ```

2. **Configurar variables de entorno:**
   Copia el archivo de ejemplo y configura las credenciales necesarias.
   ```bash
   cp .env.example .env
   ```

3. **Levantar servicios de Base de Datos y Caché (Docker):**(En revisión)
   ```bash
   docker-compose up -d mysql mongodb redis
   ```

4. **Instalar dependencias e iniciar el Backend (NestJS):**
   ```bash
   cd backend
   npm install
   npm run start:dev
   ```

5. **Instalar dependencias e iniciar el Frontend (React):**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

---

## Marco de Trabajo Ágil y Metodología

El desarrollo de GymHub sigue el marco **Scrum** complementado con **Extreme Programming (XP)** y **Kanban**.

* **Sprints:** 6 Sprints de 2 semanas de duración.
* **Criterios de Calidad (DoD - Definition of Done):**
  * Cobertura de pruebas unitarias superior al 80%.
  * Revisión de código por pares (Code Review) aprobada.
  * Análisis de código en SonarQube sin alertas de severidad crítica.
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