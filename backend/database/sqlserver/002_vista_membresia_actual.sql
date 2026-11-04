-- 002 · Ajuste de v_membresia_actual para alinearla con el backend
-- (MembresiasService / membresia.reglas.ts):
--   * "congelada" se calcula con congelamiento_membresia (fecha de hoy
--     dentro de un periodo), no con la columna estado.
--   * Los días de aviso "por vencer" salen de config_riesgo (sede o global).
--   * Se toma la última membresía NO cancelada (renovaciones anticipadas).
-- Ejecutar después de gimnasio_crm.sql.
USE gimnasio_crm;
GO

CREATE OR ALTER VIEW v_membresia_actual AS
WITH ultima AS (
  SELECT m.*, s.id_sede,
         ROW_NUMBER() OVER (PARTITION BY m.id_socio
                            ORDER BY m.fecha_vencimiento DESC, m.id_membresia DESC) AS rn
  FROM membresia m
  JOIN socio s ON s.id_socio = m.id_socio
  WHERE m.estado <> 'cancelada'
)
SELECT u.id_membresia, u.id_socio, u.id_plan, u.fecha_inicio, u.fecha_vencimiento,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM membresia mc
      JOIN congelamiento_membresia c ON c.id_membresia = mc.id_membresia
      WHERE mc.id_socio = u.id_socio AND mc.estado <> 'cancelada'
        AND CAST(GETDATE() AS DATE) BETWEEN c.fecha_inicio AND c.fecha_fin
    ) THEN 'congelada'
    WHEN u.fecha_vencimiento < CAST(GETDATE() AS DATE) THEN 'vencida'
    WHEN DATEDIFF(DAY, CAST(GETDATE() AS DATE), u.fecha_vencimiento) <= COALESCE(
      (SELECT cs.dias_aviso_vencimiento FROM config_riesgo cs WHERE cs.id_sede = u.id_sede AND cs.activa = 1),
      (SELECT cg.dias_aviso_vencimiento FROM config_riesgo cg WHERE cg.id_sede IS NULL AND cg.activa = 1),
      7) THEN 'por_vencer'
    ELSE 'activa'
  END AS estado_calculado,
  CASE WHEN u.fecha_vencimiento < CAST(GETDATE() AS DATE) THEN 0
       ELSE DATEDIFF(DAY, CAST(GETDATE() AS DATE), u.fecha_vencimiento) END AS dias_restantes
FROM ultima u
WHERE u.rn = 1;
GO
