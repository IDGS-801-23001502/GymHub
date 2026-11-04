package com.example.gymhub.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.example.gymhub.GymHubApp
import com.example.gymhub.MainActivity
import com.example.gymhub.R
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Canales por categoría para que el socio también pueda silenciarlas desde Android (APP-RF-14). */
object Push {
    val CANALES = mapOf(
        "vencimiento" to "Vencimiento de membresía",
        "rutina" to "Cambios en tu rutina",
        "promociones" to "Promociones",
        "avisos" to "Avisos del gimnasio",
    )
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** FCM solo funciona si la app se compiló con google-services.json. */
    fun disponible(context: Context) = FirebaseApp.getApps(context).isNotEmpty()

    fun crearCanales(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java)
        CANALES.forEach { (id, nombre) ->
            nm.createNotificationChannel(NotificationChannel(id, nombre, NotificationManager.IMPORTANCE_DEFAULT))
        }
    }

    /** Obtiene el token FCM y lo registra en el backend (APP-RF-13). */
    fun registrar(context: Context) {
        if (!disponible(context)) {
            Log.i("GymHub", "Push desactivado: falta app/google-services.json")
            return
        }
        val repo = (context.applicationContext as GymHubApp).contenedor.repositorio
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            scope.launch { runCatching { repo.registrarDispositivo(token) } }
        }
    }

    fun mostrar(context: Context, titulo: String, cuerpo: String, categoria: String) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val abrir = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_DESTINO, "notificaciones"),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(context, if (categoria in CANALES) categoria else "avisos")
            .setSmallIcon(R.drawable.ic_notificacion)
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(cuerpo))
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), n)
    }
}

class GymHubMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val repo = (applicationContext as GymHubApp).contenedor.repositorio
        scope.launch { runCatching { repo.registrarDispositivo(token) } }
    }

    // Con la app abierta FCM no pinta la notificación; con datos tampoco. Aquí se cubren ambos casos.
    override fun onMessageReceived(message: RemoteMessage) {
        val titulo = message.notification?.title ?: message.data["titulo"] ?: return
        val cuerpo = message.notification?.body ?: message.data["contenido"] ?: ""
        Push.mostrar(this, titulo, cuerpo, message.data["categoria"] ?: "avisos")
        message.data["id_notificacion"]?.toIntOrNull()?.let { id ->
            val repo = (applicationContext as GymHubApp).contenedor.repositorio
            scope.launch { runCatching { repo.marcarEntregada(id) } }
        }
    }
}
