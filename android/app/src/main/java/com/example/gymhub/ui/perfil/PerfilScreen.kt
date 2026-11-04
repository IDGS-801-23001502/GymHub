package com.example.gymhub.ui.perfil

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.ActualizarPerfilRequest
import com.example.gymhub.data.remote.ContactoEmergencia
import com.example.gymhub.data.remote.Perfil
import com.example.gymhub.ui.acceso.Validacion
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import com.example.gymhub.work.SincronizacionWorker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class EdicionPerfil(
    val telefono: String = "",
    val correo: String = "",
    val contactoNombre: String = "",
    val contactoParentesco: String = "",
    val contactoTelefono: String = "",
) {
    fun errores(): Map<String, String> = buildMap {
        if (!Regex("^\\d{10}$").matches(telefono)) put("telefono", "10 dígitos.")
        Validacion.correo(correo)?.let { put("correo", it) }
        if (contactoNombre.isBlank()) put("contactoNombre", "Obligatorio.")
        if (contactoParentesco.isBlank()) put("contactoParentesco", "Obligatorio.")
        if (!Regex("^\\d{10}$").matches(contactoTelefono)) put("contactoTelefono", "10 dígitos.")
    }

    companion object {
        fun de(p: Perfil) = EdicionPerfil(
            p.telefono.orEmpty(), p.correo.orEmpty(),
            p.contacto_emergencia?.nombre.orEmpty(), p.contacto_emergencia?.parentesco.orEmpty(), p.contacto_emergencia?.telefono.orEmpty(),
        )
    }
}

data class PerfilUi(
    val estado: Estado<Perfil> = Estado.Cargando,
    val edicion: EdicionPerfil? = null,
    val errores: Map<String, String> = emptyMap(),
    val guardando: Boolean = false,
    val error: String? = null,
)

class PerfilViewModel(private val repo: Repositorio) : ViewModel() {
    private val _ui = MutableStateFlow(PerfilUi())
    val ui: StateFlow<PerfilUi> = _ui.asStateFlow()

    init { cargar() }

    fun cargar() = viewModelScope.launch {
        _ui.update { it.copy(estado = Estado.Cargando) }
        val e = try {
            repo.perfil().let { Estado.Listo(it.valor, it.deCache) }
        } catch (ex: Exception) {
            Estado.Error(ex.mensaje())
        }
        _ui.update { it.copy(estado = e) }
    }

    fun editar() {
        val p = (_ui.value.estado as? Estado.Listo)?.datos ?: return
        _ui.update { it.copy(edicion = EdicionPerfil.de(p), errores = emptyMap(), error = null) }
    }

    fun cancelar() = _ui.update { it.copy(edicion = null) }

    fun cambiar(cambio: EdicionPerfil.() -> EdicionPerfil) = _ui.update { it.copy(edicion = it.edicion?.cambio()) }

    /** APP-RF-02: solo teléfono, correo y contacto de emergencia; el resto lo cambia recepción. */
    fun guardar() {
        val e = _ui.value.edicion ?: return
        val errores = e.errores()
        if (errores.isNotEmpty()) {
            _ui.update { it.copy(errores = errores) }
            return
        }
        _ui.update { it.copy(guardando = true, errores = emptyMap(), error = null) }
        viewModelScope.launch {
            try {
                val p = repo.actualizarPerfil(
                    ActualizarPerfilRequest(
                        telefono = e.telefono,
                        correo = e.correo.trim(),
                        contacto_emergencia = ContactoEmergencia(e.contactoNombre.trim(), e.contactoParentesco.trim(), e.contactoTelefono),
                    )
                )
                val previo = (_ui.value.estado as? Estado.Listo)?.datos
                _ui.update { it.copy(estado = Estado.Listo(p.copy(sede = p.sede ?: previo?.sede)), edicion = null, guardando = false) }
            } catch (ex: Exception) {
                _ui.update { it.copy(guardando = false, error = ex.mensaje()) }
            }
        }
    }

    fun cerrarSesion(alTerminar: () -> Unit) = viewModelScope.launch {
        repo.cerrarSesion()
        alTerminar()
    }
}

