package com.example.gymhub.ui.ajustes

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.Consentimiento
import com.example.gymhub.data.remote.Preferencia
import com.example.gymhub.push.Push
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class Ajustes(val consentimientos: List<Consentimiento>, val preferencias: List<Preferencia>)

class AjustesViewModel(private val repo: Repositorio) : ViewModel() {
    private val _estado = MutableStateFlow<Estado<Ajustes>>(Estado.Cargando)
    val estado: StateFlow<Estado<Ajustes>> = _estado.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init { cargar() }

    fun cargar() = viewModelScope.launch {
        _estado.value = Estado.Cargando
        _estado.value = try {
            val c = async { repo.consentimientos() }
            val p = async { repo.preferencias() }
            Estado.Listo(Ajustes(c.await(), p.await()))
        } catch (e: Exception) {
            Estado.Error(e.mensaje())
        }
    }

    /** APP-RF-10: cada cambio queda registrado con fecha en el backend. */
    fun consentimiento(tipo: String, otorgado: Boolean) = actualizar {
        it.copy(consentimientos = repo.cambiarConsentimiento(tipo, otorgado))
    }

    /** APP-RF-14: activar o silenciar cada categoría. */
    fun preferencia(categoria: String, habilitada: Boolean) = actualizar {
        it.copy(preferencias = repo.guardarPreferencias(listOf(Preferencia(categoria, habilitada))))
    }

    private fun actualizar(accion: suspend (Ajustes) -> Ajustes) = viewModelScope.launch {
        val actual = (_estado.value as? Estado.Listo)?.datos ?: return@launch
        _error.value = null
        try {
            _estado.value = Estado.Listo(accion(actual))
        } catch (e: Exception) {
            _error.value = e.mensaje()
        }
    }
}

private val TEXTOS_CONSENTIMIENTO = mapOf(
    "datos_salud" to ("Datos de salud" to "Tu ficha de salud para adaptar la rutina."),
    "notificaciones" to ("Notificaciones" to "Avisos de vencimiento, cambios de rutina y promociones."),
    "health_connect" to ("Health Connect" to "Pasos, frecuencia cardiaca y calorías de tu reloj."),
)

@Composable
fun AjustesScreen(onBack: () -> Unit) {
    val contexto = LocalContext.current
    val vm = vm { AjustesViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    // Android 13+ pide permiso para mostrar notificaciones
    val permisoNotif = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { concedido ->
        if (concedido) Push.registrar(contexto)
    }

    Pantalla("Privacidad y notificaciones", onBack = onBack) {
        ContenidoEstado(estado, { vm.cargar() }) { a, _ ->
            Subtitulo("Consentimientos")
            Tarjeta {
                a.consentimientos.forEach { c ->
                    val (titulo, detalle) = TEXTOS_CONSENTIMIENTO[c.tipo] ?: (etiqueta(c.tipo) to "")
                    Interruptor(titulo, detalle + (c.fecha?.let { "\nÚltimo cambio: ${fechaHora(it)}" } ?: ""), c.otorgado) { v ->
                        vm.consentimiento(c.tipo, v)
                        if (c.tipo == "notificaciones" && v) {
                            if (Build.VERSION.SDK_INT >= 33) permisoNotif.launch(Manifest.permission.POST_NOTIFICATIONS)
                            else Push.registrar(contexto)
                        }
                    }
                }
            }
            val notificaciones = a.consentimientos.firstOrNull { it.tipo == "notificaciones" }?.otorgado == true
            Subtitulo("Qué quiero recibir")
            Tarjeta {
                if (!notificaciones) Text("Activa las notificaciones para elegir categorías.", color = TextGray, fontSize = 13.sp)
                a.preferencias.forEach { p ->
                    Interruptor(Push.CANALES[p.categoria] ?: etiqueta(p.categoria), null, p.habilitada, habilitado = notificaciones) {
                        vm.preferencia(p.categoria, it)
                    }
                }
            }
            if (!Push.disponible(contexto)) {
                Text("Esta compilación no incluye Firebase; las notificaciones push están desactivadas.", color = WarningAmber, fontSize = 12.sp)
            }
            error?.let { Text(it, color = ErrorRed) }
        }
    }
}

@Composable
private fun Interruptor(titulo: String, detalle: String?, valor: Boolean, habilitado: Boolean = true, onCambio: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(titulo, color = if (habilitado) TextWhite else TextGray, fontWeight = FontWeight.SemiBold)
            detalle?.takeIf { it.isNotBlank() }?.let { Text(it, color = TextGray, fontSize = 12.sp) }
        }
        Switch(valor, onCambio, enabled = habilitado, colors = SwitchDefaults.colors(checkedTrackColor = PrimaryPurple))
    }
}
