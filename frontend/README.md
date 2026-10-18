# GymHub Frontend

> **Aplicación Web SPA para Administración y Punto de Venta (POS) desarrollada con React 19, TypeScript y Vite 8.**

---

## Tabla de Contenidos

- [Descripción General](#descripción-general)
- [Stack Tecnológico](#stack-tecnológico)
- [Requisitos Previos](#requisitos-previos)
- [Variables de Entorno](#variables-de-entorno)
- [Instalación y Ejecución](#instalación-y-ejecución)
- [Comandos Disponibles](#comandos-disponibles)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Integración con el Backend](#integración-con-el-backend)

---

## Descripción General

El frontend de **GymHub** provee la interfaz gráfica para el personal de mostrador y administración del gimnasio. Integra los flujos de cobro en caja (POS), inventario de productos, registro de socios, cuestionarios médicos y seguimiento de métricas y rutinas.

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
| `npm run preview` | Levanta un servidor local para previsualizar los archivos generados en `dist/`. |

---

## Estructura del Proyecto

```text
frontend/
├── .env.example        # Plantilla de variables de entorno
├── .gitignore          # Reglas de exclusión de Git
├── eslint.config.js    # Configuración de ESLint (Flat Config)
├── index.html          # HTML principal de entrada
├── package.json        # Dependencias y scripts npm
├── tsconfig.json       # Configuración TypeScript base (Project References)
├── tsconfig.app.json   # Configuración TypeScript para el código cliente
├── tsconfig.node.json  # Configuración TypeScript para archivos de configuración
├── vite.config.ts      # Configuración de Vite y plugins (React + Babel Compiler)
├── public/             # Recursos estáticos (favicon, iconos SVG)
└── src/
    ├── assets/         # Imágenes y logos
    ├── App.css         # Estilos del componente principal
    ├── App.tsx         # Componente raíz de la aplicación
    ├── index.css       # Estilos globales
    └── main.tsx        # Punto de entrada de React (createRoot)
```

---

## Integración con el Backend

Para realizar peticiones a la API NestJS, utiliza la variable `import.meta.env.VITE_API_URL`:

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function fetchHealthCheck() {
  const response = await fetch(`${API_URL}/`);
  return response.text();
}
```
