package com.example.gymhub

import com.example.gymhub.data.remote.ApiException
import com.example.gymhub.data.remote.EjercicioRealizado
import com.example.gymhub.data.remote.RegistrarSesionRequest
import com.example.gymhub.data.remote.SerieRealizada
import com.example.gymhub.data.remote.SinConexionException
import com.example.gymhub.data.remote.mensajeDeError
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class RepositorioTest {
    private val api = ApiFalsa()

    @After fun cerrar() = api.cerrar()

    private fun sesion(uuid: String) = RegistrarSesionRequest(
        uuid_cliente = uuid,
        fecha_inicio = "2026-11-03T10:00:00Z",
        ejercicios = listOf(EjercicioRealizado(nombre = "Sentadilla", series = listOf(SerieRealizada(10, 20.0)))),
        completada = true,
    )

    @Test fun `login guarda los tokens y los manda en las peticiones`() = runTest {
        api.responder(200, TOKENS)
        api.repo.login("ana@correo.com", "Clave#2026ab")
        assertTrue(api.sesion.activa.value)
        assertEquals("acc-1", api.sesion.accessToken)

        api.responder(200, PERFIL)
        val p = api.repo.perfil()
        api.servidor.takeRequest()
        assertEquals("Bearer acc-1", api.servidor.takeRequest().getHeader("Authorization"))
        assertEquals("Matriz", p.valor.sede?.nombre)
        assertFalse(p.deCache)
    }

    @Test fun `sin conexion devuelve la ultima copia guardada`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.responder(200, RUTINA)
        assertFalse(api.repo.rutina().deCache)

        api.sinRed()
        val offline = api.repo.rutina()
        assertTrue(offline.deCache)
        assertEquals(2, offline.valor.vigente?.version_actual?.numero_version)
    }

    @Test(expected = SinConexionException::class)
    fun `sin conexion y sin copia lanza error`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.sinRed()
        api.repo.membresia()
    }

    @Test fun `la sesion queda en cola sin red y se sube despues`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.sinRed()
        assertFalse(api.repo.registrarSesion(sesion("u-1")))
        assertEquals(1, api.repo.pendientes.value)

        // Reintentar con el mismo uuid no duplica la cola
        api.sinRed()
        api.repo.registrarSesion(sesion("u-1"))
        assertEquals(1, api.repo.pendientes.value)

        api.responder(201, """{"id_sesion":10,"duplicada":false}""")
        assertEquals(0, api.repo.enviarPendientes())
        assertEquals(0, api.repo.pendientes.value)
    }

    @Test fun `una sesion rechazada por validacion se descarta y no bloquea la cola`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.sinRed()
        api.repo.registrarSesion(sesion("u-1"))
        api.sinRed()
        api.repo.registrarSesion(sesion("u-2"))
        assertEquals(2, api.repo.pendientes.value)

        api.responder(400, """{"message":["fecha_inicio debe ser ISO"],"statusCode":400}""")
        api.responder(201, """{"id_sesion":11,"duplicada":false}""")
        assertEquals(0, api.repo.enviarPendientes())
    }

    @Test fun `un error 500 conserva la cola para reintentar`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.sinRed()
        api.repo.registrarSesion(sesion("u-1"))
        api.responder(503)
        assertEquals(1, api.repo.enviarPendientes())
    }

    @Test fun `los mensajes de error de NestJS se muestran tal cual`() = runTest {
        api.responder(401, """{"message":"Correo o contraseña incorrectos.","statusCode":401}""")
        val e = runCatching { api.repo.login("a@b.com", "x") }.exceptionOrNull()
        assertTrue(e is ApiException)
        assertEquals("Correo o contraseña incorrectos.", e?.message)
        assertEquals("a\nb", mensajeDeError("""{"message":["a","b"]}""", 400))
        assertEquals("El servidor no está disponible. Intenta más tarde.", mensajeDeError("<html>", 502))
    }

    @Test fun `ficha vacia del servidor se interpreta como sin ficha`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.responder(200, "")
        assertNull(api.repo.fichaSalud())
    }

    @Test fun `cerrar sesion borra tokens y cache aunque falle el servidor`() = runTest {
        api.sesion.guardar("acc", "ref", 6)
        api.responder(200, PERFIL)
        api.repo.perfil()
        api.sinRed()
        api.sinRed()
        api.repo.cerrarSesion()
        assertFalse(api.sesion.activa.value)
        assertNull(api.cache.leer("perfil"))
    }
}
