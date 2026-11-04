package com.example.gymhub.ui.salud

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.example.gymhub.GymHubApp
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.FichaSalud
import com.example.gymhub.data.remote.GuardarFichaRequest
import com.example.gymhub.data.salud.SaludConectada
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

val NIVELES = listOf("sedentario", "bajo", "medio", "alto")
// Mismas etiquetas que las contraindicaciones del catálogo de ejercicios (CRM-RF-08)
val RESTRICCIONES = mapOf(
    "sin_impacto" to "Impacto",
    "sin_saltos" to "Saltos",
    "evitar_rodilla" to "Rodilla",
    "evitar_hombro" to "Hombro",
    "evitar_lumbar" to "Zona lumbar",
    "sin_carga_axial" to "Carga en columna",
)

data class FormularioFicha(
    val antecedentes: String = "",
    val lesiones: String = "",
    val alergias: String = "",
    val medicamentos: String = "",
    val nivel: String? = null,
    val objetivo: String = "",
    val restricciones: Set<String> = emptySet(),
) {
    fun aSolicitud(borrador: Boolean, aceptaDatos: Boolean?) = GuardarFichaRequest(
        antecedentes = antecedentes.trim().ifEmpty { null },
        lesiones = lesiones.trim().ifEmpty { null },
        alergias = alergias.trim().ifEmpty { null },
        medicamentos = medicamentos.trim().ifEmpty { null },
        nivel_actividad = nivel,
        objetivo = objetivo.trim().ifEmpty { null },
        restricciones_rutina = restricciones.toList(),
        borrador = borrador,
        acepta_tratamiento_datos_salud = aceptaDatos,
    )

    companion object {
        fun de(f: FichaSalud?) = if (f == null) FormularioFicha() else FormularioFicha(
            f.antecedentes.orEmpty(), f.lesiones.orEmpty(), f.alergias.orEmpty(), f.medicamentos.orEmpty(),
            f.nivel_actividad, f.objetivo.orEmpty(), f.restricciones_rutina.toSet(),
        )
    }
}

data class FichaUi(
    val cargando: Boolean = true,
    val formulario: FormularioFicha = FormularioFicha(),
    val version: Int? = null,
    val borrador: Boolean = false,
    val consentimientoPrevio: Boolean = false,
    val aceptaDatos: Boolean = false,
    val guardando: Boolean = false,
    val error: String? = null,
    val aviso: String? = null,
)

class FichaSaludViewModel(private val repo: Repositorio) : ViewModel() {
    private val _ui = MutableStateFlow(FichaUi())
    val ui: StateFlow<FichaUi> = _ui.asStateFlow()

    init { cargar() }

    fun cargar() = viewModelScope.launch {
        _ui.update { it.copy(cargando = true, error = null) }
        try {
            val ficha = repo.fichaSalud()
            val consentido = repo.consentimientos().any { it.tipo == "datos_salud" && it.otorgado }
            _ui.value = FichaUi(
                cargando = false,
                formulario = FormularioFicha.de(ficha),
                version = ficha?.version,
                borrador = ficha?.borrador ?: false,
                consentimientoPrevio = consentido,
                aceptaDatos = consentido,
            )
        } catch (e: Exception) {
            _ui.update { it.copy(cargando = false, error = e.mensaje()) }
        }
    }

    fun cambiar(cambio: FormularioFicha.() -> FormularioFicha) = _ui.update { it.copy(formulario = it.formulario.cambio(), aviso = null) }
    fun aceptar(v: Boolean) = _ui.update { it.copy(aceptaDatos = v) }

    /** APP-RF-09: se puede guardar a medias (borrador) y terminar después. */
    fun guardar(borrador: Boolean) {
        val u = _ui.value
        if (!u.aceptaDatos) {
            _ui.update { it.copy(error = "Para guardar tu ficha necesitamos tu consentimiento para tratar datos de salud.") }
            return
        }
        _ui.update { it.copy(guardando = true, error = null, aviso = null) }
        viewModelScope.launch {
            try {
                val f = repo.guardarFicha(u.formulario.aSolicitud(borrador, if (u.consentimientoPrevio) null else true))
                _ui.update {
                    it.copy(
                        guardando = false, version = f.version, borrador = f.borrador, consentimientoPrevio = true,
                        aviso = if (borrador) "Borrador guardado." else "Ficha enviada a tu entrenador.",
                    )
                }
            } catch (e: Exception) {
                _ui.update { it.copy(guardando = false, error = e.mensaje()) }
            }
        }
    }
}

