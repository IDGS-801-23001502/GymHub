package com.example.gymhub.ui.historial

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.Historial
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate

class HistorialViewModel(private val repo: Repositorio) : ViewModel() {
    private val _estado = MutableStateFlow<Estado<Historial>>(Estado.Cargando)
    val estado: StateFlow<Estado<Historial>> = _estado.asStateFlow()
    private val _dias = MutableStateFlow(30)
    val dias: StateFlow<Int> = _dias.asStateFlow()

    init { cargar() }

    fun periodo(dias: Int) {
        _dias.value = dias
        cargar()
    }

    fun cargar() {
        _estado.value = Estado.Cargando
        viewModelScope.launch {
            _estado.value = try {
                Estado.Listo(repo.historial(desde = LocalDate.now().minusDays(_dias.value.toLong()).toString()))
            } catch (e: Exception) {
                Estado.Error(e.mensaje())
            }
        }
    }
}

/** APP-RF-08: sesiones realizadas con fecha, duración y cargas. */
@Composable
fun HistorialScreen(onBack: () -> Unit) {
    val vm = vm { HistorialViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()
    val dias by vm.dias.collectAsStateWithLifecycle()
    var abierta by remember { mutableStateOf<Int?>(null) }

    Pantalla("Historial", onBack = onBack) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(30 to "30 días", 90 to "3 meses", 365 to "1 año").forEach { (d, t) ->
                FilterChip(
                    selected = dias == d,
                    onClick = { vm.periodo(d) },
                    label = { Text(t) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = PrimaryPurple, labelColor = TextGray, selectedLabelColor = TextWhite),
                )
            }
        }
        ContenidoEstado(estado, vm::cargar) { h, _ ->
            Tarjeta {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Dato("Sesiones", "${h.resumen.sesiones_cumplidas}")
                    Dato("Minutos", "${h.resumen.minutos_totales}")
                    Dato("Adherencia", h.resumen.adherencia?.let { "$it%" } ?: "—")
                }
            }
            if (h.sesiones.isEmpty()) Text("No hay sesiones en este periodo.", color = TextGray)
            h.sesiones.forEach { s ->
                Tarjeta(Modifier.clickable { abierta = if (abierta == s.id_sesion) null else s.id_sesion }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(fechaHora(s.fecha_inicio), color = TextWhite, fontWeight = FontWeight.Bold)
                            Text(
                                listOfNotNull(
                                    s.duracion_min?.let { "$it min" },
                                    s.calorias?.let { "${it.toInt()} kcal" },
                                    s.fc_promedio?.let { "FC $it" },
                                ).joinToString(" · ").ifEmpty { "Sin datos del reloj" },
                                color = TextGray, fontSize = 13.sp,
                            )
                        }
                        Etiqueta(if (s.completada) "Completa" else "Parcial", if (s.completada) SuccessGreen else WarningAmber)
                    }
                    AnimatedVisibility(abierta == s.id_sesion) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            s.detalle?.ejercicios?.forEach { e ->
                                Text(e.nombre, color = TextWhite, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                Text(
                                    e.series.joinToString("  ·  ") { "${it.repeticiones} reps" + (it.carga_kg?.let { k -> " × ${k.toString().removeSuffix(".0")} kg" } ?: "") },
                                    color = TextGray, fontSize = 13.sp,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
