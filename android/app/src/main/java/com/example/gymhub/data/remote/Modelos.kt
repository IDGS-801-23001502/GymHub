package com.example.gymhub.data.remote

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// Espejo de las respuestas de /app/* del backend. Los campos que la app no usa se ignoran.

@Serializable
data class ActivarRequest(val folio: String, val correo: String, val password: String, val dispositivo: String? = null)

@Serializable
data class LoginRequest(val correo: String, val password: String, val dispositivo: String? = null)

@Serializable
data class RefreshRequest(val refresh_token: String)

@Serializable
data class LogoutRequest(val refresh_token: String, val fcm_token: String? = null)

@Serializable
data class RecuperarRequest(val correo: String)

@Serializable
data class RestablecerRequest(val token: String, val password: String)

@Serializable
data class Tokens(val access_token: String, val refresh_token: String, val id_socio: Int)

@Serializable
data class Mensaje(val mensaje: String? = null)

@Serializable
data class ContactoEmergencia(val nombre: String = "", val parentesco: String = "", val telefono: String = "")

@Serializable
data class Referencia(val id_plan: Int? = null, val id_sede: Int? = null, val id_usuario: Int? = null, val nombre: String? = null)

@Serializable
data class MembresiaResumen(
    val id_membresia: Int? = null,
    val plan: Plan? = null,
    val estado: String = "sin_membresia",
    val fecha_inicio: String? = null,
    val vigente_hasta: String? = null,
    val dias_restantes: Int? = null,
)

@Serializable
data class Plan(val id_plan: Int, val nombre: String, val tipo: String? = null, val duracion_dias: Int? = null)

@Serializable
data class Perfil(
    val id_socio: Int,
    val folio: String,
    val nombre: String,
    val fecha_nacimiento: String? = null,
    val edad: Int? = null,
    val telefono: String? = null,
    val correo: String? = null,
    val contacto_emergencia: ContactoEmergencia? = null,
    val foto_url: String? = null,
    val objetivo: String? = null,
    val estado: String = "activo",
    val fecha_alta: String? = null,
    val membresia: MembresiaResumen? = null,
    val sede: Referencia? = null,
)

@Serializable
data class ActualizarPerfilRequest(
    val telefono: String? = null,
    val correo: String? = null,
    val contacto_emergencia: ContactoEmergencia? = null,
)

@Serializable
data class Pago(val id_pago: Int, val folio: String, val monto: Double, val metodo: String, val estado: String, val fecha_pago: String)

@Serializable
data class Congelamiento(val fecha_inicio: String, val fecha_fin: String, val motivo: String? = null)

@Serializable
data class MembresiaHistorica(
    val id_membresia: Int,
    val plan: Plan,
    val fecha_inicio: String,
    val fecha_vencimiento: String,
    val estado: String,
    val es_renovacion: Boolean = false,
    val congelamientos: List<Congelamiento> = emptyList(),
    val pagos: List<Pago> = emptyList(),
)

@Serializable
data class MembresiaDetalle(val resumen: MembresiaResumen? = null, val membresias: List<MembresiaHistorica> = emptyList())

@Serializable
data class Credencial(
    val folio: String,
    val nombre: String,
    val foto_url: String? = null,
    val sede: String? = null,
    val estado_membresia: String,
    val vigente_hasta: String? = null,
    val qr: String,
    val valida: Boolean,
)

@Serializable
data class EjercicioRutina(
    val id_ejercicio: String,
    val nombre: String,
    val series: Int,
    val repeticiones: String,
    val descanso_seg: Int = 0,
    val notas: String? = null,
)

@Serializable
data class Bloque(val tipo: String, val orden: Int, val ejercicios: List<EjercicioRutina>)

@Serializable
data class VersionActual(val numero_version: Int, val fecha: String, val motivo: String? = null)

@Serializable
data class PlantillaRef(val id: String, val nombre: String)

@Serializable
data class Rutina(
    val id_rutina: Int,
    val estado: String,
    val plantilla: PlantillaRef? = null,
    val entrenador: Referencia? = null,
    val sesiones_planeadas_semana: Int,
    val fecha_inicio: String,
    val version_actual: VersionActual,
    val bloques: List<Bloque>,
)

@Serializable
data class RutinaRespuesta(val vigente: Rutina? = null)

@Serializable
data class SerieRealizada(val repeticiones: Int, val carga_kg: Double? = null, val completada: Boolean = true)

@Serializable
data class EjercicioRealizado(val id_ejercicio: String? = null, val nombre: String, val series: List<SerieRealizada>)

@Serializable
data class DetalleSesion(val ejercicios: List<EjercicioRealizado> = emptyList())

