package com.example.gymhub.ui.componentes

import com.example.gymhub.BuildConfig

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val ES = Locale.forLanguageTag("es-MX")
private val FECHA = DateTimeFormatter.ofPattern("d MMM yyyy", ES)
private val FECHA_HORA = DateTimeFormatter.ofPattern("d MMM, HH:mm", ES)
private val CORTA = DateTimeFormatter.ofPattern("d MMM", ES)

/** Las fotos subidas al CRM llegan como "/uploads/..."; se completan con la URL del backend. */
fun urlArchivo(ruta: String?): String? = when {
    ruta.isNullOrBlank() -> null
    ruta.startsWith("http") -> ruta
    else -> BuildConfig.API_URL.trimEnd('/') + ruta
}

/** "2026-11-03" → "3 nov 2026". */
fun fecha(iso: String?): String = iso?.let { runCatching { LocalDate.parse(it.take(10)).format(FECHA) }.getOrNull() } ?: "—"

fun fechaCorta(iso: String): String = runCatching { LocalDate.parse(iso.take(10)).format(CORTA) }.getOrDefault(iso)

/** Instante ISO del servidor a la hora local del teléfono. */
fun fechaHora(iso: String?): String = iso?.let {
    runCatching { Instant.parse(it).atZone(ZoneId.systemDefault()).format(FECHA_HORA) }.getOrNull()
} ?: "—"

fun dinero(monto: Double): String = String.format(ES, "$%,.2f", monto)

fun minutos(seg: Int): String = "%d:%02d".format(seg / 60, seg % 60)

fun etiqueta(valor: String): String = valor.replace('_', ' ').replaceFirstChar { it.uppercase() }
