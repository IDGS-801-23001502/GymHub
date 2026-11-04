package com.example.gymhub.data.remote

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface GymHubApi {
    @POST("app/auth/activar") suspend fun activar(@Body body: ActivarRequest): Tokens
    @POST("app/auth/login") suspend fun login(@Body body: LoginRequest): Tokens
    @POST("app/auth/recuperar") suspend fun recuperar(@Body body: RecuperarRequest): Mensaje
    @POST("app/auth/restablecer") suspend fun restablecer(@Body body: RestablecerRequest): Mensaje
    @POST("app/auth/logout") suspend fun logout(@Body body: LogoutRequest): Mensaje

    @GET("app/perfil") suspend fun perfil(): Perfil
    @PATCH("app/perfil") suspend fun actualizarPerfil(@Body body: ActualizarPerfilRequest): Perfil
    @GET("app/membresia") suspend fun membresia(): MembresiaDetalle
    @GET("app/credencial") suspend fun credencial(): Credencial
    @GET("app/rutina") suspend fun rutina(): RutinaRespuesta

    @GET("app/sesiones") suspend fun sesiones(@Query("desde") desde: String? = null, @Query("hasta") hasta: String? = null): Historial
    @POST("app/sesiones") suspend fun registrarSesion(@Body body: RegistrarSesionRequest): SesionRegistrada
    @GET("app/progreso") suspend fun progreso(@Query("desde") desde: String? = null, @Query("hasta") hasta: String? = null): Progreso

    // Sin ficha el backend responde 200 con cuerpo vacío
    @GET("app/ficha-salud") suspend fun fichaSalud(): okhttp3.ResponseBody
    @POST("app/ficha-salud") suspend fun guardarFicha(@Body body: GuardarFichaRequest): FichaSalud
    @GET("app/consentimientos") suspend fun consentimientos(): List<Consentimiento>
    @POST("app/consentimientos") suspend fun cambiarConsentimiento(@Body body: ConsentimientoRequest): List<Consentimiento>

    @POST("app/salud/sincronizar") suspend fun sincronizarSalud(@Body body: SincronizarSaludRequest): ResultadoSincronizacion
    @GET("app/salud/estado") suspend fun estadoSalud(): EstadoSalud

    @POST("app/dispositivos") suspend fun registrarDispositivo(@Body body: DispositivoRequest): Ok
    @GET("app/notificaciones") suspend fun notificaciones(): List<Notificacion>
    @PATCH("app/notificaciones/{id}/leida") suspend fun marcarLeida(@Path("id") id: Int): Ok
    @PATCH("app/notificaciones/{id}/entregada") suspend fun marcarEntregada(@Path("id") id: Int): Ok
    @GET("app/asistencias") suspend fun asistencias(): Asistencias
    @GET("app/notificaciones/preferencias") suspend fun preferencias(): List<Preferencia>
    @PUT("app/notificaciones/preferencias") suspend fun guardarPreferencias(@Body body: PreferenciasRequest): List<Preferencia>
}