@Serializable
data class RegistrarSesionRequest(
    val uuid_cliente: String,
    val id_rutina: Int? = null,
    val numero_version: Int? = null,
    val fecha_inicio: String,
    val fecha_fin: String? = null,
    val duracion_min: Int? = null,
    val ejercicios: List<EjercicioRealizado>,
    val completada: Boolean,
    val calorias: Double? = null,
    val fc_promedio: Int? = null,
    val fc_maxima: Int? = null,
    val pasos: Int? = null,
)

@Serializable
data class SesionRegistrada(val id_sesion: Int, val duplicada: Boolean)

@Serializable
data class SesionHistorial(
    val id_sesion: Int,
    val fecha_inicio: String,
    val fecha_fin: String? = null,
    val duracion_min: Int? = null,
    val completada: Boolean,
    val calorias: Double? = null,
    val fc_promedio: Int? = null,
    val fc_maxima: Int? = null,
    val numero_version: Int? = null,
    val detalle: DetalleSesion? = null,
)

@Serializable
data class ResumenSesiones(
    val sesiones_planeadas: Int = 0,
    val sesiones_cumplidas: Int = 0,
    val adherencia: Int? = null,
    val minutos_totales: Int = 0,
    val calorias_totales: Int = 0,
)

@Serializable
data class Historial(val desde: String, val hasta: String, val resumen: ResumenSesiones, val sesiones: List<SesionHistorial>)

@Serializable
data class SemanaProgreso(val inicio: String, val planeadas: Int, val cumplidas: Int, val adherencia: Int? = null)

@Serializable
data class MesProgreso(val mes: String, val planeadas: Int, val cumplidas: Int, val adherencia: Int? = null)

@Serializable
data class SesionProgreso(
    val fecha: String,
    val calorias: Double? = null,
    val fc_promedio: Int? = null,
    val duracion_min: Int? = null,
    val completada: Boolean,
)

@Serializable
data class ResumenProgreso(
    val sesiones_cumplidas: Int,
    val sesiones_planeadas: Int,
    val adherencia: Int? = null,
    val calorias_totales: Int,
    val minutos_totales: Int,
    val dias_entrenados: Int,
)

@Serializable
data class Logros(val racha_semanas: Int, val semanas_cumplidas: Int)

@Serializable
data class Progreso(
    val desde: String,
    val hasta: String,
    val resumen: ResumenProgreso,
    val semanas: List<SemanaProgreso>,
    val meses: List<MesProgreso>,
    val sesiones: List<SesionProgreso>,
    val logros: Logros,
)

@Serializable
data class FichaSalud(
    val version: Int,
    val antecedentes: String? = null,
    val lesiones: String? = null,
    val alergias: String? = null,
    val medicamentos: String? = null,
    val nivel_actividad: String? = null,
    val objetivo: String? = null,
    val restricciones_rutina: List<String> = emptyList(),
    val borrador: Boolean = false,
    val creado_en: String? = null,
)

@Serializable
data class GuardarFichaRequest(
    val antecedentes: String? = null,
    val lesiones: String? = null,
    val alergias: String? = null,
    val medicamentos: String? = null,
    val nivel_actividad: String? = null,
    val objetivo: String? = null,
    val restricciones_rutina: List<String> = emptyList(),
    val borrador: Boolean,
    val acepta_tratamiento_datos_salud: Boolean? = null,
)

@Serializable
data class Consentimiento(val tipo: String, val otorgado: Boolean, val fecha: String? = null)

@Serializable
data class ConsentimientoRequest(val tipo: String, val otorgado: Boolean)

@Serializable
data class DatoSalud(val tipo: String, val valor: Double, val inicio: String, val fin: String)

@Serializable
data class SincronizarSaludRequest(val datos: List<DatoSalud>)

@Serializable
data class ResultadoSincronizacion(val recibidos: Int, val nuevos: Int, val ultima_sincronizacion: String? = null)

@Serializable
data class EstadoSalud(val ultima_sincronizacion: String? = null)

@Serializable
data class DispositivoRequest(val fcm_token: String)

@Serializable
data class Notificacion(
    val id_notificacion: Int,
    val categoria: String,
    val origen: String? = null,
    val titulo: String,
    val contenido: String,
    val creada_en: String,
    val leida_en: String? = null,
)

@Serializable
data class Preferencia(val categoria: String, val habilitada: Boolean)

@Serializable
data class PreferenciasRequest(val preferencias: List<Preferencia>)

@Serializable
data class Ok(val ok: Boolean? = null, val actualizada: Boolean? = null)

@Serializable
data class Visita(
    val id_asistencia: Long,
    val fecha_hora: String,
    val sede: String,
    val metodo_registro: String,
    val estado_membresia: String,
)

/** Entradas registradas en recepción (CRM-RF-11). */
@Serializable
data class Asistencias(val visitas_30_dias: Int, val ultima_visita: String? = null, val registros: List<Visita> = emptyList())

/** Cuerpo de error de NestJS: `message` puede ser texto o lista de textos. */
@Serializable
data class ErrorApi(val message: JsonElement? = null, val statusCode: Int? = null)
