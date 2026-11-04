package com.example.gymhub

import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class RefrescoTokensTest {
    private val api = ApiFalsa()

    @After fun cerrar() = api.cerrar()

    @Test fun `con el access vencido renueva y repite la peticion`() = runTest {
        api.sesion.guardar("viejo", "ref-0", 6)
        api.responder(401, """{"message":"Unauthorized"}""")
        api.responder(200, """{"access_token":"nuevo","refresh_token":"ref-1","id_socio":6}""")
        api.responder(200, PERFIL)

        assertEquals("GH000006", api.repo.perfil().valor.folio)
        assertEquals("Bearer viejo", api.servidor.takeRequest().getHeader("Authorization"))
        val refresh = api.servidor.takeRequest()
        assertEquals("/app/auth/refresh", refresh.path)
        assertTrue(refresh.body.readUtf8().contains("ref-0"))
        assertEquals("Bearer nuevo", api.servidor.takeRequest().getHeader("Authorization"))
        assertEquals("ref-1", api.sesion.refreshToken)
    }

    @Test fun `si el refresh fue revocado se cierra la sesion local`() = runTest {
        api.sesion.guardar("viejo", "ref-0", 6)
        api.responder(401)
        api.responder(401, """{"message":"Sesión no válida."}""")

        assertTrue(runCatching { api.repo.perfil() }.isFailure)
        assertFalse(api.sesion.activa.value)
        assertNull(api.sesion.accessToken)
    }

    @Test fun `las rutas de acceso no intentan renovar`() = runTest {
        api.responder(401, """{"message":"Correo o contraseña incorrectos."}""")
        assertTrue(runCatching { api.repo.login("a@b.com", "x") }.isFailure)
        assertEquals(1, api.servidor.requestCount)
    }
}
