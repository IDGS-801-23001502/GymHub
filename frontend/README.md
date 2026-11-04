# GymHub Frontend

> **Aplicación Web SPA para Administración y Operación CRM desarrollada con React 19, TypeScript y Vite 8.**

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Módulos Principales](#módulos-principales)
- [Stack Tecnológico](#stack-tecnológico)
- [Requisitos Previos](#requisitos-previos)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación y Ejecución](#instalación-y-ejecución)
- [Comandos Disponibles](#comandos-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Integración con el Backend](#integración-con-el-backend)

---

## Descripción General

El frontend de **GymHub** provee la interfaz gráfica web responsiva (optimizada para escritorio y tablet a partir de 768px, cumpliendo `CRM-RNF-08` y `CRM-RNF-11`) para el personal de recepción, entrenadores y administradores del gimnasio. Ofrece flujos de trabajo rápidos (completados en máximo 5 pasos) para la gestión del ciclo de vida de los socios, cobro presencial de planes, prescripción modular de rutinas, registro de visitas y analítica de retención.

---

## Módulos Principales

1. ✅ **Recepción y Membresías:** Alta y edición de socios con consentimiento del aviso de privacidad (`CRM-RNF-02`), asignación/renovación de planes, congelamientos y registro presencial de pagos con emisión de recibo foliado (`CRM-RF-01` a `CRM-RF-04`).
2. ✅ **Terminal de Asistencia:** Registro de entrada mediante búsqueda rápida por nombre/folio o lectura de código QR de la credencial digital con validación de vigencia (`CRM-RF-11`).
3. ✅ **Ficha Médica y Cuestionario de Salud:** Captura y consulta restringida a administradores y entrenadores de antecedentes médicos versionados con cifrado en tránsito y reposo (`CRM-RF-05`).
4. ✅ **Prescripción de Entrenamiento:** Catálogo de ejercicios, constructor de plantillas por bloques (calentamiento, fuerza, cardio, estiramiento), asignación guiada por objetivo y restricciones de salud, comparador de versiones y seguimiento con adherencia (`CRM-RF-06` a `CRM-RF-10`).
5. ✅ **Retención, Campañas y Línea de Tiempo:** Tablero de detección de socios en riesgo de deserción por inactividad, constructor de segmentos y programador de avisos push hacia la app móvil (`CRM-RF-12` a `CRM-RF-15`).
6. ✅ **Dashboard Directivo y Reportes:** Indicadores en tiempo real (socios activos, asistencia diaria, horas pico, renovaciones) exportables a PDF y Excel (`CRM-RF-16`, `CRM-RF-17`).
7. ✅ **Administración:** usuarios con sesiones revocables, sedes con horario, bitácora y solicitudes ARCO (`CRM-RF-18` a `CRM-RF-20`, `CRM-RNF-02`).

> ✅ = implementado (2026-11-03). Pantallas disponibles:
>
> | Ruta | Pantalla | Roles |
> | :--- | :--- | :--- |
> | `/login` | Inicio de sesión del personal | Público |
> | `/socios` | Búsqueda con filtros de estado y sede | Todos |
> | `/socios/nuevo` | Alta en 5 pasos con aviso de privacidad | Recepción, admin |
> | `/panel` | Indicadores del periodo y comparativo por sede | Admin |
> | `/asistencia` | Registro de entradas por búsqueda, lector USB o cámara | Recepción, admin |
> | `/socios/:id` | Expediente: datos y foto, membresías y pagos, seguimiento (interacciones, visitas, ARCO), ficha de salud y rutina | Todos (acciones según rol) |
> | `/pagos` | Pagos, comprobante imprimible, cancelación | Recepción (cancelar: admin) |
> | `/planes` | Catálogo de planes (alta, edición y activación solo para admin) | Todos |
> | `/ejercicios` | Catálogo de ejercicios con contraindicaciones | Entrenador, admin |
> | `/plantillas` | Plantillas por bloques: duplicar y activar o desactivar | Entrenador, admin |
> | `/plantillas/nueva`, `/plantillas/:id` | Editor de plantilla por bloques | Entrenador, admin |
> | `/riesgo` | Tablero de riesgo de deserción y reglas por sede | Recepción (reglas: admin) |
> | `/segmentos` | Constructor de segmentos con vista previa y CSV | Admin |
> | `/campanas` | Campañas push inmediatas o programadas con estado de envío | Admin |
> | `/reportes` | Horas pico, adherencia, retención, renovaciones e ingresos; Excel y PDF | Admin |
> | `/usuarios` | Personal, roles, sedes y sesiones | Admin |
> | `/sedes` | Sedes y horarios | Admin |
> | `/bitacora` | Bitácora de auditoría con valores antes/después | Admin |
> | `/arco` | Solicitudes de derechos ARCO | Recepción (resolver: admin) |

---

## Stack Tecnológico

| Herramienta | Versión / Tipo | Propósito |
| :--- | :--- | :--- |
| **React** | `^19.2.8` | Biblioteca base de componentes de interfaz de usuario |
| **Vite** | `^8.3.0` | Servidor de desarrollo con HMR ultra rápido y bundler de producción |
| **TypeScript** | `~6.0.2` | Tipado estático y robustez en tiempo de compilación |
| **React Compiler** | `babel-plugin-react-compiler` | Optimización reactiva automática de componentes |
| **ESLint** | Flat Config (`v10.x`) | Reglas de calidad y verificación estática de código |

---

## Requisitos Previos

* **Node.js**: Versión LTS (`>= 20.x`, compatible con `22.x` y `24.x`).
* **npm**: `v10.x` o superior.
* Servidor Backend (NestJS) ejecutándose en `http://localhost:3000`.

---

## Variables de Entorno

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Contenido de `.env`:

```env
# URL base de la API Backend NestJS
VITE_API_URL="http://localhost:3000"
# Minutos sin actividad antes de cerrar la sesión (CRM-RNF-03)
VITE_MINUTOS_INACTIVIDAD=30
# Debe coincidir con CONGELAMIENTO_MAX_DIAS del backend
VITE_CONGELAMIENTO_MAX_DIAS=90
```

---

## Instalación y Ejecución

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar servidor de desarrollo (HMR):**
   ```bash
   npm run dev
   ```
   La aplicación estará accesible en `http://localhost:5173`.

3. **Compilar para producción:**
   ```bash
   npm run build
   ```
   Genera la salida optimizada en la carpeta `dist/`.

4. **Previsualizar compilación:**
   ```bash
   npm run preview
   ```

5. **Análisis de calidad (Lint):**
   ```bash
   npm run lint
   ```

---

## Comandos Disponibles

| Script | Descripción |
| :--- | :--- |
| `npm run dev` | Inicia el servidor de desarrollo local de Vite con Hot Module Replacement (HMR). |
| `npm run build` | Ejecuta la verificación de tipos con `tsc -b` y compila la aplicación para producción con `vite build`. |
| `npm run lint` | Ejecuta ESLint sobre el código TypeScript y JSX. |
| `npm run preview` | Inicia un servidor web local para previsualizar la compilación de producción. |

---

## Estructura del Proyecto

```text
frontend/
├── .env.example          # Plantilla de variables de entorno
├── .gitignore            # Reglas de exclusión de Git
├── eslint.config.js      # Configuración de ESLint
├── index.html            # Punto de entrada HTML
├── package.json          # Dependencias y scripts npm
├── tsconfig.json         # Configuración de TypeScript
├── tsconfig.app.json     # Configuración TypeScript para el cliente
├── tsconfig.node.json    # Configuración TypeScript para Vite
├── vite.config.ts        # Configuración de Vite y plugins
├── public/               # Recursos estáticos públicos
└── src/
    ├── api/              # Cliente fetch con JWT (cliente.ts), endpoints y tipos (servicios.ts, tipos.ts, crm.ts)
    ├── auth/             # AuthProvider: sesión, cierre por inactividad/expiración, permisos por rol
    ├── components/       # Layout con sidebar, modales, campos, insignias, íconos y editor/vista de bloques de rutina
    ├── pages/            # Login, Socios, NuevoSocio, Pagos, Planes, Ejercicios, Plantillas y socio/ (expediente y pestañas)
    ├── utils/            # Formato de fechas/moneda, useCarga, comprobantes y validación de bloques
    ├── index.css         # Estilos globales con la estética de la app móvil (oscuro, morado #8A2BE2, responsivo desde 768 px)
    ├── App.tsx           # Rutas protegidas (React Router 7)
    └── main.tsx          # Punto de entrada de React en el DOM
```

---

## Integración con el Backend

El frontend se comunica con el backend de NestJS a través de llamadas HTTP REST autenticadas:
* Cabecera `Authorization: Bearer <JWT>` adjunta en cada petición tras iniciar sesión.
* Cierre automático de sesión y redirección al login ante tokens expirados o inactividad prolongada (`CRM-RNF-03`).
* Ocultamiento condicional de botones y menús según el rol activo (`administrador`, `recepcionista`, `entrenador`); el backend vuelve a validar cada petición.
* Al cerrar sesión se llama a `POST /auth/logout`, que revoca el token en el servidor.
* El token se guarda en `sessionStorage` (se borra al cerrar la pestaña). Los comprobantes de pago se piden con el token y se abren desde un Blob en una pestaña nueva.
