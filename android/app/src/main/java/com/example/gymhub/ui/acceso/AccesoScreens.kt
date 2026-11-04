package com.example.gymhub.ui.acceso

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.gymhub.R
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*

@Composable
private fun Avisos(ui: AccesoUi) {
    ui.error?.let { Text(it, color = ErrorRed, fontSize = 14.sp) }
    ui.aviso?.let { Text(it, color = SuccessGreen, fontSize = 14.sp) }
}

@Composable
private fun Logo() {
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(32.dp))
        Image(painterResource(R.drawable.gymhublogo), "GymHub", Modifier.size(110.dp))
    }
}

/** APP-RF-01: inicio de sesión del socio. */
@Composable
fun LoginScreen(vm: AccesoViewModel, onActivar: () -> Unit, onRecuperar: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var correo by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    Pantalla {
        Logo()
        Text("Bienvenido de vuelta", color = TextWhite, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text("Entra con el correo que registraste en recepción.", color = TextGray)
        Campo(correo, { correo = it }, "Correo", teclado = KeyboardType.Email, error = ui.errores["correo"])
        Campo(password, { password = it }, "Contraseña", password = true, error = ui.errores["password"])
        Avisos(ui)
        BotonPrimario("Iniciar sesión", { vm.login(correo, password) }, cargando = ui.cargando)
        TextButton(onClick = { vm.limpiar(); onRecuperar() }, modifier = Modifier.align(Alignment.End)) {
            Text("¿Olvidaste tu contraseña?", color = Purple80)
        }
        Tarjeta {
            Text("¿Primera vez en la app?", color = TextWhite, fontWeight = FontWeight.Bold)
            Text("Activa tu cuenta con el folio de socio que te dieron en recepción.", color = TextGray, fontSize = 14.sp)
            TextButton(onClick = { vm.limpiar(); onActivar() }) { Text("Activar mi cuenta", color = Purple80) }
        }
    }
}

/** APP-RF-01: activación con folio + correo registrados en el CRM. */
@Composable
fun ActivarScreen(vm: AccesoViewModel, onBack: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var folio by rememberSaveable { mutableStateOf("") }
    var correo by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmar by rememberSaveable { mutableStateOf("") }

    Pantalla("Activar cuenta", onBack = onBack) {
        Text("Usa el folio de tu comprobante y el mismo correo que diste al inscribirte.", color = TextGray)
        Campo(folio, { folio = it.uppercase() }, "Folio de socio (GH000123)", error = ui.errores["folio"])
        Campo(correo, { correo = it }, "Correo registrado", teclado = KeyboardType.Email, error = ui.errores["correo"])
        Campo(password, { password = it }, "Crea una contraseña", password = true, error = ui.errores["password"])
        Campo(confirmar, { confirmar = it }, "Confirma la contraseña", password = true, error = ui.errores["confirmar"])
        Text("Mínimo 10 caracteres, con mayúscula, minúscula, número y símbolo.", color = TextGray, fontSize = 12.sp)
        Avisos(ui)
        BotonPrimario("Activar", { vm.activar(folio, correo, password, confirmar) }, cargando = ui.cargando)
    }
}

/** APP-RF-01: recuperación de contraseña en dos pasos (correo → código + nueva contraseña). */
@Composable
fun RecuperarScreen(vm: AccesoViewModel, onBack: () -> Unit) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var correo by rememberSaveable { mutableStateOf("") }
    var codigo by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var confirmar by rememberSaveable { mutableStateOf("") }

    Pantalla("Recuperar contraseña", onBack = onBack) {
        if (!ui.codigoEnviado) {
            Text("Te enviaremos un código para crear una nueva contraseña.", color = TextGray)
            Campo(correo, { correo = it }, "Correo", teclado = KeyboardType.Email, error = ui.errores["correo"])
            Avisos(ui)
            BotonPrimario("Enviar código", { vm.recuperar(correo) }, cargando = ui.cargando)
        } else {
            Avisos(ui)
            Campo(codigo, { codigo = it }, "Código recibido", error = ui.errores["codigo"])
            Campo(password, { password = it }, "Nueva contraseña", password = true, error = ui.errores["password"])
            Campo(confirmar, { confirmar = it }, "Confirma la contraseña", password = true, error = ui.errores["confirmar"])
            BotonPrimario("Guardar contraseña", { vm.restablecer(codigo, password, confirmar, onBack) }, cargando = ui.cargando)
            TextButton(onClick = vm::volverAPedirCodigo) {
                Text("No recibí el código", color = Purple80, textAlign = TextAlign.Center)
            }
        }
    }
}
