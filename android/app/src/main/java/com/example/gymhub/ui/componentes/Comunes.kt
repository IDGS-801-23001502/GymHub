package com.example.gymhub.ui.componentes

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.gymhub.GymHubApp
import com.example.gymhub.data.Repositorio
import com.example.gymhub.ui.theme.*

/** Estado de una pantalla que carga datos. */
sealed interface Estado<out T> {
    data object Cargando : Estado<Nothing>
    data class Listo<T>(val datos: T, val deCache: Boolean = false) : Estado<T>
    data class Error(val mensaje: String) : Estado<Nothing>
}

fun Throwable.mensaje(): String = message ?: "Ocurrió un error inesperado."

/** ViewModel con el repositorio de la app inyectado. */
@Composable
inline fun <reified VM : ViewModel> vm(key: String? = null, crossinline crear: (Repositorio) -> VM): VM {
    val repo = (LocalContext.current.applicationContext as GymHubApp).contenedor.repositorio
    return viewModel(key = key, factory = viewModelFactory { initializer { crear(repo) } })
}

@Composable
fun Pantalla(
    titulo: String? = null,
    onBack: (() -> Unit)? = null,
    acciones: @Composable RowScope.() -> Unit = {},
    desplazable: Boolean = true,
    contenido: @Composable ColumnScope.() -> Unit,
) {
    Box(Modifier.fillMaxSize().background(DarkBackground)) {
        Box(
            Modifier.size(260.dp).offset((-60).dp, (-60).dp)
                .background(Brush.radialGradient(listOf(PrimaryPurple.copy(alpha = 0.25f), Color.Transparent)))
        )
        Column(Modifier.fillMaxSize()) {
            if (titulo != null) {
                Row(
                    Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (onBack != null) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Regresar", tint = TextWhite) }
                    } else {
                        Spacer(Modifier.width(16.dp))
                    }
                    Text(titulo, color = TextWhite, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    acciones()
                }
            }
            val mod = Modifier.fillMaxSize().padding(horizontal = 20.dp)
            Column(
                if (desplazable) mod.verticalScroll(rememberScrollState()) else mod,
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Spacer(Modifier.height(4.dp))
                contenido()
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

@Composable
fun Tarjeta(modifier: Modifier = Modifier, borde: Color = BorderColor, contenido: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceDark),
        border = BorderStroke(1.dp, borde),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = contenido)
    }
}

@Composable
fun Cargando() {
    Box(Modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = PrimaryPurple)
    }
}

@Composable
fun ErrorReintento(mensaje: String, onReintentar: () -> Unit) {
    Tarjeta(borde = ErrorRed.copy(alpha = 0.6f)) {
        Text(mensaje, color = TextWhite)
        OutlinedButton(onClick = onReintentar) { Text("Reintentar") }
    }
}

/** Aviso de que se muestran datos guardados en el teléfono. */
@Composable
fun AvisoOffline(visible: Boolean, texto: String = "Sin conexión: mostrando la última copia guardada.") {
    if (!visible) return
    Row(
        Modifier.fillMaxWidth().background(WarningAmber.copy(alpha = 0.15f), RoundedCornerShape(12.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(Icons.Default.CloudOff, null, tint = WarningAmber)
        Text(texto, color = WarningAmber, fontSize = 13.sp)
    }
}

@Composable
fun <T> ContenidoEstado(estado: Estado<T>, onReintentar: () -> Unit, contenido: @Composable (T, Boolean) -> Unit) {
    when (estado) {
        Estado.Cargando -> Cargando()
        is Estado.Error -> ErrorReintento(estado.mensaje, onReintentar)
        is Estado.Listo -> contenido(estado.datos, estado.deCache)
    }
}

@Composable
fun BotonPrimario(texto: String, onClick: () -> Unit, modifier: Modifier = Modifier, habilitado: Boolean = true, cargando: Boolean = false) {
    Button(
        onClick = onClick,
        enabled = habilitado && !cargando,
        modifier = modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(containerColor = PrimaryPurple, contentColor = TextWhite),
    ) {
        if (cargando) CircularProgressIndicator(Modifier.size(22.dp), color = TextWhite, strokeWidth = 2.dp)
        else Text(texto, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun Campo(
    valor: String,
    onCambio: (String) -> Unit,
    etiqueta: String,
    modifier: Modifier = Modifier,
    teclado: KeyboardType = KeyboardType.Text,
    password: Boolean = false,
    lineas: Int = 1,
    error: String? = null,
) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = valor,
        onValueChange = onCambio,
        label = { Text(etiqueta) },
        modifier = modifier.fillMaxWidth(),
        singleLine = lineas == 1,
        minLines = lineas,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else teclado),
        visualTransformation = if (password && !visible) PasswordVisualTransformation() else VisualTransformation.None,
        trailingIcon = if (password) {
            {
                IconButton(onClick = { visible = !visible }) {
                    Icon(if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility, "Mostrar contraseña")
                }
            }
        } else null,
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = PrimaryPurple,
            unfocusedBorderColor = BorderColor,
            focusedLabelColor = Purple80,
            unfocusedLabelColor = TextGray,
            focusedTextColor = TextWhite,
            unfocusedTextColor = TextWhite,
            cursorColor = PrimaryPurple,
        ),
    )
}

@Composable
fun Etiqueta(texto: String, color: Color) {
    Text(
        texto,
        color = color,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.background(color.copy(alpha = 0.15f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
fun Dato(titulo: String, valor: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(titulo, color = TextGray, fontSize = 12.sp)
        Text(valor, color = TextWhite, fontSize = 18.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun Subtitulo(texto: String) = Text(texto, color = TextWhite, fontSize = 17.sp, fontWeight = FontWeight.Bold)

/** APP-RNF-03: impide capturas de pantalla mientras la pantalla está visible. */
@Composable
fun PantallaSegura() {
    val activity = LocalContext.current.buscarActivity()
    DisposableEffect(activity) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
}

tailrec fun Context.buscarActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.buscarActivity()
    else -> null
}

fun colorEstadoMembresia(estado: String) = when (estado) {
    "activa" -> SuccessGreen
    "por_vencer", "congelada" -> WarningAmber
    else -> ErrorRed
}

fun textoEstadoMembresia(estado: String) = when (estado) {
    "activa" -> "Activa"
    "por_vencer" -> "Por vencer"
    "vencida" -> "Vencida"
    "congelada" -> "Congelada"
    "cancelada" -> "Cancelada"
    "sin_membresia" -> "Sin membresía"
    else -> estado.replaceFirstChar { it.uppercase() }
}
