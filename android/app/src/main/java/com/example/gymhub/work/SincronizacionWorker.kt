package com.example.gymhub.work

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.gymhub.GymHubApp
import com.example.gymhub.data.remote.ApiException
import com.example.gymhub.data.remote.SinConexionException
import java.util.concurrent.TimeUnit

/**
 * Sube las sesiones pendientes y los datos de Health Connect (APP-RF-12, APP-RNF-05).
 * WorkManager lo reintenta con backoff si no hay red.
 */
class SincronizacionWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val c = (applicationContext as GymHubApp).contenedor
        if (!c.repositorio.sesionActiva.value) return Result.success()
        return try {
            val pendientes = c.repositorio.enviarPendientes()
            sincronizarSalud(c)
            if (pendientes > 0) Result.retry() else Result.success()
        } catch (_: SinConexionException) {
            Result.retry()
        } catch (e: ApiException) {
            if (e.status >= 500) Result.retry() else Result.success()
        }
    }

    private suspend fun sincronizarSalud(c: com.example.gymhub.Contenedor) {
        val autorizado = c.repositorio.consentimientos().any { it.tipo == "health_connect" && it.otorgado }
        // Sin permiso en el teléfono o sin consentimiento en GymHub no se lee nada
        if (!autorizado || !runCatching { c.salud.tienePermisos() }.getOrDefault(false)) return
        val (datos, hasta) = try {
            c.salud.leerPendientes()
        } catch (_: SecurityException) {
            return // Android 14+: la lectura en segundo plano necesita un permiso aparte
        }
        c.repositorio.sincronizarSalud(datos)
        c.salud.marcarSincronizado(hasta)
    }

    companion object {
        private const val PERIODICA = "gymhub-sync"
        private const val INMEDIATA = "gymhub-sync-ahora"
        private val conRed = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun programar(context: Context) {
            val req = PeriodicWorkRequestBuilder<SincronizacionWorker>(1, TimeUnit.HOURS)
                .setConstraints(conRed)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODICA, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        /** Se lanza al guardar una sesión sin red: corre en cuanto vuelva la conexión. */
        fun ahora(context: Context) {
            val req = OneTimeWorkRequestBuilder<SincronizacionWorker>()
                .setConstraints(conRed)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(INMEDIATA, ExistingWorkPolicy.REPLACE, req)
        }

        fun cancelar(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODICA)
            WorkManager.getInstance(context).cancelUniqueWork(INMEDIATA)
        }
    }
}
