package com.example.gymhub.ui.notificaciones

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.Notificacion
import com.example.gymhub.push.Push
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant

class NotificacionesViewModel(private val repo: Repositorio) : ViewModel() {
    private val _estado = MutableStateFlow<Estado<List<Notificacion>>>(Estado.Cargando)
    val estado: StateFlow<Estado<List<Notificacion>>> = _estado.asStateFlow()

    init { cargar() }

    fun cargar() = viewModelScope.launch {
        _estado.value = Estado.Cargando
        _estado.value = try {
            Estado.Listo(repo.notificaciones())
        } catch (e: Exception) {
            Estado.Error(e.mensaje())
        }
    }

    fun leer(n: Notificacion) {
        if (n.leida_en != null) return
        val lista = (_estado.value as? Estado.Listo)?.datos ?: return
        _estado.value = Estado.Listo(lista.map { if (it.id_notificacion == n.id_notificacion) it.copy(leida_en = Instant.now().toString()) else it })
        viewModelScope.launch { runCatching { repo.marcarLeida(n.id_notificacion) } }
    }
}

/** APP-RF-14: bandeja de notificaciones recibidas. */
@Composable
fun NotificacionesScreen(onBack: () -> Unit) {
    val vm = vm { NotificacionesViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()

    Pantalla("Notificaciones", onBack = onBack) {
        ContenidoEstado(estado, { vm.cargar() }) { lista, _ ->
            if (lista.isEmpty()) Text("No tienes notificaciones.", color = TextGray)
            lista.forEach { n ->
                Tarjeta(Modifier.clickable { vm.leer(n) }, borde = if (n.leida_en == null) PrimaryPurple.copy(alpha = 0.6f) else BorderColor) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (n.leida_en == null) Box(Modifier.size(8.dp).background(PrimaryPurple, CircleShape))
                        Text(n.titulo, color = TextWhite, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Text(fechaHora(n.creada_en), color = TextGray, fontSize = 12.sp)
                    }
                    Text(n.contenido, color = TextGray, fontSize = 14.sp)
                    Text(Push.CANALES[n.categoria] ?: etiqueta(n.categoria), color = Purple80, fontSize = 12.sp)
                }
            }
        }
    }
}