/** APP-RF-09 y APP-RNF-03: cuestionario de salud, sin capturas de pantalla. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FichaSaludScreen(onBack: () -> Unit) {
    PantallaSegura()
    val vm = vm { FichaSaludViewModel(it) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val f = ui.formulario

    Pantalla("Ficha de salud", onBack = onBack) {
        if (ui.cargando) {
            Cargando()
            return@Pantalla
        }
        if (ui.version != null) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Etiqueta("Versión ${ui.version}", Purple80)
                if (ui.borrador) Etiqueta("Borrador", WarningAmber)
            }
        }
        Text("Tu entrenador usa esta información para adaptar tu rutina. Solo él y la administración pueden verla.", color = TextGray, fontSize = 14.sp)
        Campo(f.antecedentes, { v -> vm.cambiar { copy(antecedentes = v) } }, "Antecedentes médicos", lineas = 3)
        Campo(f.lesiones, { v -> vm.cambiar { copy(lesiones = v) } }, "Lesiones", lineas = 2)
        Campo(f.alergias, { v -> vm.cambiar { copy(alergias = v) } }, "Alergias")
        Campo(f.medicamentos, { v -> vm.cambiar { copy(medicamentos = v) } }, "Medicamentos")
        Campo(f.objetivo, { v -> vm.cambiar { copy(objetivo = v) } }, "Objetivo personal")

        Subtitulo("Nivel de actividad")
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            NIVELES.forEach { n ->
                FilterChip(
                    selected = f.nivel == n,
                    onClick = { vm.cambiar { copy(nivel = if (nivel == n) null else n) } },
                    label = { Text(etiqueta(n), fontSize = 12.sp) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = PrimaryPurple, labelColor = TextGray, selectedLabelColor = TextWhite),
                )
            }
        }
        Subtitulo("Debo evitar")
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            RESTRICCIONES.forEach { (r, texto) ->
                FilterChip(
                    selected = r in f.restricciones,
                    onClick = { vm.cambiar { copy(restricciones = if (r in restricciones) restricciones - r else restricciones + r) } },
                    label = { Text(texto, fontSize = 12.sp) },
                    colors = FilterChipDefaults.filterChipColors(selectedContainerColor = PrimaryPurple, labelColor = TextGray, selectedLabelColor = TextWhite),
                )
            }
        }

        if (!ui.consentimientoPrevio) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(ui.aceptaDatos, vm::aceptar, colors = CheckboxDefaults.colors(checkedColor = PrimaryPurple))
                Text("Autorizo a GymHub a tratar mis datos de salud conforme al aviso de privacidad.", color = TextWhite, fontSize = 14.sp)
            }
        }
        ui.error?.let { Text(it, color = ErrorRed) }
        ui.aviso?.let { Text(it, color = SuccessGreen) }
        BotonPrimario("Enviar ficha", { vm.guardar(borrador = false) }, cargando = ui.guardando)
        OutlinedButton(onClick = { vm.guardar(borrador = true) }, enabled = !ui.guardando, modifier = Modifier.fillMaxWidth()) {
            Text("Guardar borrador", color = Purple80)
        }
    }
}

data class HealthUi(
    val disponible: Boolean = false,
    val requiereInstalar: Boolean = false,
    val permisos: Boolean = false,
    val consentimiento: Boolean = false,
    val ultima: String? = null,
    val trabajando: Boolean = false,
    val mensaje: String? = null,
)

class HealthConnectViewModel(private val repo: Repositorio, private val salud: SaludConectada) : ViewModel() {
    private val _ui = MutableStateFlow(HealthUi())
    val ui: StateFlow<HealthUi> = _ui.asStateFlow()

    init { revisar() }

    fun revisar() = viewModelScope.launch {
        val consentimiento = runCatching { repo.consentimientos().any { it.tipo == "health_connect" && it.otorgado } }.getOrDefault(false)
        _ui.update {
            it.copy(
                disponible = salud.disponible(),
                requiereInstalar = salud.requiereInstalar(),
                permisos = runCatching { salud.tienePermisos() }.getOrDefault(false),
                consentimiento = consentimiento,
                ultima = runCatching { repo.estadoSalud().ultima_sincronizacion }.getOrNull(),
            )
        }
    }

    /** APP-RF-10: el socio puede revocar el uso de sus datos de Health Connect en cualquier momento. */
    fun cambiarConsentimiento(otorgar: Boolean) = viewModelScope.launch {
        _ui.update { it.copy(trabajando = true, mensaje = null) }
        try {
            repo.cambiarConsentimiento("health_connect", otorgar)
            _ui.update { it.copy(trabajando = false, consentimiento = otorgar) }
        } catch (e: Exception) {
            _ui.update { it.copy(trabajando = false, mensaje = e.mensaje()) }
        }
    }

    fun sincronizar() = viewModelScope.launch {
        _ui.update { it.copy(trabajando = true, mensaje = null) }
        try {
            val (datos, hasta) = salud.leerPendientes()
            val nuevos = repo.sincronizarSalud(datos)
            salud.marcarSincronizado(hasta)
            _ui.update { it.copy(trabajando = false, mensaje = "Sincronizado: $nuevos registros nuevos.") }
            revisar()
        } catch (e: Exception) {
            _ui.update { it.copy(trabajando = false, mensaje = e.mensaje()) }
        }
    }
}

