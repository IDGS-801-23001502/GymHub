package com.example.gymhub

import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.local.AlmacenEnMemoria
import com.example.gymhub.data.local.SesionLocal
import com.example.gymhub.data.remote.ClienteApi
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer

/** Backend simulado con MockWebServer y almacenamiento en memoria. */
class ApiFalsa {
    val servidor = MockWebServer().apply { start() }
    val sesion = SesionLocal(AlmacenEnMemoria())
    val cache = AlmacenEnMemoria()
    val cliente = ClienteApi(servidor.url("/").toString(), sesion, depurar = false, reintentarConexion = false)
    val repo = Repositorio(cliente.api, sesion, cache, "Prueba")

    fun responder(codigo: Int, cuerpo: String = "{}") {
        servidor.enqueue(MockResponse().setResponseCode(codigo).setHeader("Content-Type", "application/json").setHeader("Connection", "close").setBody(cuerpo))
    }

    /** Simula que el servidor no está disponible (la conexión se corta). */
    fun sinRed() {
        servidor.enqueue(MockResponse().setSocketPolicy(okhttp3.mockwebserver.SocketPolicy.DISCONNECT_AT_START))
    }

    fun cerrar() = servidor.shutdown()
}

const val TOKENS = """{"access_token":"acc-1","refresh_token":"ref-1-xxxxxxxxxxxxxxxxxxxx","id_socio":6}"""

const val PERFIL = """{"id_socio":6,"folio":"GH000006","nombre":"Ana App","telefono":"5512345678","correo":"ana@correo.com",
"membresia":{"estado":"activa","plan":{"id_plan":1,"nombre":"Mensual"},"vigente_hasta":"2026-12-02","dias_restantes":29},
"sede":{"id_sede":1,"nombre":"Matriz"},"campo_nuevo":"se ignora"}"""

const val RUTINA = """{"vigente":{"id_rutina":7,"estado":"vigente","sesiones_planeadas_semana":3,"fecha_inicio":"2026-11-03",
"version_actual":{"numero_version":2,"fecha":"2026-11-03T07:58:16.000Z"},
"bloques":[{"tipo":"fuerza","orden":1,"ejercicios":[
{"id_ejercicio":"6ae98897940ff8a330e75aab","nombre":"Puente de glúteo","series":3,"repeticiones":"10-12","descanso_seg":60},
{"id_ejercicio":"6ae98897940ff8a330e75ab2","nombre":"Plancha","series":2,"repeticiones":"30 s","descanso_seg":0}]}]}}"""