@Composable
fun PerfilScreen(
    onFichaSalud: () -> Unit,
    onHealthConnect: () -> Unit,
    onAjustes: () -> Unit,
    onMembresia: () -> Unit,
) {
    val contexto = LocalContext.current.applicationContext
    val vm = vm { PerfilViewModel(it) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    var confirmarSalida by remember { mutableStateOf(false) }

    Pantalla("Mi perfil") {
        ContenidoEstado(ui.estado, { vm.cargar() }) { p, offline ->
            AvisoOffline(offline)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.size(64.dp).clip(CircleShape).background(PrimaryPurple.copy(alpha = 0.3f)), contentAlignment = Alignment.Center) {
                    if (p.foto_url != null) AsyncImage(urlArchivo(p.foto_url), "Foto", Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                    else Text(p.nombre.take(1), color = TextWhite, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                }
                Column {
                    Text(p.nombre, color = TextWhite, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Text("Folio ${p.folio}${p.sede?.nombre?.let { " · $it" } ?: ""}", color = TextGray, fontSize = 14.sp)
                }
            }

            val ed = ui.edicion
            if (ed == null) {
                Tarjeta {
                    Fila("Teléfono", p.telefono ?: "—")
                    Fila("Correo", p.correo ?: "—")
                    Fila("Contacto de emergencia", p.contacto_emergencia?.let { "${it.nombre} (${it.parentesco}) · ${it.telefono}" } ?: "—")
                    Fila("Objetivo", p.objetivo?.let(::etiqueta) ?: "—")
                    TextButton(onClick = vm::editar, contentPadding = PaddingValues(0.dp)) { Text("Editar datos de contacto", color = Purple80) }
                }
            } else {
                Tarjeta(borde = PrimaryPurple) {
                    Campo(ed.telefono, { v -> vm.cambiar { copy(telefono = v.filter(Char::isDigit).take(10)) } }, "Teléfono", teclado = KeyboardType.Phone, error = ui.errores["telefono"])
                    Campo(ed.correo, { v -> vm.cambiar { copy(correo = v) } }, "Correo", teclado = KeyboardType.Email, error = ui.errores["correo"])
                    Text("Contacto de emergencia", color = TextGray, fontSize = 13.sp)
                    Campo(ed.contactoNombre, { v -> vm.cambiar { copy(contactoNombre = v) } }, "Nombre", error = ui.errores["contactoNombre"])
                    Campo(ed.contactoParentesco, { v -> vm.cambiar { copy(contactoParentesco = v) } }, "Parentesco", error = ui.errores["contactoParentesco"])
                    Campo(ed.contactoTelefono, { v -> vm.cambiar { copy(contactoTelefono = v.filter(Char::isDigit).take(10)) } }, "Teléfono", teclado = KeyboardType.Phone, error = ui.errores["contactoTelefono"])
                    ui.error?.let { Text(it, color = ErrorRed) }
                    BotonPrimario("Guardar", vm::guardar, cargando = ui.guardando)
                    TextButton(onClick = vm::cancelar) { Text("Cancelar", color = TextGray) }
                }
            }

            Tarjeta {
                Opcion(Icons.Default.CardMembership, "Membresía y pagos", onMembresia)
                Opcion(Icons.Default.HealthAndSafety, "Ficha de salud", onFichaSalud)
                Opcion(Icons.Default.Favorite, "Health Connect", onHealthConnect)
                Opcion(Icons.Default.Settings, "Privacidad y notificaciones", onAjustes)
            }
            OutlinedButton(onClick = { confirmarSalida = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.AutoMirrored.Filled.Logout, null, tint = ErrorRed)
                Spacer(Modifier.width(8.dp))
                Text("Cerrar sesión", color = ErrorRed)
            }
        }
    }

    if (confirmarSalida) {
        AlertDialog(
            onDismissRequest = { confirmarSalida = false },
            title = { Text("Cerrar sesión") },
            text = { Text("Se borrarán de este teléfono tu rutina y datos guardados.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmarSalida = false
                    vm.cerrarSesion { SincronizacionWorker.cancelar(contexto) }
                }) { Text("Cerrar sesión", color = ErrorRed) }
            },
            dismissButton = { TextButton(onClick = { confirmarSalida = false }) { Text("Cancelar") } },
            containerColor = SurfaceDark,
        )
    }
}

@Composable
private fun Fila(titulo: String, valor: String) {
    Column {
        Text(titulo, color = TextGray, fontSize = 12.sp)
        Text(valor, color = TextWhite)
    }
}

@Composable
private fun Opcion(icono: ImageVector, texto: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icono, null, tint = Purple80)
        Text(texto, color = TextWhite, modifier = Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = TextGray)
    }
}
