package com.example.gymhub.ui.acceso

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.gymhub.data.Repositorio
import com.example.gymhub.ui.componentes.mensaje
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Mismas reglas que valida el backend, para avisar antes de enviar. */
object Validacion {
    private val CORREO = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    private val FOLIO = Regex("^GH\\d{6,}$")

    fun correo(v: String): String? = if (CORREO.matches(v.trim())) null else "Escribe un correo válido."

    fun folio(v: String): String? = if (FOLIO.matches(v.trim().uppercase())) null else "El folio viene en tu comprobante (ej. GH000123)."

    fun password(v: String): String? {
        val ok = v.length >= 10 && v.any { it.isLowerCase() } && v.any { it.isUpperCase() } &&
            v.any { it.isDigit() } && v.any { !it.isLetterOrDigit() }
        return if (ok) null else "Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo."
    }

    fun confirmacion(a: String, b: String): String? = if (a == b) null else "Las contraseñas no coinciden."
}

data class AccesoUi(
    val cargando: Boolean = false,
    val error: String? = null,
    val aviso: String? = null,
    val errores: Map<String, String> = emptyMap(),
    /** Recuperación: false = pedir correo, true = capturar el código recibido. */
    val codigoEnviado: Boolean = false,
)

class AccesoViewModel(private val repo: Repositorio) : ViewModel() {
    private val _ui = MutableStateFlow(AccesoUi())
    val ui: StateFlow<AccesoUi> = _ui.asStateFlow()

    fun limpiar() = _ui.update { AccesoUi(codigoEnviado = it.codigoEnviado) }

    fun login(correo: String, password: String) {
        val errores = buildMap {
            Validacion.correo(correo)?.let { put("correo", it) }
            if (password.isEmpty()) put("password", "Escribe tu contraseña.")
        }
        ejecutar(errores) { repo.login(correo, password) }
    }

    fun activar(folio: String, correo: String, password: String, confirmar: String) {
        val errores = buildMap {
            Validacion.folio(folio)?.let { put("folio", it) }
            Validacion.correo(correo)?.let { put("correo", it) }
            Validacion.password(password)?.let { put("password", it) }
            Validacion.confirmacion(password, confirmar)?.let { put("confirmar", it) }
        }
        ejecutar(errores) { repo.activar(folio, correo, password) }
    }

    fun recuperar(correo: String) {
        val errores = buildMap { Validacion.correo(correo)?.let { put("correo", it) } }
        ejecutar(errores) {
            val msg = repo.recuperar(correo)
            _ui.update { it.copy(codigoEnviado = true, aviso = msg) }
        }
    }

    fun restablecer(codigo: String, password: String, confirmar: String, onListo: () -> Unit) {
        val errores = buildMap {
            if (codigo.trim().length < 20) put("codigo", "Pega el código completo que recibiste.")
            Validacion.password(password)?.let { put("password", it) }
            Validacion.confirmacion(password, confirmar)?.let { put("confirmar", it) }
        }
        ejecutar(errores) {
            repo.restablecer(codigo, password)
            _ui.value = AccesoUi(aviso = "Contraseña actualizada. Ya puedes iniciar sesión.")
            onListo()
        }
    }

    fun volverAPedirCodigo() = _ui.update { AccesoUi() }

    private fun ejecutar(errores: Map<String, String>, accion: suspend () -> Unit) {
        if (errores.isNotEmpty()) {
            _ui.update { it.copy(errores = errores, error = null) }
            return
        }
        _ui.update { it.copy(cargando = true, error = null, errores = emptyMap(), aviso = null) }
        viewModelScope.launch {
            try {
                accion()
                _ui.update { it.copy(cargando = false) }
            } catch (e: Exception) {
                _ui.update { it.copy(cargando = false, error = e.mensaje()) }
            }
        }
    }
}