/** APP-RF-11 y APP-RF-12: permisos de Health Connect y sincronización manual. */
@Composable
fun HealthConnectScreen(onBack: () -> Unit) {
    PantallaSegura()
    val contexto = LocalContext.current
    val salud = (contexto.applicationContext as GymHubApp).contenedor.salud
    val vm = vm { HealthConnectViewModel(it, salud) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    val pedirPermisos = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) { vm.revisar() }

    Pantalla("Health Connect", onBack = onBack) {
        Text(
            "Con tu permiso, GymHub lee pasos, frecuencia cardiaca y calorías activas de tu reloj o apps de salud para que tu entrenador vea tu progreso.",
            color = TextGray, fontSize = 14.sp,
        )
        when {
            ui.requiereInstalar || !ui.disponible -> Tarjeta(borde = WarningAmber) {
                Text("Health Connect no está disponible en este teléfono.", color = TextWhite)
                if (ui.requiereInstalar) {
                    TextButton(onClick = {
                        contexto.startActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        )
                    }) { Text("Instalar o actualizar", color = Purple80) }
                }
            }
            else -> {
                Tarjeta {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Permisos del teléfono", color = TextWhite, fontWeight = FontWeight.Bold)
                            Text(if (ui.permisos) "Concedidos" else "Pendientes", color = if (ui.permisos) SuccessGreen else WarningAmber, fontSize = 13.sp)
                        }
                        if (!ui.permisos) TextButton(onClick = { pedirPermisos.launch(salud.permisos) }) { Text("Conceder", color = Purple80) }
                    }
                    HorizontalDivider(color = BorderColor)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Compartir con GymHub", color = TextWhite, fontWeight = FontWeight.Bold)
                            Text("Puedes revocarlo cuando quieras.", color = TextGray, fontSize = 13.sp)
                        }
                        Switch(
                            checked = ui.consentimiento,
                            onCheckedChange = vm::cambiarConsentimiento,
                            enabled = !ui.trabajando,
                            colors = SwitchDefaults.colors(checkedTrackColor = PrimaryPurple),
                        )
                    }
                }
                Text("Última sincronización: ${fechaHora(ui.ultima)}", color = TextGray, fontSize = 14.sp)
                BotonPrimario("Sincronizar ahora", vm::sincronizar, habilitado = ui.permisos && ui.consentimiento, cargando = ui.trabajando)
            }
        }
        ui.mensaje?.let { Text(it, color = TextWhite) }
    }
}
