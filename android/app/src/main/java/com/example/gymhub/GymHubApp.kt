package com.example.gymhub

import android.app.Application
import android.content.Context
import android.os.Build
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.local.AlmacenCifrado
import com.example.gymhub.data.local.SesionLocal
import com.example.gymhub.data.remote.ClienteApi
import com.example.gymhub.data.salud.SaludConectada
import com.example.gymhub.push.Push
import com.example.gymhub.work.SincronizacionWorker

/** Dependencias de la app, creadas una sola vez. */
class Contenedor(context: Context) {
    private val cache = AlmacenCifrado(context, "gymhub_cache")
    val sesion = SesionLocal(AlmacenCifrado(context, "gymhub_sesion"))
    private val cliente = ClienteApi(BuildConfig.API_URL, sesion, BuildConfig.DEBUG)
    val repositorio = Repositorio(cliente.api, sesion, cache, "${Build.MANUFACTURER} ${Build.MODEL}".take(100))
    val salud = SaludConectada(context, cache)
}

class GymHubApp : Application() {
    lateinit var contenedor: Contenedor
        private set

    override fun onCreate() {
        super.onCreate()
        contenedor = Contenedor(this)
        Push.crearCanales(this)
        if (contenedor.sesion.activa.value) SincronizacionWorker.programar(this)
    }
}
