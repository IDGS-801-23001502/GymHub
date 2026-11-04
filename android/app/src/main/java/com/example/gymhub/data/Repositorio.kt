package com.example.gymhub.data

import com.example.gymhub.data.local.AlmacenClaveValor
import com.example.gymhub.data.local.SesionLocal
import com.example.gymhub.data.remote.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer

/** Un dato y si viene de la copia local (sin conexión). */
data class Datos<T>(val valor: T, val deCache: Boolean = false, val actualizado: Long? = null)

/** Única puerta de la UI hacia la API, la caché offline y la cola de sesiones. */
class Repositorio(
    private val api: GymHubApi,
    private val sesion: SesionLocal,
    private val cache: AlmacenClaveValor,
    private val dispositivo: String,
    private val reloj: () -> Long = System::currentTimeMillis,
) {
    private val mutexCola = Mutex()
    private val _pendientes = MutableStateFlow(leerCola().size)
    /** Sesiones registradas sin conexión que faltan por subir (APP-RF-07). */
    val pendientes: StateFlow<Int> = _pendientes.asStateFlow()

    val sesionActiva get() = sesion.activa

    // --- Acceso (APP-RF-01, APP-RF-03)

    suspend fun activar(folio: String, correo: String, password: String) {
        val t = llamar { api.activar(ActivarRequest(folio.trim().uppercase(), correo.trim(), password, dispositivo)) }
        sesion.guardar(t.access_token, t.refresh_token, t.id_socio)
    }

    suspend fun login(correo: String, password: String) {
        val t = llamar { api.login(LoginRequest(correo.trim(), password, dispositivo)) }
        // Otro socio en el mismo teléfono no debe ver la caché del anterior
        if (cache.leer(CLAVE_SOCIO) != t.id_socio.toString()) cache.limpiar()
        cache.guardar(CLAVE_SOCIO, t.id_socio.toString())
        sesion.guardar(t.access_token, t.refresh_token, t.id_socio)
        _pendientes.value = leerCola().size
    }

    suspend fun recuperar(correo: String): String =
        llamar { api.recuperar(RecuperarRequest(correo.trim())) }.mensaje ?: "Revisa tu correo."

    suspend fun restablecer(token: String, password: String): String =
        llamar { api.restablecer(RestablecerRequest(token.trim(), password)) }.mensaje ?: "Contraseña actualizada."

    /** Revoca el refresh token y desactiva el token push; la caché se borra aunque no haya red. */
    suspend fun cerrarSesion() {
        // Lo que quedó en la cola se intenta subir antes de borrar la copia local
        runCatching { enviarPendientes() }
        val refresh = sesion.refreshToken
        if (refresh != null) {
            runCatching { llamar { api.logout(LogoutRequest(refresh, cache.leer(CLAVE_FCM))) } }
        }
        cache.limpiar()
        sesion.cerrar()
        _pendientes.value = 0
    }

    // --- Consultas con copia offline (APP-RF-02, 04, 05, 06)

    suspend fun perfil() = conCache("perfil", Perfil.serializer()) { api.perfil() }
    suspend fun membresia() = conCache("membresia", MembresiaDetalle.serializer()) { api.membresia() }
    suspend fun credencial() = conCache("credencial", Credencial.serializer()) { api.credencial() }
    suspend fun rutina() = conCache("rutina", RutinaRespuesta.serializer()) { api.rutina() }
    suspend fun progreso() = conCache("progreso", Progreso.serializer()) { api.progreso() }

    suspend fun actualizarPerfil(req: ActualizarPerfilRequest): Perfil {
        val p = llamar { api.actualizarPerfil(req) }
        val previo = leerCache("perfil", Perfil.serializer())
        // El PATCH no trae la sede; se conserva la de la copia local
        guardarCache("perfil", Perfil.serializer(), p.copy(sede = p.sede ?: previo?.sede))
        return p
    }

    suspend fun historial(desde: String? = null, hasta: String? = null) = llamar { api.sesiones(desde, hasta) }

    // --- Registro de sesiones con cola offline (APP-RF-07)

    /** Guarda la sesión en la cola y trata de subirla; si no hay red se sube después. */
    suspend fun registrarSesion(req: RegistrarSesionRequest): Boolean {
        mutexCola.withLock {
            val cola = leerCola()
            if (cola.none { it.uuid_cliente == req.uuid_cliente }) escribirCola(cola + req)
        }
        return enviarPendientes() == 0
    }

    /** Sube la cola en orden. Devuelve cuántas quedan. Los rechazos de validación se descartan. */
    suspend fun enviarPendientes(): Int = mutexCola.withLock {
        val cola = leerCola().toMutableList()
        val iterador = cola.iterator()
        while (iterador.hasNext()) {
            val s = iterador.next()
            try {
                llamar { api.registrarSesion(s) }
                iterador.remove()
            } catch (e: ApiException) {
                // 400/404: el servidor no la aceptará nunca; 401 o 5xx: se reintenta luego
                if (e.status in 400..499 && e.status != 401 && e.status != 408 && e.status != 429) iterador.remove() else break
            } catch (_: SinConexionException) {
                break
            }
        }
        escribirCola(cola)
        cola.size
    }

    // --- Salud y consentimientos (APP-RF-09 a APP-RF-12)

    suspend fun fichaSalud(): FichaSalud? {
        val cuerpo = llamar { api.fichaSalud() }.string()
        return if (cuerpo.isBlank() || cuerpo == "null") null else JsonGymHub.decodeFromString(FichaSalud.serializer(), cuerpo)
    }

    suspend fun guardarFicha(req: GuardarFichaRequest) = llamar { api.guardarFicha(req) }
    suspend fun consentimientos() = llamar { api.consentimientos() }
    suspend fun cambiarConsentimiento(tipo: String, otorgado: Boolean) =
        llamar { api.cambiarConsentimiento(ConsentimientoRequest(tipo, otorgado)) }

    /** Sube en lotes de 500 (el backend acepta hasta 2000 por petición). */
    suspend fun sincronizarSalud(datos: List<DatoSalud>): Int {
        var nuevos = 0
        for (lote in datos.chunked(500)) nuevos += llamar { api.sincronizarSalud(SincronizarSaludRequest(lote)) }.nuevos
        if (datos.isEmpty()) llamar { api.sincronizarSalud(SincronizarSaludRequest(emptyList())) }
        return nuevos
    }

    suspend fun estadoSalud() = llamar { api.estadoSalud() }

    // --- Notificaciones (APP-RF-13, APP-RF-14)

    suspend fun registrarDispositivo(token: String) {
        cache.guardar(CLAVE_FCM, token)
        if (sesion.activa.value) llamar { api.registrarDispositivo(DispositivoRequest(token)) }
    }

    fun tokenPushGuardado(): String? = cache.leer(CLAVE_FCM)

    suspend fun notificaciones() = llamar { api.notificaciones() }
    suspend fun marcarLeida(id: Int) = llamar { api.marcarLeida(id) }
    /** Acuse de recibo del push: la campaña lo cuenta como "entregado". */
    suspend fun marcarEntregada(id: Int) = llamar { api.marcarEntregada(id) }
    suspend fun asistencias() = llamar { api.asistencias() }
    suspend fun preferencias() = llamar { api.preferencias() }
    suspend fun guardarPreferencias(p: List<Preferencia>) = llamar { api.guardarPreferencias(PreferenciasRequest(p)) }

    // --- Caché

    private suspend fun <T> conCache(clave: String, serializer: KSerializer<T>, bloque: suspend () -> T): Datos<T> = try {
        val valor = llamar { bloque() }
        guardarCache(clave, serializer, valor)
        Datos(valor, deCache = false, actualizado = reloj())
    } catch (e: SinConexionException) {
        val copia = leerCache(clave, serializer) ?: throw e
        Datos(copia, deCache = true, actualizado = cache.leer("$clave.t")?.toLongOrNull())
    }

    private fun <T> guardarCache(clave: String, serializer: KSerializer<T>, valor: T) {
        cache.guardar(clave, JsonGymHub.encodeToString(serializer, valor))
        cache.guardar("$clave.t", reloj().toString())
    }

    private fun <T> leerCache(clave: String, serializer: KSerializer<T>): T? =
        cache.leer(clave)?.let { runCatching { JsonGymHub.decodeFromString(serializer, it) }.getOrNull() }

    private fun leerCola(): List<RegistrarSesionRequest> =
        leerCache(CLAVE_COLA, ListSerializer(RegistrarSesionRequest.serializer())) ?: emptyList()

    private fun escribirCola(cola: List<RegistrarSesionRequest>) {
        cache.guardar(CLAVE_COLA, JsonGymHub.encodeToString(ListSerializer(RegistrarSesionRequest.serializer()), cola))
        _pendientes.value = cola.size
    }

    private companion object {
        const val CLAVE_COLA = "cola_sesiones"
        const val CLAVE_FCM = "fcm_token"
        const val CLAVE_SOCIO = "socio_cache"
    }
}
