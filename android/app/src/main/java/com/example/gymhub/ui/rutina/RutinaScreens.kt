package com.example.gymhub.ui.rutina

import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.gymhub.data.remote.RutinaRespuesta
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.membresia.CargaViewModel
import com.example.gymhub.ui.theme.*
import com.example.gymhub.work.SincronizacionWorker
import kotlinx.coroutines.delay

class RutinaViewModel(repo: com.example.gymhub.data.Repositorio) : CargaViewModel<RutinaRespuesta>({ repo.rutina() })

/** APP-RF-06: rutina vigente, disponible sin conexión. */
@Composable
fun RutinaScreen(onEntrenar: () -> Unit, onHistorial: () -> Unit) {
    val vm = vm { RutinaViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()

    Pantalla("Mi rutina", acciones = {
        IconButton(onClick = onHistorial) { Icon(Icons.Default.History, "Historial", tint = TextWhite) }
    }) {
        ContenidoEstado(estado, vm::recargar) { d, offline ->
            AvisoOffline(offline)
            val r = d.vigente
            if (r == null) {
                Tarjeta { Text("Todavía no tienes una rutina asignada. Tu entrenador la prepara en el gimnasio.", color = TextWhite) }
                return@ContenidoEstado
            }
            Tarjeta(borde = PrimaryPurple.copy(alpha = 0.6f)) {
                Text(r.plantilla?.nombre ?: "Rutina personalizada", color = TextWhite, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Versión ${r.version_actual.numero_version} · actualizada el ${fechaHora(r.version_actual.fecha)}",
                    color = TextGray, fontSize = 13.sp,
                )
                r.entrenador?.nombre?.let { Text("Entrenador: $it", color = TextGray, fontSize = 13.sp) }
                Text("${r.sesiones_planeadas_semana} sesiones por semana", color = TextGray, fontSize = 13.sp)
                BotonPrimario("Comenzar sesión", onEntrenar)
            }
            r.bloques.sortedBy { it.orden }.forEach { b ->
                Subtitulo(etiqueta(b.tipo))
                b.ejercicios.forEach { e ->
                    Tarjeta {
                        Text(e.nombre, color = TextWhite, fontWeight = FontWeight.Bold)
                        Text(
                            "${e.series} series × ${e.repeticiones}" + if (e.descanso_seg > 0) " · descanso ${e.descanso_seg} s" else "",
                            color = TextGray, fontSize = 14.sp,
                        )
                        e.notas?.let { Text(it, color = Purple80, fontSize = 13.sp) }
                    }
                }
            }
        }
    }
}

/** APP-RF-07: registro de series, cargas y descansos durante la sesión. */
@Composable
fun SesionScreen(onSalir: () -> Unit) {
    val contexto = LocalContext.current.applicationContext
    val rutinaVm = vm { RutinaViewModel(it) }
    val vm = vm { SesionViewModel(it, { SincronizacionWorker.ahora(contexto) }) }
    val rutina by rutinaVm.estado.collectAsStateWithLifecycle()
    val ui by vm.ui.collectAsStateWithLifecycle()
    var confirmarSalida by remember { mutableStateOf(false) }

    LaunchedEffect(rutina) {
        (rutina as? Estado.Listo)?.datos?.vigente?.let(vm::iniciar)
    }
    // La pantalla no se apaga mientras se entrena
    val activity = LocalContext.current.buscarActivity()
    DisposableEffect(activity) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }
    BackHandler(enabled = ui.guardada == null && ui.seriesHechas > 0) { confirmarSalida = true }

    if (ui.guardada != null) {
        Pantalla("Sesión guardada") {
            Tarjeta(borde = SuccessGreen.copy(alpha = 0.6f)) {
                Text(
                    if (ui.guardada == true) "¡Buen trabajo! Tu entrenador ya puede ver esta sesión."
                    else "Se guardó en el teléfono y se enviará cuando vuelva la conexión.",
                    color = TextWhite,
                )
                Text("${ui.seriesHechas} de ${ui.seriesTotales} series completadas.", color = TextGray)
            }
            BotonPrimario("Listo", onSalir)
        }
        return
    }

    var transcurrido by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        while (true) {
            transcurrido = vm.segundosTranscurridos()
            delay(1000)
        }
    }

    Pantalla("Entrenando · ${minutos(transcurrido.toInt())}", onBack = {
        if (ui.seriesHechas > 0) confirmarSalida = true else onSalir()
    }) {
        if (rutina is Estado.Cargando) Cargando()
        (rutina as? Estado.Error)?.let { ErrorReintento(it.mensaje, rutinaVm::recargar) }

        LinearProgressIndicator(
            progress = { if (ui.seriesTotales == 0) 0f else ui.seriesHechas.toFloat() / ui.seriesTotales },
            modifier = Modifier.fillMaxWidth().height(8.dp),
            color = PrimaryPurple,
            trackColor = BorderColor,
        )
        ui.descanso?.let { d ->
            Tarjeta(borde = WarningAmber) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Descanso", color = WarningAmber, fontWeight = FontWeight.Bold)
                        Text(d.ejercicio, color = TextGray, fontSize = 13.sp)
                    }
                    Text(minutos(d.restante), color = TextWhite, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                }
                LinearProgressIndicator(
                    progress = { d.restante.toFloat() / d.total },
                    modifier = Modifier.fillMaxWidth(),
                    color = WarningAmber,
                    trackColor = BorderColor,
                )
                TextButton(onClick = vm::saltarDescanso) { Text("Saltar descanso", color = Purple80) }
            }
        }

        ui.ejercicios.forEachIndexed { i, e ->
            Tarjeta {
                Text(e.nombre, color = TextWhite, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text("Objetivo: ${e.objetivo}", color = TextGray, fontSize = 13.sp)
                e.notas?.let { Text(it, color = Purple80, fontSize = 13.sp) }
                e.series.forEachIndexed { j, s ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${j + 1}", color = TextGray, modifier = Modifier.width(18.dp))
                        Campo(s.repeticiones, { vm.cambiarSerie(i, j, repeticiones = it) }, "Reps", Modifier.weight(1f), KeyboardType.Number)
                        Campo(s.carga, { vm.cambiarSerie(i, j, carga = it) }, "Kg", Modifier.weight(1f), KeyboardType.Decimal)
                        IconButton(onClick = { vm.alternarSerie(i, j) }) {
                            Icon(
                                if (s.hecha) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                                if (s.hecha) "Serie hecha" else "Marcar serie",
                                tint = if (s.hecha) SuccessGreen else TextGray,
                                modifier = Modifier.size(30.dp),
                            )
                        }
                    }
                }
                TextButton(onClick = { vm.agregarSerie(i) }) {
                    Icon(Icons.Default.Add, null, tint = Purple80)
                    Text("Agregar serie", color = Purple80)
                }
            }
        }

        if (ui.ejercicios.isNotEmpty()) {
            Tarjeta {
                Text("Datos del reloj (opcional)", color = TextWhite, fontWeight = FontWeight.Bold)
                Campo(ui.calorias, { vm.cambiarBiometricos(calorias = it) }, "Calorías", teclado = KeyboardType.Decimal)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Campo(ui.fcPromedio, { vm.cambiarBiometricos(fcPromedio = it) }, "FC promedio", Modifier.weight(1f), KeyboardType.Number)
                    Campo(ui.fcMaxima, { vm.cambiarBiometricos(fcMaxima = it) }, "FC máxima", Modifier.weight(1f), KeyboardType.Number)
                }
            }
            ui.error?.let { Text(it, color = ErrorRed) }
            BotonPrimario("Terminar sesión", vm::terminar, cargando = ui.guardando)
        }
    }

    if (confirmarSalida) {
        AlertDialog(
            onDismissRequest = { confirmarSalida = false },
            title = { Text("¿Salir sin guardar?") },
            text = { Text("Perderás las series que registraste en esta sesión.") },
            confirmButton = { TextButton(onClick = { confirmarSalida = false; onSalir() }) { Text("Salir", color = ErrorRed) } },
            dismissButton = { TextButton(onClick = { confirmarSalida = false }) { Text("Seguir entrenando") } },
            containerColor = SurfaceDark,
        )
    }
}
