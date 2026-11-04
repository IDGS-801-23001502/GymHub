package com.example.gymhub.ui.inicio

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.Asistencias
import com.example.gymhub.data.remote.Perfil
import com.example.gymhub.data.remote.Progreso
import com.example.gymhub.data.remote.Rutina
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class Inicio(val perfil: Perfil, val rutina: Rutina?, val progreso: Progreso?, val visitas: Asistencias?)

class InicioViewModel(private val repo: Repositorio) : ViewModel() {
    private val _estado = MutableStateFlow<Estado<Inicio>>(Estado.Cargando)
    val estado: StateFlow<Estado<Inicio>> = _estado.asStateFlow()
    val pendientes = repo.pendientes

    init { cargar() }

    fun cargar() {
        if (_estado.value !is Estado.Listo) _estado.value = Estado.Cargando
        viewModelScope.launch {
            try {
                val perfil = async { repo.perfil() }
                val rutina = async { runCatching { repo.rutina() }.getOrNull() }
                val progreso = async { runCatching { repo.progreso() }.getOrNull() }
                val visitas = async { runCatching { repo.asistencias() }.getOrNull() }
                val p = perfil.await()
                val r = rutina.await()
                _estado.value = Estado.Listo(Inicio(p.valor, r?.valor?.vigente, progreso.await()?.valor, visitas.await()), p.deCache)
            } catch (e: Exception) {
                _estado.value = Estado.Error(e.mensaje())
            }
        }
    }
}

@Composable
fun InicioScreen(
    onMembresia: () -> Unit,
    onCredencial: () -> Unit,
    onEntrenar: () -> Unit,
    onNotificaciones: () -> Unit,
) {
    val vm = vm { InicioViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()
    val pendientes by vm.pendientes.collectAsStateWithLifecycle()

    Pantalla {
        ContenidoEstado(estado, vm::cargar) { d, offline ->
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Hola,", color = TextGray, fontSize = 14.sp)
                    Text(d.perfil.nombre.substringBefore(' '), color = TextWhite, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                }
                IconButton(onClick = onNotificaciones) { Icon(Icons.Default.Notifications, "Notificaciones", tint = TextWhite) }
                Box(
                    Modifier.size(48.dp).clip(CircleShape).background(SurfaceDark).border(1.5.dp, PrimaryPurple, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (d.perfil.foto_url != null) AsyncImage(urlArchivo(d.perfil.foto_url), "Foto", Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else Icon(Icons.Default.Person, null, tint = TextWhite)
                }
            }
            AvisoOffline(offline)
            if (pendientes > 0) {
                AvisoOffline(true, "$pendientes sesión(es) por subir; se enviarán al recuperar la conexión.")
            }

            val m = d.perfil.membresia
            Tarjeta(Modifier.clickable(onClick = onMembresia)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Membresía", color = TextGray, fontSize = 13.sp)
                        Text(m?.plan?.nombre ?: "Sin plan", color = TextWhite, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    }
                    Etiqueta(textoEstadoMembresia(m?.estado ?: "sin_membresia"), colorEstadoMembresia(m?.estado ?: "sin_membresia"))
                }
                if (m?.vigente_hasta != null) {
                    Text("Vigente hasta ${fecha(m.vigente_hasta)} · ${m.dias_restantes ?: 0} días", color = TextGray, fontSize = 14.sp)
                }
                TextButton(onClick = onCredencial, contentPadding = PaddingValues(0.dp)) {
                    Icon(Icons.Default.QrCode2, null, tint = Purple80)
                    Spacer(Modifier.width(6.dp))
                    Text("Mostrar credencial", color = Purple80)
                }
            }

            Tarjeta(borde = PrimaryPurple.copy(alpha = 0.6f)) {
                Text("Tu rutina", color = TextGray, fontSize = 13.sp)
                if (d.rutina == null) {
                    Text("Aún no tienes una rutina asignada. Pídela a tu entrenador.", color = TextWhite)
                } else {
                    Text(d.rutina.plantilla?.nombre ?: "Rutina personalizada", color = TextWhite, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    val ejercicios = d.rutina.bloques.sumOf { it.ejercicios.size }
                    Text("$ejercicios ejercicios · ${d.rutina.sesiones_planeadas_semana} sesiones por semana", color = TextGray, fontSize = 14.sp)
                    BotonPrimario("Entrenar ahora", onEntrenar)
                }
            }

            d.visitas?.let { v ->
                Tarjeta {
                    Text("Tus visitas al gimnasio", color = TextGray, fontSize = 13.sp)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Dato("Últimos 30 días", "${v.visitas_30_dias}")
                        Dato("Última visita", v.ultima_visita?.let { fechaHora(it) } ?: "—")
                    }
                }
            }

            d.progreso?.let { p ->
                val semana = p.semanas.lastOrNull()
                Tarjeta {
                    Text("Esta semana", color = TextGray, fontSize = 13.sp)
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Dato("Sesiones", "${semana?.cumplidas ?: 0}/${semana?.planeadas ?: 0}")
                        Dato("Racha", "${p.logros.racha_semanas} sem")
                        Dato("Calorías", "${p.resumen.calorias_totales}")
                    }
                    if (semana != null && semana.planeadas > 0) {
                        LinearProgressIndicator(
                            progress = { (semana.cumplidas.toFloat() / semana.planeadas).coerceAtMost(1f) },
                            modifier = Modifier.fillMaxWidth().height(8.dp).clip(CircleShape),
                            color = PrimaryPurple,
                            trackColor = BorderColor,
                        )
                    }
                }
            }
        }
    }
}
