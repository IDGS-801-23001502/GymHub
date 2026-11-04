package com.example.gymhub.data.salud

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.example.gymhub.data.local.AlmacenClaveValor
import com.example.gymhub.data.remote.DatoSalud
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass

/** Lectura de pasos, frecuencia cardiaca y calorías desde Health Connect (APP-RF-11, APP-RF-12). */
class SaludConectada(private val context: Context, private val almacen: AlmacenClaveValor) {

    val permisos: Set<String> = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
    )

    fun disponible(): Boolean = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    /** Health Connect no está instalado o requiere actualización. */
    fun requiereInstalar(): Boolean =
        HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED

    private val cliente by lazy { HealthConnectClient.getOrCreate(context) }

    suspend fun tienePermisos(): Boolean =
        disponible() && cliente.permissionController.getGrantedPermissions().containsAll(permisos)

    /** Datos nuevos desde la última sincronización (máximo 30 días atrás). */
    suspend fun leerPendientes(ahora: Instant = Instant.now()): Pair<List<DatoSalud>, Instant> {
        val tope = ahora.minus(Duration.ofDays(30))
        val desde = almacen.leer(ULTIMA)?.let { Instant.ofEpochMilli(it.toLong()) }?.takeIf { it.isAfter(tope) } ?: tope
        val rango = TimeRangeFilter.between(desde, ahora)

        val pasos = leer(StepsRecord::class, rango).map {
            DatoSalud("pasos", it.count.toDouble(), it.startTime.toString(), it.endTime.toString())
        }
        val fc = leer(HeartRateRecord::class, rango).filter { it.samples.isNotEmpty() }.map { r ->
            DatoSalud("frecuencia_cardiaca", r.samples.map { it.beatsPerMinute }.average().let { Math.round(it).toDouble() }, r.startTime.toString(), r.endTime.toString())
        }
        val calorias = leer(ActiveCaloriesBurnedRecord::class, rango).map {
            DatoSalud("calorias", Math.round(it.energy.inKilocalories * 100) / 100.0, it.startTime.toString(), it.endTime.toString())
        }
        return (pasos + fc + calorias) to ahora
    }

    fun marcarSincronizado(hasta: Instant) = almacen.guardar(ULTIMA, hasta.toEpochMilli().toString())

    private suspend fun <T : Record> leer(tipo: KClass<T>, rango: TimeRangeFilter): List<T> {
        val todos = mutableListOf<T>()
        var pagina: String? = null
        do {
            val r = cliente.readRecords(ReadRecordsRequest(tipo, rango, pageSize = 1000, pageToken = pagina))
            todos += r.records
            pagina = r.pageToken
        } while (pagina != null && todos.size < 5000)
        return todos
    }

    private companion object {
        const val ULTIMA = "hc_ultima_sync"
    }
}
