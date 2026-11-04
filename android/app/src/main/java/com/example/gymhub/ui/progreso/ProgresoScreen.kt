package com.example.gymhub.ui.progreso

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.Progreso
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.membresia.CargaViewModel
import com.example.gymhub.ui.theme.*

class ProgresoViewModel(repo: Repositorio) : CargaViewModel<Progreso>({ repo.progreso() })

/** APP-RF-15: adherencia, calorías y frecuencia cardiaca de las últimas 12 semanas. */
@Composable
fun ProgresoScreen(onHistorial: () -> Unit) {
    val vm = vm { ProgresoViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()

    Pantalla("Mi progreso") {
        ContenidoEstado(estado, vm::recargar) { p, offline ->
            AvisoOffline(offline)
            Tarjeta(borde = PrimaryPurple.copy(alpha = 0.6f)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Dato("Adherencia", p.resumen.adherencia?.let { "$it%" } ?: "—")
                    Dato("Sesiones", "${p.resumen.sesiones_cumplidas}")
                    Dato("Minutos", "${p.resumen.minutos_totales}")
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Dato("Racha", "${p.logros.racha_semanas} sem")
                    Dato("Semanas cumplidas", "${p.logros.semanas_cumplidas}")
                    Dato("Kcal", "${p.resumen.calorias_totales}")
                }
            }

            Tarjeta {
                Subtitulo("Sesiones por semana")
                Leyenda(listOf(PrimaryPurple to "Realizadas", BorderColor to "Planeadas"))
                BarrasSemanales(p.semanas.map { it.cumplidas.toFloat() to it.planeadas.toFloat() })
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(fechaCorta(p.semanas.firstOrNull()?.inicio ?: p.desde), color = TextGray, fontSize = 11.sp)
                    Text(fechaCorta(p.semanas.lastOrNull()?.inicio ?: p.hasta), color = TextGray, fontSize = 11.sp)
                }
            }

            val conCalorias = p.sesiones.mapNotNull { it.calorias?.toFloat() }
            val conFc = p.sesiones.mapNotNull { it.fc_promedio?.toFloat() }
            Tarjeta {
                Subtitulo("Calorías por sesión")
                if (conCalorias.size < 2) Text("Registra calorías en al menos dos sesiones para ver la tendencia.", color = TextGray, fontSize = 13.sp)
                else Linea(conCalorias, WarningAmber)
            }
            Tarjeta {
                Subtitulo("Frecuencia cardiaca promedio")
                if (conFc.size < 2) Text("Registra la FC de tu reloj o conecta Health Connect.", color = TextGray, fontSize = 13.sp)
                else Linea(conFc, ErrorRed)
            }

            Tarjeta {
                Subtitulo("Por mes")
                p.meses.takeLast(3).forEach { m ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(m.mes, color = TextWhite)
                        Text("${m.cumplidas}/${m.planeadas} · ${m.adherencia?.let { "$it%" } ?: "—"}", color = TextGray)
                    }
                }
            }
            BotonPrimario("Ver historial de sesiones", onHistorial)
        }
    }
}

@Composable
private fun Leyenda(series: List<Pair<Color, String>>) {
    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        series.forEach { (c, t) ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Canvas(Modifier.size(10.dp).offset(y = 4.dp)) { drawCircle(c) }
                Text(t, color = TextGray, fontSize = 12.sp)
            }
        }
    }
}

/** Barra de fondo = planeadas; barra encima = realizadas. */
@Composable
private fun BarrasSemanales(datos: List<Pair<Float, Float>>) {
    val maximo = datos.maxOfOrNull { maxOf(it.first, it.second) }?.coerceAtLeast(1f) ?: 1f
    Canvas(Modifier.fillMaxWidth().height(150.dp)) {
        if (datos.isEmpty()) return@Canvas
        val hueco = size.width / datos.size
        val ancho = hueco * 0.6f
        datos.forEachIndexed { i, (hechas, planeadas) ->
            val x = i * hueco + (hueco - ancho) / 2
            val hp = size.height * planeadas / maximo
            val hh = size.height * hechas / maximo
            drawRoundRect(BorderColor, Offset(x, size.height - hp), Size(ancho, hp), CornerRadius(6f))
            drawRoundRect(if (planeadas > 0 && hechas >= planeadas) SuccessGreen else PrimaryPurple, Offset(x, size.height - hh), Size(ancho, hh), CornerRadius(6f))
        }
    }
}

@Composable
private fun Linea(valores: List<Float>, color: Color) {
    val min = valores.min()
    val max = valores.max()
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Mín ${min.toInt()}", color = TextGray, fontSize = 12.sp)
        Text("Máx ${max.toInt()}", color = TextWhite, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
    Canvas(Modifier.fillMaxWidth().height(120.dp)) {
        val rango = (max - min).takeIf { it > 0f } ?: 1f
        val paso = size.width / (valores.size - 1)
        val puntos = valores.mapIndexed { i, v -> Offset(i * paso, size.height - (v - min) / rango * (size.height - 16f) - 8f) }
        val ruta = Path().apply {
            moveTo(puntos.first().x, puntos.first().y)
            puntos.drop(1).forEach { lineTo(it.x, it.y) }
        }
        drawPath(ruta, color, style = Stroke(width = 5f, cap = StrokeCap.Round))
        puntos.forEach { drawCircle(color, 7f, it) }
    }
}
