package com.example.gymhub

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.FitnessCenter
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.example.gymhub.push.Push
import com.example.gymhub.ui.acceso.AccesoViewModel
import com.example.gymhub.ui.acceso.ActivarScreen
import com.example.gymhub.ui.acceso.LoginScreen
import com.example.gymhub.ui.acceso.RecuperarScreen
import com.example.gymhub.ui.ajustes.AjustesScreen
import com.example.gymhub.ui.componentes.vm
import com.example.gymhub.ui.historial.HistorialScreen
import com.example.gymhub.ui.inicio.InicioScreen
import com.example.gymhub.ui.membresia.CredencialScreen
import com.example.gymhub.ui.membresia.MembresiaScreen
import com.example.gymhub.ui.notificaciones.NotificacionesScreen
import com.example.gymhub.ui.perfil.PerfilScreen
import com.example.gymhub.ui.progreso.ProgresoScreen
import com.example.gymhub.ui.rutina.RutinaScreen
import com.example.gymhub.ui.rutina.SesionScreen
import com.example.gymhub.ui.salud.FichaSaludScreen
import com.example.gymhub.ui.salud.HealthConnectScreen
import com.example.gymhub.ui.theme.*
import com.example.gymhub.work.SincronizacionWorker

class MainActivity : ComponentActivity() {
    private var destino by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        destino = destinoDe(intent)
        val contenedor = (application as GymHubApp).contenedor
        setContent {
            GymhubTheme {
                val activa by contenedor.sesion.activa.collectAsStateWithLifecycle()
                if (activa) {
                    LaunchedEffect(Unit) {
                        SincronizacionWorker.programar(applicationContext)
                        Push.registrar(applicationContext)
                    }
                    Principal(destino) { destino = null }
                } else {
                    Acceso()
                }
            }
        }
    }

    // Al tocar una notificación con la app abierta
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        destino = destinoDe(intent)
    }

    private fun destinoDe(intent: android.content.Intent?): String? = when {
        intent?.getStringExtra(EXTRA_DESTINO) != null -> intent.getStringExtra(EXTRA_DESTINO)
        // Health Connect abre la app para mostrar cómo se usan los datos
        intent?.action == "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" ||
            intent?.action == "android.intent.action.VIEW_PERMISSION_USAGE" -> Rutas.AJUSTES
        else -> null
    }

    companion object {
        const val EXTRA_DESTINO = "destino"
    }
}

object Rutas {
    const val LOGIN = "login"
    const val ACTIVAR = "activar"
    const val RECUPERAR = "recuperar"
    const val INICIO = "inicio"
    const val RUTINA = "rutina"
    const val PROGRESO = "progreso"
    const val PERFIL = "perfil"
    const val MEMBRESIA = "membresia"
    const val CREDENCIAL = "credencial"
    const val SESION = "sesion"
    const val HISTORIAL = "historial"
    const val FICHA = "ficha"
    const val HEALTH = "health"
    const val AJUSTES = "ajustes"
    const val NOTIFICACIONES = "notificaciones"
}

@Composable
private fun Acceso() {
    val nav = rememberNavController()
    // Un solo ViewModel para las tres pantallas: el aviso de "contraseña actualizada" llega al login
    val vm = vm { AccesoViewModel(it) }
    Scaffold(containerColor = DarkBackground) { padding ->
        NavHost(
            nav, Rutas.LOGIN,
            Modifier.padding(padding).consumeWindowInsets(padding).imePadding(),
            enterTransition = { fadeIn() }, exitTransition = { fadeOut() },
        ) {
            composable(Rutas.LOGIN) { LoginScreen(vm, { nav.navigate(Rutas.ACTIVAR) }, { nav.navigate(Rutas.RECUPERAR) }) }
            composable(Rutas.ACTIVAR) { ActivarScreen(vm) { nav.popBackStack() } }
            composable(Rutas.RECUPERAR) { RecuperarScreen(vm) { nav.popBackStack() } }
        }
    }
}

private data class Pestana(val ruta: String, val texto: String, val icono: ImageVector)

private val PESTANAS = listOf(
    Pestana(Rutas.INICIO, "Inicio", Icons.Default.Home),
    Pestana(Rutas.RUTINA, "Rutina", Icons.Default.FitnessCenter),
    Pestana(Rutas.PROGRESO, "Progreso", Icons.AutoMirrored.Filled.TrendingUp),
    Pestana(Rutas.PERFIL, "Perfil", Icons.Default.Person),
)

@Composable
private fun Principal(destino: String?, onDestinoAtendido: () -> Unit) {
    val nav = rememberNavController()
    val actual = nav.currentBackStackEntryAsState().value?.destination?.route

    LaunchedEffect(destino) {
        if (destino != null) {
            nav.navigate(destino) { launchSingleTop = true }
            onDestinoAtendido()
        }
    }

    Scaffold(
        containerColor = DarkBackground,
        bottomBar = {
            if (PESTANAS.any { it.ruta == actual }) {
                NavigationBar(containerColor = SurfaceDark) {
                    PESTANAS.forEach { p ->
                        NavigationBarItem(
                            selected = actual == p.ruta,
                            onClick = { nav.irAPestana(p.ruta) },
                            icon = { Icon(p.icono, p.texto) },
                            label = { Text(p.texto) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = TextWhite,
                                selectedTextColor = TextWhite,
                                indicatorColor = PrimaryPurple.copy(alpha = 0.5f),
                                unselectedIconColor = TextGray,
                                unselectedTextColor = TextGray,
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            nav, Rutas.INICIO,
            Modifier.padding(padding).consumeWindowInsets(padding).imePadding(),
            enterTransition = { fadeIn() }, exitTransition = { fadeOut() },
        ) {
            val atras: () -> Unit = { nav.popBackStack() }
            composable(Rutas.INICIO) {
                InicioScreen(
                    onMembresia = { nav.navigate(Rutas.MEMBRESIA) },
                    onCredencial = { nav.navigate(Rutas.CREDENCIAL) },
                    onEntrenar = { nav.navigate(Rutas.SESION) },
                    onNotificaciones = { nav.navigate(Rutas.NOTIFICACIONES) },
                )
            }
            composable(Rutas.RUTINA) { RutinaScreen({ nav.navigate(Rutas.SESION) }, { nav.navigate(Rutas.HISTORIAL) }) }
            composable(Rutas.PROGRESO) { ProgresoScreen { nav.navigate(Rutas.HISTORIAL) } }
            composable(Rutas.PERFIL) {
                PerfilScreen(
                    onFichaSalud = { nav.navigate(Rutas.FICHA) },
                    onHealthConnect = { nav.navigate(Rutas.HEALTH) },
                    onAjustes = { nav.navigate(Rutas.AJUSTES) },
                    onMembresia = { nav.navigate(Rutas.MEMBRESIA) },
                )
            }
            composable(Rutas.MEMBRESIA) { MembresiaScreen(atras) { nav.navigate(Rutas.CREDENCIAL) } }
            composable(Rutas.CREDENCIAL) { CredencialScreen(atras) }
            composable(Rutas.SESION) { SesionScreen(atras) }
            composable(Rutas.HISTORIAL) { HistorialScreen(atras) }
            composable(Rutas.FICHA) { FichaSaludScreen(atras) }
            composable(Rutas.HEALTH) { HealthConnectScreen(atras) }
            composable(Rutas.AJUSTES) { AjustesScreen(atras) }
            composable(Rutas.NOTIFICACIONES) { NotificacionesScreen(atras) }
        }
    }
}

private fun NavHostController.irAPestana(ruta: String) = navigate(ruta) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}
