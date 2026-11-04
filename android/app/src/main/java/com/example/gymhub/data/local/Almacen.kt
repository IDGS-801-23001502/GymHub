package com.example.gymhub.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Clave-valor; en la app va cifrado y en las pruebas es un mapa en memoria. */
interface AlmacenClaveValor {
    fun leer(clave: String): String?
    fun guardar(clave: String, valor: String?)
    fun limpiar()
}

/** AES-256-GCM con IV aleatorio: guarda `iv(12) || cifrado+tag` en Base64. */
class CifradorAesGcm(private val llave: () -> SecretKey) {
    fun cifrar(texto: String, contexto: String): String {
        val c = Cipher.getInstance(TRANSFORMACION)
        c.init(Cipher.ENCRYPT_MODE, llave())
        // La clave del dato va como AAD: un valor copiado a otra clave no descifra
        c.updateAAD(contexto.toByteArray())
        return Base64.getEncoder().encodeToString(c.iv + c.doFinal(texto.toByteArray()))
    }

    fun descifrar(valor: String, contexto: String): String? = runCatching {
        val datos = Base64.getDecoder().decode(valor)
        val c = Cipher.getInstance(TRANSFORMACION)
        c.init(Cipher.DECRYPT_MODE, llave(), GCMParameterSpec(128, datos, 0, IV))
        c.updateAAD(contexto.toByteArray())
        String(c.doFinal(datos, IV, datos.size - IV))
    }.getOrNull()

    private companion object {
        const val TRANSFORMACION = "AES/GCM/NoPadding"
        const val IV = 12
    }
}

/**
 * APP-RNF-02: tokens y caché cifrados con una llave AES del Android Keystore (no exportable).
 * Reemplaza a EncryptedSharedPreferences, que Google marcó como obsoleto; lo guardado con la
 * versión anterior se migra una sola vez y el archivo viejo se borra.
 */
class AlmacenCifrado(private val context: Context, private val nombre: String) : AlmacenClaveValor {
    private val prefs: SharedPreferences = context.getSharedPreferences("${nombre}_v2", Context.MODE_PRIVATE)
    private val cifrador = CifradorAesGcm(::llave)

    init { migrar() }

    override fun leer(clave: String): String? = prefs.getString(clave, null)?.let { cifrador.descifrar(it, clave) }

    override fun guardar(clave: String, valor: String?) =
        prefs.edit { if (valor == null) remove(clave) else putString(clave, cifrador.cifrar(valor, clave)) }

    override fun limpiar() = prefs.edit { clear() }

    private fun llave(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generador = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generador.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generador.generateKey()
    }

    @Suppress("DEPRECATION")
    private fun migrar() {
        val archivo = java.io.File(context.applicationInfo.dataDir, "shared_prefs/$nombre.xml")
        if (!archivo.exists()) return
        runCatching {
            val viejo = androidx.security.crypto.EncryptedSharedPreferences.create(
                context,
                nombre,
                androidx.security.crypto.MasterKey.Builder(context)
                    .setKeyScheme(androidx.security.crypto.MasterKey.KeyScheme.AES256_GCM).build(),
                androidx.security.crypto.EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                androidx.security.crypto.EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
            viejo.all.forEach { (k, v) -> if (v is String) guardar(k, v) }
        }
        // Si no se pudo leer (llave perdida tras restaurar el teléfono) se empieza de cero
        context.deleteSharedPreferences(nombre)
    }

    private companion object {
        const val ALIAS = "gymhub_almacen"
    }
}

class AlmacenEnMemoria : AlmacenClaveValor {
    private val mapa = mutableMapOf<String, String>()
    override fun leer(clave: String) = synchronized(mapa) { mapa[clave] }
    override fun guardar(clave: String, valor: String?) {
        synchronized(mapa) { if (valor == null) mapa.remove(clave) else mapa[clave] = valor }
    }
    override fun limpiar() = synchronized(mapa) { mapa.clear() }
}

/** Tokens de la sesión del socio. `activa` avisa a la UI cuando la sesión expira. */
class SesionLocal(private val almacen: AlmacenClaveValor) {
    private val _activa = MutableStateFlow(almacen.leer(REFRESH) != null)
    val activa: StateFlow<Boolean> = _activa.asStateFlow()

    val accessToken: String? get() = almacen.leer(ACCESS)
    val refreshToken: String? get() = almacen.leer(REFRESH)
    val idSocio: Int? get() = almacen.leer(SOCIO)?.toIntOrNull()

    @Synchronized
    fun guardar(access: String, refresh: String, idSocio: Int) {
        almacen.guardar(ACCESS, access)
        almacen.guardar(REFRESH, refresh)
        almacen.guardar(SOCIO, idSocio.toString())
        _activa.value = true
    }

    @Synchronized
    fun cerrar() {
        almacen.guardar(ACCESS, null)
        almacen.guardar(REFRESH, null)
        almacen.guardar(SOCIO, null)
        _activa.value = false
    }

    private companion object {
        const val ACCESS = "access_token"
        const val REFRESH = "refresh_token"
        const val SOCIO = "id_socio"
    }
}
