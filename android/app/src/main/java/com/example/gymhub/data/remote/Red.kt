package com.example.gymhub.data.remote

import com.example.gymhub.data.local.SesionLocal
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.io.IOException
import java.util.concurrent.TimeUnit

val JsonGymHub = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
}

/** Error de la API con el mensaje que manda el backend, listo para mostrarse. */
class ApiException(val status: Int, override val message: String) : Exception(message)

/** Sin red: la operación puede reintentarse más tarde. */
class SinConexionException : Exception("Sin conexión con el servidor.")

/** Convierte las excepciones de Retrofit/OkHttp en mensajes legibles. */
suspend fun <T> llamar(bloque: suspend () -> T): T = try {
    bloque()
} catch (e: HttpException) {
    throw ApiException(e.code(), mensajeDeError(e.response()?.errorBody()?.string(), e.code()))
} catch (e: IOException) {
    throw SinConexionException()
}

fun mensajeDeError(cuerpo: String?, status: Int): String {
    val porDefecto = when (status) {
        401 -> "Tu sesión expiró. Vuelve a iniciar sesión."
        403 -> "No tienes permiso para esta acción."
        404 -> "No encontrado."
        in 500..599 -> "El servidor no está disponible. Intenta más tarde."
        else -> "Ocurrió un error ($status)."
    }
    if (cuerpo.isNullOrBlank()) return porDefecto
    return try {
        when (val m = JsonGymHub.decodeFromString(ErrorApi.serializer(), cuerpo).message) {
            is JsonPrimitive -> m.contentOrNull ?: porDefecto
            is JsonArray -> m.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.joinToString("\n").ifBlank { porDefecto }
            else -> porDefecto
        }
    } catch (_: Exception) {
        porDefecto
    }
}

/**
 * Cuando el access token vence (401), pide uno nuevo con el refresh token y repite la petición.
 * Si el refresh también falla, cierra la sesión local.
 */
class RefrescoTokens(private val baseUrl: String, private val sesion: SesionLocal, private val cliente: OkHttpClient) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        if (response.request.url.encodedPath.contains("/app/auth/") || response.priorResponse != null) return null
        val usado = response.request.header("Authorization")?.removePrefix("Bearer ")
        synchronized(this) {
            val actual = sesion.accessToken
            // Otro hilo ya lo renovó
            if (actual != null && actual != usado) return conToken(response.request, actual)
            val refresh = sesion.refreshToken ?: return null
            val peticion = Request.Builder()
                .url(baseUrl + "app/auth/refresh")
                .post(JsonGymHub.encodeToString(RefreshRequest.serializer(), RefreshRequest(refresh)).toRequestBody(JSON))
                .build()
            return try {
                cliente.newCall(peticion).execute().use { r ->
                    if (r.isSuccessful) {
                        val t = JsonGymHub.decodeFromString(Tokens.serializer(), r.body!!.string())
                        sesion.guardar(t.access_token, t.refresh_token, t.id_socio)
                        conToken(response.request, t.access_token)
                    } else {
                        // Refresh revocado o vencido: hay que volver a iniciar sesión
                        if (r.code == 401) sesion.cerrar()
                        null
                    }
                }
            } catch (_: IOException) {
                null
            }
        }
    }

    private fun conToken(req: Request, token: String) = req.newBuilder().header("Authorization", "Bearer $token").build()

    companion object {
        val JSON = "application/json".toMediaType()
    }
}

class ClienteApi(baseUrl: String, sesion: SesionLocal, depurar: Boolean, reintentarConexion: Boolean = true) {
    private val base = OkHttpClient.Builder()
        .retryOnConnectionFailure(reintentarConexion)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    val http: OkHttpClient = base.newBuilder()
        .addInterceptor { chain ->
            val req = chain.request()
            val token = sesion.accessToken
            val publica = req.url.encodedPath.contains("/app/auth/") && !req.url.encodedPath.endsWith("/logout")
            chain.proceed(if (token != null && !publica) req.newBuilder().header("Authorization", "Bearer $token").build() else req)
        }
        .authenticator(RefrescoTokens(baseUrl, sesion, base))
        .apply {
            // Nunca se registran cuerpos: llevan datos personales y de salud
            if (depurar) addInterceptor(HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC })
        }
        .build()

    val api: GymHubApi = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(http)
        .addConverterFactory(JsonGymHub.asConverterFactory(RefrescoTokens.JSON))
        .build()
        .create(GymHubApi::class.java)
}
