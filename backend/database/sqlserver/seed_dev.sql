-- Datos de prueba para DESARROLLO (no ejecutar en producción).
-- Requiere haber ejecutado gimnasio_crm.sql y 002_vista_membresia_actual.sql.
-- Contraseña de los tres usuarios: GymHub2026!  (hash bcrypt, costo 12)
-- Cámbiala con: npm run usuario:password -- <correo> <nueva_contraseña>
USE gimnasio_crm;
GO

INSERT INTO sede (nombre, direccion, telefono, horario_apertura, horario_cierre)
VALUES (N'Matriz', N'Av. Principal 100', N'5550000000', '06:00', '22:00'),
       (N'Norte',  N'Calle Norte 25',    N'5550000001', '06:00', '22:00');

-- id_rol: 1=administrador, 2=recepcionista, 3=entrenador
INSERT INTO usuario (id_rol, nombre, correo, password_hash, es_admin_general)
VALUES (1, N'Admin General',     N'admin@gymhub.dev',      N'$2b$12$P7GYEv/AbAe6arnYX0ghXOZdZ0lcJU00FCPybpfkfqQPksy.i9cSK', 1),
       (2, N'Recepción Matriz',  N'recepcion@gymhub.dev',  N'$2b$12$P7GYEv/AbAe6arnYX0ghXOZdZ0lcJU00FCPybpfkfqQPksy.i9cSK', 0),
       (3, N'Entrenador Matriz', N'entrenador@gymhub.dev', N'$2b$12$P7GYEv/AbAe6arnYX0ghXOZdZ0lcJU00FCPybpfkfqQPksy.i9cSK', 0);

INSERT INTO usuario_sede (id_usuario, id_sede) VALUES (1, 1), (1, 2), (2, 1), (3, 1);

INSERT INTO aviso_privacidad (version, contenido, vigente_desde)
VALUES (N'1.0',
        N'Aviso de privacidad de prueba. GymHub tratará tus datos de identificación y contacto para administrar tu membresía, y tus datos de salud únicamente para prescribir rutinas seguras. Puedes ejercer tus derechos ARCO en recepción. Sustituir por el texto legal del gimnasio.',
        '2026-01-01');

INSERT INTO plan_membresia (nombre, tipo, duracion_dias, precio, beneficios)
VALUES (N'Mensual',    'mensual',    30,  500.00, N'Acceso a área de pesas y cardio'),
       (N'Trimestral', 'trimestral', 90, 1350.00, N'Acceso completo + valoración inicial'),
       (N'Anual',      'anual',     365, 4800.00, N'Acceso completo + 2 meses de rutina personalizada');
GO
