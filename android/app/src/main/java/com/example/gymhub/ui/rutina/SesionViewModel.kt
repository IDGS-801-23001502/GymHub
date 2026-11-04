package com.example.gymhub.ui.rutina

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.EjercicioRealizado
import com.example.gymhub.data.remote.RegistrarSesionRequest
import com.example.gymhub.data.remote.Rutina
import com.example.gymhub.data.remote.SerieRealizada
import com.example.gymhub.ui.componentes.mensaje
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt

data class SerieUi(val repeticiones: String, val carga: String = "", val hecha: Boolean = false)

data class EjercicioUi(
    val id: String,
    val nombre: String,
    val objetivo: String,
    val descansoSeg: Int,
    val notas: String?,
    val series: List<SerieUi>,
)

data class Descanso(val ejercicio: String, val restante: Int, val total: Int)

data class SesionUi(
    val ejercicios: List<EjercicioUi> = emptyList(),
    val descanso: Descanso? = null,
    val calorias: String = "",
    val fcPromedio: String = "",
    val fcMaxima: String = "",
    val guardando: Boolean = false,
    val error: String? = null,
    /** null mientras se entrena; luego, si se subió o quedó en la cola offline. */
    val guardada: Boolean? = null,
) {
    val seriesHechas get() = ejercicios.sumOf { e -> e.series.count { it.hecha } }
    val seriesTotales get() = ejercicios.sumOf { it.series.size }
}

/** Primer número de "10-12", "20 min" o "30 s"; es lo que se precarga como repeticiones. */
fun repeticionesSugeridas(objetivo: String): String = Regex("\\d+").find(objetivo)?.value ?: ""

/**
 * Registro de una sesión de entrenamiento con temporizador de descanso (APP-RF-07).
 * La sesión se guarda en la cola local antes de intentar subirla.
 */
