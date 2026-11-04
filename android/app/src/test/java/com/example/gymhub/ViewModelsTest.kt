package com.example.gymhub

import com.example.gymhub.data.remote.JsonGymHub
import com.example.gymhub.data.remote.RutinaRespuesta
import com.example.gymhub.ui.acceso.AccesoViewModel
import com.example.gymhub.ui.acceso.Validacion
import com.example.gymhub.ui.perfil.EdicionPerfil
import com.example.gymhub.ui.rutina.SesionViewModel
import com.example.gymhub.ui.rutina.repeticionesSugeridas
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelsTest {
    private val api = ApiFalsa()
    private val despachador = StandardTestDispatcher()

    @Before fun antes() = Dispatchers.setMain(despachador)
    @After fun despues() {
        Dispatchers.resetMain()
        api.cerrar()
    }

    /** Las llamadas HTTP corren en hilos reales de OkHttp: se espera a que regresen. */
    private fun TestScope.esperar(condicion: () -> Boolean) {
        repeat(200) {
            advanceUntilIdle()
            if (condicion()) return
            Thread.sleep(25)
        }
    }

    private val rutina = JsonGymHub.decodeFromString(RutinaRespuesta.serializer(), RUTINA).vigente!!

    @Test fun `validaciones iguales a las del backend`() {
        assertNull(Validacion.password("MiClave#2026a"))
        assertNotNull(Validacion.password("miclave2026"))
        assertNotNull(Validacion.password("Corta#1a"))
        assertNull(Validacion.folio("gh000123"))
        assertNotNull(Validacion.folio("123"))
        assertNotNull(Validacion.correo("sin-arroba"))
        assertEquals(setOf("telefono", "contactoNombre", "contactoParentesco", "contactoTelefono"), EdicionPerfil(correo = "a@b.com").errores().keys)
    }

    @Test fun `login con datos invalidos no llama al servidor`() = runTest(despachador) {
        val vm = AccesoViewModel(api.repo)
        vm.login("no-es-correo", "")
        advanceUntilIdle()
        assertEquals(setOf("correo", "password"), vm.ui.value.errores.keys)
        assertEquals(0, api.servidor.requestCount)
    }

    @Test fun `login fallido muestra el mensaje del servidor`() = runTest(despachador) {
        api.responder(401, """{"message":"Correo o contraseña incorrectos."}""")
        val vm = AccesoViewModel(api.repo)
        vm.login("ana@correo.com", "Mala#2026abc")
        esperar { vm.ui.value.error != null }
        assertEquals("Correo o contraseña incorrectos.", vm.ui.value.error)
        assertFalse(vm.ui.value.cargando)
    }

    @Test fun `repeticiones sugeridas a partir del objetivo`() {
        assertEquals("10", repeticionesSugeridas("10-12"))
        assertEquals("30", repeticionesSugeridas("30 s"))
        assertEquals("", repeticionesSugeridas("al fallo"))
    }

    @Test fun `al completar una serie corre el descanso`() = runTest(despachador) {
        val vm = SesionViewModel(api.repo, {})
        vm.iniciar(rutina)
        assertEquals(5, vm.ui.value.seriesTotales)
        assertEquals("10", vm.ui.value.ejercicios[0].series[0].repeticiones)

        vm.alternarSerie(0, 0)
        assertEquals(60, vm.ui.value.descanso?.restante)
        advanceTimeBy(10_001)
        assertEquals(50, vm.ui.value.descanso?.restante)
        advanceTimeBy(50_000)
        assertNull(vm.ui.value.descanso)

        // Plancha no tiene descanso
        vm.alternarSerie(1, 0)
        assertNull(vm.ui.value.descanso)
    }

    @Test fun `la solicitud solo lleva series hechas y redondea cargas`() = runTest(despachador) {
        var ahora = Instant.parse("2026-11-03T10:00:00Z")
        val vm = SesionViewModel(api.repo, {}, reloj = { ahora })
        vm.iniciar(rutina)
        vm.cambiarSerie(0, 0, repeticiones = "12", carga = "22.456")
        vm.alternarSerie(0, 0)
        vm.alternarSerie(0, 1)
        vm.saltarDescanso()
        ahora = ahora.plusSeconds(45 * 60)

        val s = vm.construirSolicitud()
        assertEquals(1, s.ejercicios.size)
        assertEquals(2, s.ejercicios[0].series.size)
        assertEquals(12, s.ejercicios[0].series[0].repeticiones)
        assertEquals(22.46, s.ejercicios[0].series[0].carga_kg!!, 0.0001)
        assertEquals(45, s.duracion_min)
        assertEquals(2, s.numero_version)
        assertFalse("2 de 5 series no es completada", s.completada)

        vm.alternarSerie(1, 0)
        assertTrue("3 de 5 series sí", vm.construirSolicitud().completada)
    }

    @Test fun `sin series marcadas no se puede terminar`() = runTest(despachador) {
        val vm = SesionViewModel(api.repo, {})
        vm.iniciar(rutina)
        vm.terminar()
        assertNotNull(vm.ui.value.error)
        assertEquals(0, api.servidor.requestCount)
    }

    @Test fun `terminar sin red deja la sesion en cola y programa la sincronizacion`() = runTest(despachador) {
        api.sesion.guardar("acc", "ref", 6)
        var programada = false
        val vm = SesionViewModel(api.repo, { programada = true })
        vm.iniciar(rutina)
        vm.alternarSerie(0, 0)
        api.sinRed()
        vm.terminar()
        esperar { vm.ui.value.guardada != null }
        assertEquals(false, vm.ui.value.guardada)
        assertTrue(programada)
        assertEquals(1, api.repo.pendientes.value)
    }
}
