-- BASE DE DATOS: CRM de gimnasio + App móvil
-- Motor: SQL Server 2017+ (T-SQL)
-- Nota: el catálogo de ejercicios y las plantillas de rutinas viven en
-- MongoDB (CRM-RF-06, CRM-RF-07). Aquí solo se guardan sus referencias
-- (campos *_mongo_id, CHAR(24) = ObjectId).
-- Campos *_cifrado: se cifran con AES-256 en el backend (CRM-RNF-01)
-- y se guardan como VARBINARY. Los campos *_hash son "índices ciegos"
-- (SHA-256 con pepper) para detectar duplicados sin descifrar.
-- Ejecutar por lotes (los GO son separadores de lote).

USE master;
GO
IF DB_ID(N'gimnasio_crm') IS NOT NULL
BEGIN
    ALTER DATABASE gimnasio_crm SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE gimnasio_crm;
END
GO
CREATE DATABASE gimnasio_crm COLLATE Modern_Spanish_CI_AI;
GO
USE gimnasio_crm;
GO

-- 1. SEDES, ROLES Y USUARIOS DEL PERSONAL (CRM-RF-18, CRM-RF-19)

CREATE TABLE sede (
  id_sede          INT IDENTITY(1,1) PRIMARY KEY,
  nombre           NVARCHAR(100) NOT NULL UNIQUE,
  direccion        NVARCHAR(255) NULL,
  telefono         NVARCHAR(20) NULL,
  horario_apertura TIME NULL,
  horario_cierre   TIME NULL,
  activa           BIT NOT NULL DEFAULT 1,
  creado_en        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE sede_horario (
  id_horario    INT IDENTITY(1,1) PRIMARY KEY,
  id_sede       INT NOT NULL,
  dia_semana    TINYINT NOT NULL,           -- 1=lunes ... 7=domingo
  hora_apertura TIME NOT NULL,
  hora_cierre   TIME NOT NULL,
  CONSTRAINT uq_sede_dia UNIQUE (id_sede, dia_semana),
  CONSTRAINT ck_horario_dia CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT fk_horario_sede FOREIGN KEY (id_sede) REFERENCES sede(id_sede)
);

CREATE TABLE rol (
  id_rol      TINYINT IDENTITY(1,1) PRIMARY KEY,
  nombre      NVARCHAR(30) NOT NULL UNIQUE,
  descripcion NVARCHAR(150) NULL
);

CREATE TABLE usuario (
  id_usuario        INT IDENTITY(1,1) PRIMARY KEY,
  id_rol            TINYINT NOT NULL,
  nombre            NVARCHAR(120) NOT NULL,
  correo            NVARCHAR(150) NOT NULL UNIQUE,
  password_hash     NVARCHAR(255) NOT NULL,       -- bcrypt/argon2 con sal
  es_admin_general  BIT NOT NULL DEFAULT 0,       -- ve todas las sedes
  activo            BIT NOT NULL DEFAULT 1,
  intentos_fallidos TINYINT NOT NULL DEFAULT 0,
  bloqueado_hasta   DATETIME2(0) NULL,
  ultimo_acceso     DATETIME2(0) NULL,
  creado_en         DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  actualizado_en    DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT fk_usuario_rol FOREIGN KEY (id_rol) REFERENCES rol(id_rol)
);

CREATE TABLE usuario_sede (
  id_usuario INT NOT NULL,
  id_sede    INT NOT NULL,
  PRIMARY KEY (id_usuario, id_sede),
  CONSTRAINT fk_us_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
  CONSTRAINT fk_us_sede    FOREIGN KEY (id_sede)    REFERENCES sede(id_sede)
);

-- Tokens de sesión del personal (JWT con expiración, CRM-RNF-03)
CREATE TABLE sesion_usuario (
  id_sesion  BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_usuario INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  ip         NVARCHAR(45) NULL,
  creada_en  DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  expira_en  DATETIME2(0) NOT NULL,
  revocada   BIT NOT NULL DEFAULT 0,
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_sesion_usuario ON sesion_usuario (id_usuario);

-- 2. SOCIOS (CRM-RF-01, APP-RF-01, APP-RF-02)

CREATE TABLE socio (
  id_socio         INT IDENTITY(1,1) PRIMARY KEY,
  folio            NVARCHAR(20) NOT NULL UNIQUE,
  id_sede          INT NOT NULL,
  nombre           NVARCHAR(120) NOT NULL,
  fecha_nacimiento DATE NOT NULL,
  telefono_cifrado VARBINARY(512) NOT NULL,
  telefono_hash    CHAR(64) NOT NULL,
  correo_cifrado   VARBINARY(512) NOT NULL,
  correo_hash      CHAR(64) NOT NULL,
  contacto_emergencia_cifrado VARBINARY(1024) NOT NULL,  -- nombre, parentesco y teléfono
  foto_url         NVARCHAR(255) NULL,
  objetivo         VARCHAR(20) NULL,
  estado           VARCHAR(10) NOT NULL DEFAULT 'activo',  -- baja lógica
  fecha_alta       DATE NOT NULL DEFAULT CAST(GETDATE() AS DATE),
  fecha_baja       DATE NULL,
  motivo_baja      NVARCHAR(255) NULL,
  creado_por       INT NULL,
  creado_en        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  actualizado_en   DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT uq_socio_correo   UNIQUE (correo_hash),
  CONSTRAINT uq_socio_telefono UNIQUE (telefono_hash),
  CONSTRAINT ck_socio_objetivo CHECK (objetivo IN ('perder_peso','ganar_masa','tonificar','resistencia','salud_general','rehabilitacion','otro')),
  CONSTRAINT ck_socio_estado   CHECK (estado IN ('activo','baja')),
  CONSTRAINT fk_socio_sede     FOREIGN KEY (id_sede) REFERENCES sede(id_sede),
  CONSTRAINT fk_socio_creador  FOREIGN KEY (creado_por) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_socio_sede_estado ON socio (id_sede, estado);
CREATE INDEX idx_socio_nombre      ON socio (nombre);

-- Cuenta de la app móvil (activación con folio + correo, APP-RF-01)
CREATE TABLE cuenta_app (
  id_socio          INT PRIMARY KEY,
  password_hash     NVARCHAR(255) NULL,
  activada          BIT NOT NULL DEFAULT 0,
  activada_en       DATETIME2(0) NULL,
  intentos_fallidos TINYINT NOT NULL DEFAULT 0,
  bloqueada_hasta   DATETIME2(0) NULL,
  ultimo_acceso     DATETIME2(0) NULL,
  CONSTRAINT fk_cuenta_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);

CREATE TABLE sesion_app (
  id_sesion_app      BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_socio           INT NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  dispositivo        NVARCHAR(100) NULL,
  creada_en          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  expira_en          DATETIME2(0) NOT NULL,
  revocada           BIT NOT NULL DEFAULT 0,   -- se invalida al cerrar sesión (APP-RF-03)
  CONSTRAINT fk_sesionapp_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);
CREATE INDEX idx_sesionapp_socio ON sesion_app (id_socio);

CREATE TABLE recuperacion_password (
  id_recuperacion INT IDENTITY(1,1) PRIMARY KEY,
  id_socio        INT NOT NULL,
  token_hash      CHAR(64) NOT NULL UNIQUE,
  expira_en       DATETIME2(0) NOT NULL,
  usado           BIT NOT NULL DEFAULT 0,
  creado_en       DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT fk_recup_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);

-- Consentimientos y avisos de privacidad (CRM-RNF-02, APP-RF-10)
CREATE TABLE aviso_privacidad (
  id_aviso      INT IDENTITY(1,1) PRIMARY KEY,
  version       NVARCHAR(20) NOT NULL UNIQUE,
  contenido     NVARCHAR(MAX) NOT NULL,
  vigente_desde DATE NOT NULL
);

-- Cada cambio es un registro nuevo; el último por tipo es el estado vigente
CREATE TABLE consentimiento (
  id_consentimiento INT IDENTITY(1,1) PRIMARY KEY,
  id_socio          INT NOT NULL,
  tipo              VARCHAR(20) NOT NULL,
  id_aviso          INT NULL,
  otorgado          BIT NOT NULL,
  fecha             DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  origen            VARCHAR(5) NOT NULL,
  CONSTRAINT ck_consent_tipo   CHECK (tipo IN ('aviso_privacidad','datos_salud','notificaciones','health_connect')),
  CONSTRAINT ck_consent_origen CHECK (origen IN ('crm','app')),
  CONSTRAINT fk_consent_socio  FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_consent_aviso  FOREIGN KEY (id_aviso) REFERENCES aviso_privacidad(id_aviso)
);
CREATE INDEX idx_consent_socio_tipo ON consentimiento (id_socio, tipo, fecha);

CREATE TABLE solicitud_arco (
  id_solicitud INT IDENTITY(1,1) PRIMARY KEY,
  id_socio     INT NOT NULL,
  tipo         VARCHAR(15) NOT NULL,
  descripcion  NVARCHAR(500) NULL,
  estado       VARCHAR(15) NOT NULL DEFAULT 'recibida',
  atendida_por INT NULL,
  creada_en    DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  atendida_en  DATETIME2(0) NULL,
  CONSTRAINT ck_arco_tipo   CHECK (tipo IN ('acceso','rectificacion','cancelacion','oposicion')),
  CONSTRAINT ck_arco_estado CHECK (estado IN ('recibida','en_proceso','atendida','rechazada')),
  CONSTRAINT fk_arco_socio   FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_arco_usuario FOREIGN KEY (atendida_por) REFERENCES usuario(id_usuario)
);

-- 3. FICHA DE SALUD VERSIONADA (CRM-RF-05, APP-RF-09)

CREATE TABLE ficha_salud (
  id_ficha        INT IDENTITY(1,1) PRIMARY KEY,
  id_socio        INT NOT NULL,
  version         INT NOT NULL,
  datos_cifrados  VARBINARY(MAX) NOT NULL,   -- antecedentes, lesiones, alergias, medicamentos (AES-256)
  nivel_actividad VARCHAR(12) NULL,
  objetivo        NVARCHAR(100) NULL,
  restricciones_rutina NVARCHAR(MAX) NULL,   -- JSON: etiquetas no sensibles para sugerir plantillas
  origen          VARCHAR(5) NOT NULL,
  borrador        BIT NOT NULL DEFAULT 0,    -- guardado parcial en la app
  actualizado_por_usuario INT NULL,
  creado_en       DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT uq_ficha_version UNIQUE (id_socio, version),
  CONSTRAINT ck_ficha_nivel   CHECK (nivel_actividad IN ('sedentario','bajo','medio','alto')),
  CONSTRAINT ck_ficha_origen  CHECK (origen IN ('crm','app')),
  CONSTRAINT ck_ficha_json    CHECK (restricciones_rutina IS NULL OR ISJSON(restricciones_rutina) = 1),
  CONSTRAINT fk_ficha_socio   FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_ficha_usuario FOREIGN KEY (actualizado_por_usuario) REFERENCES usuario(id_usuario)
);

-- 4. PLANES, MEMBRESÍAS Y PAGOS (CRM-RF-02, 03, 04; APP-RF-04)

CREATE TABLE plan_membresia (
  id_plan       INT IDENTITY(1,1) PRIMARY KEY,
  nombre        NVARCHAR(80) NOT NULL UNIQUE,
  tipo          VARCHAR(12) NOT NULL,
  duracion_dias INT NOT NULL,
  precio        DECIMAL(10,2) NOT NULL,
  beneficios    NVARCHAR(MAX) NULL,
  activo        BIT NOT NULL DEFAULT 1,   -- inactivo: no asignable, se conserva en historial
  creado_en     DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_plan_tipo     CHECK (tipo IN ('mensual','trimestral','anual')),
  CONSTRAINT ck_plan_precio   CHECK (precio >= 0),
  CONSTRAINT ck_plan_duracion CHECK (duracion_dias > 0)
);

CREATE TABLE membresia (
  id_membresia      INT IDENTITY(1,1) PRIMARY KEY,
  id_socio          INT NOT NULL,
  id_plan           INT NOT NULL,
  fecha_inicio      DATE NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  estado            VARCHAR(12) NOT NULL DEFAULT 'activa',
  es_renovacion     BIT NOT NULL DEFAULT 0,
  id_membresia_anterior INT NULL,
  creada_por        INT NULL,
  creada_en         DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_mem_estado CHECK (estado IN ('activa','por_vencer','vencida','congelada','cancelada')),
  CONSTRAINT ck_mem_fechas CHECK (fecha_vencimiento >= fecha_inicio),
  CONSTRAINT fk_mem_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_mem_plan  FOREIGN KEY (id_plan)  REFERENCES plan_membresia(id_plan),
  CONSTRAINT fk_mem_ant   FOREIGN KEY (id_membresia_anterior) REFERENCES membresia(id_membresia),
  CONSTRAINT fk_mem_user  FOREIGN KEY (creada_por) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_membresia_socio        ON membresia (id_socio, fecha_vencimiento);
CREATE INDEX idx_membresia_estado_venc  ON membresia (estado, fecha_vencimiento);

CREATE TABLE congelamiento_membresia (
  id_congelamiento INT IDENTITY(1,1) PRIMARY KEY,
  id_membresia     INT NOT NULL,
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,
  dias_extendidos  INT NOT NULL DEFAULT 0,
  motivo           NVARCHAR(255) NULL,
  registrado_por   INT NULL,
  creado_en        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_cong_fechas CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT fk_cong_mem  FOREIGN KEY (id_membresia) REFERENCES membresia(id_membresia),
  CONSTRAINT fk_cong_user FOREIGN KEY (registrado_por) REFERENCES usuario(id_usuario)
);

CREATE TABLE pago (
  id_pago            BIGINT IDENTITY(1,1) PRIMARY KEY,
  folio              NVARCHAR(25) NOT NULL UNIQUE,
  id_socio           INT NOT NULL,
  id_membresia       INT NOT NULL,
  id_plan            INT NOT NULL,
  id_sede            INT NOT NULL,
  monto              DECIMAL(10,2) NOT NULL,
  metodo             VARCHAR(15) NOT NULL,
  referencia         NVARCHAR(80) NULL,
  estado             VARCHAR(12) NOT NULL DEFAULT 'registrado',
  fecha_pago         DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  registrado_por     INT NOT NULL,
  motivo_cancelacion NVARCHAR(255) NULL,
  autorizado_por     INT NULL,
  cancelado_en       DATETIME2(0) NULL,
  CONSTRAINT ck_pago_monto  CHECK (monto > 0),
  CONSTRAINT ck_pago_metodo CHECK (metodo IN ('efectivo','tarjeta','transferencia')),
  CONSTRAINT ck_pago_estado CHECK (estado IN ('registrado','cancelado')),
  CONSTRAINT fk_pago_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_pago_mem   FOREIGN KEY (id_membresia) REFERENCES membresia(id_membresia),
  CONSTRAINT fk_pago_plan  FOREIGN KEY (id_plan) REFERENCES plan_membresia(id_plan),
  CONSTRAINT fk_pago_sede  FOREIGN KEY (id_sede) REFERENCES sede(id_sede),
  CONSTRAINT fk_pago_reg   FOREIGN KEY (registrado_por) REFERENCES usuario(id_usuario),
  CONSTRAINT fk_pago_aut   FOREIGN KEY (autorizado_por) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_pago_socio      ON pago (id_socio, fecha_pago);
CREATE INDEX idx_pago_sede_fecha ON pago (id_sede, fecha_pago);

-- 5. ASISTENCIA (CRM-RF-11)

CREATE TABLE asistencia (
  id_asistencia    BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_socio         INT NOT NULL,
  id_sede          INT NOT NULL,
  id_membresia     INT NULL,
  fecha_hora       DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  metodo_registro  VARCHAR(10) NOT NULL,
  estado_membresia VARCHAR(12) NOT NULL,   -- estado al momento de la entrada
  registrado_por   INT NOT NULL,
  CONSTRAINT ck_asist_metodo CHECK (metodo_registro IN ('busqueda','qr')),
  CONSTRAINT ck_asist_estado CHECK (estado_membresia IN ('vigente','por_vencer','vencida')),
  CONSTRAINT fk_asist_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_asist_sede  FOREIGN KEY (id_sede) REFERENCES sede(id_sede),
  CONSTRAINT fk_asist_mem   FOREIGN KEY (id_membresia) REFERENCES membresia(id_membresia),
  CONSTRAINT fk_asist_user  FOREIGN KEY (registrado_por) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_asist_socio_fecha ON asistencia (id_socio, fecha_hora);
CREATE INDEX idx_asist_sede_fecha  ON asistencia (id_sede, fecha_hora);

-- 6. RUTINAS Y ENTRENAMIENTO (CRM-RF-08, 09, 10; APP-RF-06, 07, 08)
--    Plantillas y ejercicios están en MongoDB; aquí solo la asignación.

CREATE TABLE rutina_asignada (
  id_rutina          INT IDENTITY(1,1) PRIMARY KEY,
  id_socio           INT NOT NULL,
  plantilla_mongo_id CHAR(24) NOT NULL,
  id_entrenador      INT NOT NULL,
  estado             VARCHAR(12) NOT NULL DEFAULT 'vigente',
  sesiones_planeadas_semana TINYINT NOT NULL DEFAULT 3,
  fecha_inicio       DATE NOT NULL,
  fecha_fin          DATE NULL,
  creada_en          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_rutina_estado CHECK (estado IN ('vigente','reemplazada','finalizada')),
  CONSTRAINT fk_rutina_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_rutina_ent   FOREIGN KEY (id_entrenador) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_rutina_socio_estado ON rutina_asignada (id_socio, estado);

CREATE TABLE rutina_version (
  id_version         INT IDENTITY(1,1) PRIMARY KEY,
  id_rutina          INT NOT NULL,
  numero_version     INT NOT NULL,
  contenido_mongo_id CHAR(24) NOT NULL,   -- documento con bloques/ejercicios de esta versión
  motivo             NVARCHAR(255) NULL,
  autor              INT NOT NULL,
  fecha              DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT uq_rutina_version UNIQUE (id_rutina, numero_version),
  CONSTRAINT fk_rv_rutina FOREIGN KEY (id_rutina) REFERENCES rutina_asignada(id_rutina),
  CONSTRAINT fk_rv_autor  FOREIGN KEY (autor) REFERENCES usuario(id_usuario)
);

CREATE TABLE sesion_entrenamiento (
  id_sesion       BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_socio        INT NOT NULL,
  id_rutina       INT NULL,
  id_version      INT NULL,
  uuid_cliente    CHAR(36) NOT NULL UNIQUE,   -- generado en la app; evita duplicados al reintentar
  fecha_inicio    DATETIME2(0) NOT NULL,
  fecha_fin       DATETIME2(0) NULL,
  duracion_min    SMALLINT NULL,
  detalle         NVARCHAR(MAX) NOT NULL,      -- JSON: ejercicios, cargas, repeticiones
  calorias        DECIMAL(8,2) NULL,
  fc_promedio     SMALLINT NULL,
  fc_maxima       SMALLINT NULL,
  pasos           INT NULL,
  completada      BIT NOT NULL DEFAULT 1,
  sincronizada_en DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_sesent_json CHECK (ISJSON(detalle) = 1),
  CONSTRAINT fk_sesent_socio   FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_sesent_rutina  FOREIGN KEY (id_rutina) REFERENCES rutina_asignada(id_rutina),
  CONSTRAINT fk_sesent_version FOREIGN KEY (id_version) REFERENCES rutina_version(id_version)
);
CREATE INDEX idx_sesent_socio_fecha ON sesion_entrenamiento (id_socio, fecha_inicio);

-- 7. SALUD Y ACTIVIDAD FÍSICA - HEALTH CONNECT (APP-RF-11, APP-RF-12)

CREATE TABLE dato_salud (
  id_dato         BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_socio        INT NOT NULL,
  tipo            VARCHAR(20) NOT NULL,
  valor           DECIMAL(10,2) NOT NULL,
  inicio_medicion DATETIME2(0) NOT NULL,
  fin_medicion    DATETIME2(0) NOT NULL,
  origen          NVARCHAR(50) NOT NULL DEFAULT N'health_connect',
  recibido_en     DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_dato_tipo CHECK (tipo IN ('calorias','frecuencia_cardiaca','pasos')),
  CONSTRAINT uq_dato_dedup UNIQUE (id_socio, tipo, inicio_medicion, fin_medicion),
  CONSTRAINT fk_dato_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);
CREATE INDEX idx_dato_socio_fecha ON dato_salud (id_socio, inicio_medicion);

CREATE TABLE sincronizacion_salud (
  id_sync             BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_socio            INT NOT NULL,
  fecha_sync          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  registros_recibidos INT NOT NULL DEFAULT 0,
  exitosa             BIT NOT NULL DEFAULT 1,
  detalle_error       NVARCHAR(255) NULL,
  CONSTRAINT fk_sync_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);
CREATE INDEX idx_sync_socio ON sincronizacion_salud (id_socio, fecha_sync);

-- 8. SEGMENTACIÓN, RIESGO DE DESERCIÓN E INTERACCIONES
--    (CRM-RF-12, 13, 15)

CREATE TABLE segmento (
  id_segmento INT IDENTITY(1,1) PRIMARY KEY,
  nombre      NVARCHAR(100) NOT NULL UNIQUE,
  descripcion NVARCHAR(255) NULL,
  filtros     NVARCHAR(MAX) NOT NULL,   -- JSON: estado membresía, sede, objetivo, frecuencia, antigüedad, edad
  creado_por  INT NOT NULL,
  creado_en   DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_seg_json CHECK (ISJSON(filtros) = 1),
  CONSTRAINT fk_seg_user FOREIGN KEY (creado_por) REFERENCES usuario(id_usuario)
);

CREATE TABLE config_riesgo (
  id_config              INT IDENTITY(1,1) PRIMARY KEY,
  id_sede                INT NULL,          -- NULL = configuración global (solo una)
  dias_inactividad       SMALLINT NOT NULL DEFAULT 10,
  dias_aviso_vencimiento SMALLINT NOT NULL DEFAULT 7,
  activa                 BIT NOT NULL DEFAULT 1,
  actualizado_en         DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT uq_config_sede UNIQUE (id_sede),
  CONSTRAINT fk_cfgriesgo_sede FOREIGN KEY (id_sede) REFERENCES sede(id_sede)
);

CREATE TABLE riesgo_desercion (
  id_riesgo    INT IDENTITY(1,1) PRIMARY KEY,
  id_socio     INT NOT NULL,
  motivo       VARCHAR(25) NOT NULL,
  detalle      NVARCHAR(255) NULL,
  estado       VARCHAR(12) NOT NULL DEFAULT 'abierto',
  detectado_en DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  cerrado_en   DATETIME2(0) NULL,
  CONSTRAINT ck_riesgo_motivo CHECK (motivo IN ('inactividad','membresia_por_vencer')),
  CONSTRAINT ck_riesgo_estado CHECK (estado IN ('abierto','atendido','resuelto','descartado')),
  CONSTRAINT fk_riesgo_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);
CREATE INDEX idx_riesgo_estado ON riesgo_desercion (estado, detectado_en);
CREATE INDEX idx_riesgo_socio  ON riesgo_desercion (id_socio);

CREATE TABLE accion_riesgo (
  id_accion     INT IDENTITY(1,1) PRIMARY KEY,
  id_riesgo     INT NOT NULL,
  tipo_accion   VARCHAR(15) NOT NULL,
  descripcion   NVARCHAR(500) NULL,
  realizada_por INT NOT NULL,
  fecha         DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_accion_tipo CHECK (tipo_accion IN ('llamada','notificacion','visita','promocion','otra')),
  CONSTRAINT fk_accion_riesgo FOREIGN KEY (id_riesgo) REFERENCES riesgo_desercion(id_riesgo),
  CONSTRAINT fk_accion_user   FOREIGN KEY (realizada_por) REFERENCES usuario(id_usuario)
);

CREATE TABLE interaccion_socio (
  id_interaccion BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_socio       INT NOT NULL,
  tipo           VARCHAR(15) NOT NULL,
  descripcion    NVARCHAR(1000) NOT NULL,
  id_usuario     INT NULL,                -- NULL = generado por el sistema
  fecha          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_inter_tipo CHECK (tipo IN ('notificacion','renovacion','cambio_rutina','llamada','nota','pago','otro')),
  CONSTRAINT fk_inter_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio),
  CONSTRAINT fk_inter_user  FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_inter_socio_fecha ON interaccion_socio (id_socio, fecha);

-- 9. CAMPAÑAS Y NOTIFICACIONES PUSH (CRM-RF-14; APP-RF-13, APP-RF-14)

CREATE TABLE dispositivo_push (
  id_dispositivo INT IDENTITY(1,1) PRIMARY KEY,
  id_socio       INT NOT NULL,
  fcm_token      NVARCHAR(255) NOT NULL UNIQUE,
  plataforma     NVARCHAR(20) NOT NULL DEFAULT N'android',
  activo         BIT NOT NULL DEFAULT 1,
  actualizado_en DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT fk_disp_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);
CREATE INDEX idx_disp_socio ON dispositivo_push (id_socio);

CREATE TABLE preferencia_notificacion (
  id_socio   INT NOT NULL,
  categoria  VARCHAR(15) NOT NULL,
  habilitada BIT NOT NULL DEFAULT 1,
  PRIMARY KEY (id_socio, categoria),
  CONSTRAINT ck_pref_cat CHECK (categoria IN ('vencimiento','rutina','promociones','avisos')),
  CONSTRAINT fk_pref_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);

CREATE TABLE campana (
  id_campana       INT IDENTITY(1,1) PRIMARY KEY,
  titulo           NVARCHAR(120) NOT NULL,
  contenido        NVARCHAR(500) NOT NULL,
  categoria        VARCHAR(15) NOT NULL DEFAULT 'avisos',
  tipo_destino     VARCHAR(10) NOT NULL,
  id_socio_destino INT NULL,
  id_segmento      INT NULL,
  modo_envio       VARCHAR(12) NOT NULL DEFAULT 'inmediato',
  programada_para  DATETIME2(0) NULL,
  estado           VARCHAR(12) NOT NULL DEFAULT 'borrador',
  creada_por       INT NOT NULL,
  creada_en        DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_camp_cat     CHECK (categoria IN ('vencimiento','rutina','promociones','avisos')),
  CONSTRAINT ck_camp_tipo    CHECK (tipo_destino IN ('socio','segmento')),
  CONSTRAINT ck_camp_modo    CHECK (modo_envio IN ('inmediato','programado')),
  CONSTRAINT ck_camp_estado  CHECK (estado IN ('borrador','programada','procesando','enviada','cancelada')),
  CONSTRAINT ck_camp_destino CHECK (
    (tipo_destino = 'socio' AND id_socio_destino IS NOT NULL) OR
    (tipo_destino = 'segmento' AND id_segmento IS NOT NULL)),
  CONSTRAINT fk_camp_socio FOREIGN KEY (id_socio_destino) REFERENCES socio(id_socio),
  CONSTRAINT fk_camp_seg   FOREIGN KEY (id_segmento) REFERENCES segmento(id_segmento),
  CONSTRAINT fk_camp_user  FOREIGN KEY (creada_por) REFERENCES usuario(id_usuario)
);
CREATE INDEX idx_campana_estado ON campana (estado, programada_para);

CREATE TABLE notificacion (
  id_notificacion BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_campana      INT NULL,                -- NULL = automática (vencimiento / inactividad)
  id_socio        INT NOT NULL,
  origen          VARCHAR(30) NOT NULL,
  categoria       VARCHAR(15) NOT NULL,
  titulo          NVARCHAR(120) NOT NULL,
  contenido       NVARCHAR(500) NOT NULL,
  estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  intentos        TINYINT NOT NULL DEFAULT 0,
  error           NVARCHAR(255) NULL,
  fcm_message_id  NVARCHAR(255) NULL,
  creada_en       DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  enviada_en      DATETIME2(0) NULL,
  entregada_en    DATETIME2(0) NULL,
  leida_en        DATETIME2(0) NULL,       -- bandeja dentro de la app (APP-RF-14)
  CONSTRAINT ck_notif_origen CHECK (origen IN ('campana','recordatorio_vencimiento','recordatorio_inactividad','rutina')),
  CONSTRAINT ck_notif_cat    CHECK (categoria IN ('vencimiento','rutina','promociones','avisos')),
  CONSTRAINT ck_notif_estado CHECK (estado IN ('pendiente','enviado','entregado','fallido')),
  CONSTRAINT fk_notif_camp  FOREIGN KEY (id_campana) REFERENCES campana(id_campana),
  CONSTRAINT fk_notif_socio FOREIGN KEY (id_socio) REFERENCES socio(id_socio)
);
CREATE INDEX idx_notif_socio  ON notificacion (id_socio, creada_en);
CREATE INDEX idx_notif_estado ON notificacion (estado, creada_en);

-- 10. BITÁCORA DE AUDITORÍA (CRM-RF-20) - solo lectura

CREATE TABLE bitacora_auditoria (
  id_bitacora    BIGINT IDENTITY(1,1) PRIMARY KEY,
  id_usuario     INT NULL,
  id_socio       INT NULL,
  entidad        NVARCHAR(50) NOT NULL,     -- socio, ficha_salud, pago, ...
  id_entidad     NVARCHAR(40) NULL,
  accion         VARCHAR(15) NOT NULL,
  valor_anterior NVARCHAR(MAX) NULL,        -- JSON
  valor_nuevo    NVARCHAR(MAX) NULL,        -- JSON
  ip             NVARCHAR(45) NULL,
  fecha          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT ck_bit_accion CHECK (accion IN ('consulta','crear','modificar','eliminar','cancelar','login','login_fallido')),
  CONSTRAINT ck_bit_json_a CHECK (valor_anterior IS NULL OR ISJSON(valor_anterior) = 1),
  CONSTRAINT ck_bit_json_n CHECK (valor_nuevo IS NULL OR ISJSON(valor_nuevo) = 1)
);
CREATE INDEX idx_bit_fecha   ON bitacora_auditoria (fecha);
CREATE INDEX idx_bit_usuario ON bitacora_auditoria (id_usuario, fecha);
CREATE INDEX idx_bit_entidad ON bitacora_auditoria (entidad, accion, fecha);
GO

-- 11. TRIGGERS

-- Bitácora de solo lectura: bloquea UPDATE y DELETE
CREATE TRIGGER trg_bitacora_solo_lectura ON bitacora_auditoria
INSTEAD OF UPDATE, DELETE
AS
BEGIN
  THROW 50001, N'La bitácora es de solo lectura', 1;
END
GO

-- Mantiene actualizado_en en cada UPDATE
CREATE TRIGGER trg_usuario_actualizado ON usuario
AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE u SET actualizado_en = SYSDATETIME()
  FROM usuario u INNER JOIN inserted i ON u.id_usuario = i.id_usuario;
END
GO

CREATE TRIGGER trg_socio_actualizado ON socio
AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE s SET actualizado_en = SYSDATETIME()
  FROM socio s INNER JOIN inserted i ON s.id_socio = i.id_socio;
END
GO

CREATE TRIGGER trg_config_riesgo_actualizado ON config_riesgo
AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE c SET actualizado_en = SYSDATETIME()
  FROM config_riesgo c INNER JOIN inserted i ON c.id_config = i.id_config;
END
GO

CREATE TRIGGER trg_dispositivo_actualizado ON dispositivo_push
AFTER UPDATE AS
BEGIN
  SET NOCOUNT ON;
  UPDATE d SET actualizado_en = SYSDATETIME()
  FROM dispositivo_push d INNER JOIN inserted i ON d.id_dispositivo = i.id_dispositivo;
END
GO

-- 12. DATOS INICIALES

INSERT INTO rol (nombre, descripcion) VALUES
  (N'administrador', N'Acceso total, reportes, campañas y auditoría'),
  (N'recepcionista', N'Socios, membresías, pagos y asistencia'),
  (N'entrenador',    N'Rutinas, ejercicios, ficha de salud y seguimiento');

INSERT INTO config_riesgo (id_sede, dias_inactividad, dias_aviso_vencimiento)
VALUES (NULL, 10, 7);
GO

-- 13. VISTAS ÚTILES

-- Última membresía de cada socio con su estado calculado
CREATE VIEW v_membresia_actual AS
SELECT m.id_membresia, m.id_socio, m.id_plan, m.fecha_inicio, m.fecha_vencimiento,
  CASE
    WHEN m.estado IN ('congelada','cancelada') THEN m.estado
    WHEN m.fecha_vencimiento < CAST(GETDATE() AS DATE) THEN 'vencida'
    WHEN m.fecha_vencimiento <= DATEADD(DAY, 7, CAST(GETDATE() AS DATE)) THEN 'por_vencer'
    ELSE 'activa'
  END AS estado_calculado,
  DATEDIFF(DAY, CAST(GETDATE() AS DATE), m.fecha_vencimiento) AS dias_restantes
FROM membresia m
WHERE m.id_membresia = (SELECT MAX(m2.id_membresia) FROM membresia m2 WHERE m2.id_socio = m.id_socio);
GO

-- Última asistencia por socio (para riesgo de deserción)
CREATE VIEW v_ultima_asistencia AS
SELECT s.id_socio, s.id_sede, MAX(a.fecha_hora) AS ultima_visita,
       DATEDIFF(DAY, CAST(MAX(a.fecha_hora) AS DATE), CAST(GETDATE() AS DATE)) AS dias_sin_asistir
FROM socio s
LEFT JOIN asistencia a ON a.id_socio = s.id_socio
WHERE s.estado = 'activo'
GROUP BY s.id_socio, s.id_sede;
GO

-- Indicadores del panel (CRM-RF-16)
CREATE VIEW v_panel_indicadores AS
SELECT s.id_sede,
  COUNT(CASE WHEN s.estado = 'activo' THEN 1 END) AS socios_activos,
  COUNT(CASE WHEN s.fecha_alta >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) THEN 1 END) AS altas_mes,
  COUNT(CASE WHEN s.fecha_baja >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1) THEN 1 END) AS bajas_mes
FROM socio s
GROUP BY s.id_sede;
GO
