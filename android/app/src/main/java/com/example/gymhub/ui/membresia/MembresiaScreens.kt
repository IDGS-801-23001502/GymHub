package com.example.gymhub.ui.membresia

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.example.gymhub.data.Datos
import com.example.gymhub.data.Repositorio
import com.example.gymhub.data.remote.Credencial
import com.example.gymhub.data.remote.MembresiaDetalle
import com.example.gymhub.ui.componentes.*
import com.example.gymhub.ui.theme.*
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Carga un recurso con copia offline y lo expone como [Estado]. */
open class CargaViewModel<T>(private val cargar: suspend () -> Datos<T>) : ViewModel() {
    private val _estado = MutableStateFlow<Estado<T>>(Estado.Cargando)
    val estado: StateFlow<Estado<T>> = _estado.asStateFlow()

    init { recargar() }

    fun recargar() {
        if (_estado.value !is Estado.Listo) _estado.value = Estado.Cargando
        viewModelScope.launch {
            _estado.value = try {
                val d = cargar()
                Estado.Listo(d.valor, d.deCache)
            } catch (e: Exception) {
                Estado.Error(e.mensaje())
            }
        }
    }
}

class MembresiaViewModel(repo: Repositorio) : CargaViewModel<MembresiaDetalle>({ repo.membresia() })
class CredencialViewModel(repo: Repositorio) : CargaViewModel<Credencial>({ repo.credencial() })

/** APP-RF-04: plan, vigencia e historial de pagos (solo consulta). */
@Composable
fun MembresiaScreen(onBack: () -> Unit, onCredencial: () -> Unit) {
    val vm = vm { MembresiaViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()

    Pantalla("Mi membresía", onBack = onBack) {
        ContenidoEstado(estado, vm::recargar) { d, offline ->
            AvisoOffline(offline)
            val r = d.resumen
            Tarjeta(borde = PrimaryPurple.copy(alpha = 0.6f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(r?.plan?.nombre ?: "Sin membresía", color = TextWhite, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Etiqueta(textoEstadoMembresia(r?.estado ?: "sin_membresia"), colorEstadoMembresia(r?.estado ?: "sin_membresia"))
                }
                if (r != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Dato("Inicio", fecha(r.fecha_inicio))
                        Dato("Vence", fecha(r.vigente_hasta))
                        Dato("Restan", "${r.dias_restantes ?: 0} d")
                    }
                }
                BotonPrimario("Ver credencial digital", onCredencial)
                Text("Para renovar o cambiar de plan acude a recepción.", color = TextGray, fontSize = 13.sp)
            }

            Subtitulo("Historial")
            if (d.membresias.isEmpty()) Text("Sin movimientos.", color = TextGray)
            d.membresias.forEach { m ->
                Tarjeta {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(m.plan.nombre, color = TextWhite, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Etiqueta(textoEstadoMembresia(m.estado), colorEstadoMembresia(m.estado))
                    }
                    Text("${fecha(m.fecha_inicio)} – ${fecha(m.fecha_vencimiento)}${if (m.es_renovacion) " · renovación" else ""}", color = TextGray, fontSize = 14.sp)
                    m.congelamientos.forEach {
                        Text("Congelada del ${fecha(it.fecha_inicio)} al ${fecha(it.fecha_fin)}", color = WarningAmber, fontSize = 13.sp)
                    }
                    m.pagos.forEach { p ->
                        HorizontalDivider(color = BorderColor)
                        Row(Modifier.fillMaxWidth()) {
                            Column(Modifier.weight(1f)) {
                                Text(p.folio, color = TextWhite, fontSize = 14.sp)
                                Text("${fechaHora(p.fecha_pago)} · ${etiqueta(p.metodo)}", color = TextGray, fontSize = 12.sp)
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text(dinero(p.monto), color = TextWhite, fontWeight = FontWeight.Bold)
                                if (p.estado != "registrado") Text(etiqueta(p.estado), color = ErrorRed, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

fun generarQr(texto: String, tamano: Int = 640): ImageBitmap {
    val matriz = QRCodeWriter().encode(texto, BarcodeFormat.QR_CODE, tamano, tamano, mapOf(EncodeHintType.MARGIN to 1))
    val pixeles = IntArray(tamano * tamano) { i -> if (matriz[i % tamano, i / tamano]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
    return Bitmap.createBitmap(pixeles, tamano, tamano, Bitmap.Config.ARGB_8888).asImageBitmap()
}

/** APP-RF-05: credencial con QR que recepción escanea; funciona sin conexión. */
@Composable
fun CredencialScreen(onBack: () -> Unit) {
    val vm = vm { CredencialViewModel(it) }
    val estado by vm.estado.collectAsStateWithLifecycle()
    val activity = LocalContext.current.buscarActivity()

    // Brillo al máximo para que el lector lo lea a la primera
    DisposableEffect(activity) {
        val w = activity?.window
        val previo = w?.attributes?.screenBrightness
        w?.attributes = w?.attributes?.apply { screenBrightness = 1f }
        onDispose { if (w != null && previo != null) w.attributes = w.attributes.apply { screenBrightness = previo } }
    }

    Pantalla("Credencial", onBack = onBack) {
        ContenidoEstado(estado, vm::recargar) { c, offline ->
            AvisoOffline(offline, "Sin conexión: la vigencia puede no estar actualizada.")
            val qr = remember(c.qr) { generarQr(c.qr) }
            Tarjeta(borde = if (c.valida) SuccessGreen.copy(alpha = 0.6f) else ErrorRed.copy(alpha = 0.6f)) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(c.nombre, color = TextWhite, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("Folio ${c.folio}${c.sede?.let { " · $it" } ?: ""}", color = TextGray)
                    Box(Modifier.background(Color.White, RoundedCornerShape(16.dp)).padding(12.dp)) {
                        Image(qr, "Código QR de la credencial", Modifier.size(240.dp))
                    }
                    Etiqueta(textoEstadoMembresia(c.estado_membresia), colorEstadoMembresia(c.estado_membresia))
                    c.vigente_hasta?.let { Text("Vigente hasta ${fecha(it)}", color = TextGray) }
                    if (!c.valida) Text("Tu membresía no está vigente; acude a recepción.", color = ErrorRed, fontSize = 14.sp)
                }
            }
        }
    }
}