class SesionViewModel(
    private val repo: Repositorio,
    private val programarSync: () -> Unit,
    private val reloj: () -> Instant = Instant::now,
) : ViewModel() {
    private val _ui = MutableStateFlow(SesionUi())
    val ui: StateFlow<SesionUi> = _ui.asStateFlow()

    private var rutina: Rutina? = null
    private var inicio: Instant = reloj()
    private var temporizador: Job? = null
    private val uuid = UUID.randomUUID().toString()

    fun iniciar(r: Rutina) {
        if (rutina != null) return
        rutina = r
        inicio = reloj()
        _ui.value = SesionUi(
            ejercicios = r.bloques.sortedBy { it.orden }.flatMap { it.ejercicios }.map { e ->
                EjercicioUi(
                    id = e.id_ejercicio,
                    nombre = e.nombre,
                    objetivo = "${e.series} × ${e.repeticiones}",
                    descansoSeg = e.descanso_seg,
                    notas = e.notas,
                    series = List(e.series.coerceAtLeast(1)) { SerieUi(repeticionesSugeridas(e.repeticiones)) },
                )
            },
        )
    }

    fun segundosTranscurridos(): Long = Duration.between(inicio, reloj()).seconds

    fun cambiarSerie(e: Int, s: Int, repeticiones: String? = null, carga: String? = null) = editarSerie(e, s) {
        it.copy(
            repeticiones = repeticiones?.filter(Char::isDigit)?.take(4) ?: it.repeticiones,
            carga = carga?.filter { c -> c.isDigit() || c == '.' }?.take(6) ?: it.carga,
        )
    }

    /** Al completar una serie arranca el descanso indicado por el entrenador. */
    fun alternarSerie(e: Int, s: Int) {
        val ahoraHecha = !_ui.value.ejercicios[e].series[s].hecha
        editarSerie(e, s) { it.copy(hecha = ahoraHecha) }
        val ej = _ui.value.ejercicios[e]
        if (ahoraHecha && ej.descansoSeg > 0) iniciarDescanso(ej.nombre, ej.descansoSeg) else if (!ahoraHecha) saltarDescanso()
    }

    fun agregarSerie(e: Int) = _ui.update { u ->
        u.copy(ejercicios = u.ejercicios.mapIndexed { i, ej ->
            if (i != e || ej.series.size >= 30) ej else ej.copy(series = ej.series + ej.series.last().copy(hecha = false))
        })
    }

    fun saltarDescanso() {
        temporizador?.cancel()
        _ui.update { it.copy(descanso = null) }
    }

    fun cambiarBiometricos(calorias: String? = null, fcPromedio: String? = null, fcMaxima: String? = null) = _ui.update {
        it.copy(
            calorias = calorias?.filter { c -> c.isDigit() || c == '.' }?.take(7) ?: it.calorias,
            fcPromedio = fcPromedio?.filter(Char::isDigit)?.take(3) ?: it.fcPromedio,
            fcMaxima = fcMaxima?.filter(Char::isDigit)?.take(3) ?: it.fcMaxima,
        )
    }

    /** Se considera completada si se hizo al menos la mitad de las series planeadas. */
    fun construirSolicitud(fin: Instant = reloj()): RegistrarSesionRequest {
        val u = _ui.value
        val r = rutina
        return RegistrarSesionRequest(
            uuid_cliente = uuid,
            id_rutina = r?.id_rutina,
            numero_version = r?.version_actual?.numero_version,
            fecha_inicio = inicio.toString(),
            fecha_fin = fin.toString(),
            duracion_min = Duration.between(inicio, fin).toMinutes().toInt().coerceIn(0, 600),
            ejercicios = u.ejercicios.mapNotNull { e ->
                val hechas = e.series.filter { it.hecha }
                if (hechas.isEmpty()) null
                else EjercicioRealizado(e.id, e.nombre.take(100), hechas.map {
                    SerieRealizada(
                        repeticiones = (it.repeticiones.toIntOrNull() ?: 0).coerceIn(0, 1000),
                        carga_kg = it.carga.toDoubleOrNull()?.coerceIn(0.0, 1000.0)?.let { k -> (k * 100).roundToInt() / 100.0 },
                        completada = true,
                    )
                })
            },
            completada = u.seriesTotales > 0 && u.seriesHechas * 2 >= u.seriesTotales,
            calorias = u.calorias.toDoubleOrNull()?.let { (it * 100).roundToInt() / 100.0 },
            fc_promedio = u.fcPromedio.toIntOrNull()?.takeIf { it in 30..250 },
            fc_maxima = u.fcMaxima.toIntOrNull()?.takeIf { it in 30..250 },
        )
    }

    fun terminar() {
        if (_ui.value.seriesHechas == 0) {
            _ui.update { it.copy(error = "Marca al menos una serie antes de terminar.") }
            return
        }
        saltarDescanso()
        _ui.update { it.copy(guardando = true, error = null) }
        val solicitud = construirSolicitud()
        viewModelScope.launch {
            try {
                val subida = repo.registrarSesion(solicitud)
                if (!subida) programarSync()
                _ui.update { it.copy(guardando = false, guardada = subida) }
            } catch (e: Exception) {
                _ui.update { it.copy(guardando = false, error = e.mensaje()) }
            }
        }
    }

    private fun iniciarDescanso(ejercicio: String, segundos: Int) {
        temporizador?.cancel()
        _ui.update { it.copy(descanso = Descanso(ejercicio, segundos, segundos)) }
        temporizador = viewModelScope.launch {
            for (restante in segundos - 1 downTo 0) {
                delay(1000)
                _ui.update { u -> u.copy(descanso = if (restante == 0) null else u.descanso?.copy(restante = restante)) }
            }
        }
    }

    private fun editarSerie(e: Int, s: Int, cambio: (SerieUi) -> SerieUi) = _ui.update { u ->
        u.copy(ejercicios = u.ejercicios.mapIndexed { i, ej ->
            if (i != e) ej else ej.copy(series = ej.series.mapIndexed { j, serie -> if (j == s) cambio(serie) else serie })
        })
    }
}
