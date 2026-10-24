package com.example.gymhub.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gymhub.R
import com.example.gymhub.ui.theme.*

@Composable
fun ProfileScreen() {
    var pushEnabled by remember { mutableStateOf(true) }
    var healthConnectEnabled by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Avatar con el logo real de GymHub
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .clip(CircleShape)
                    .background(SurfaceDark)
                    .border(2.dp, PrimaryPurple, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(id = R.drawable.gymhublogo),
                    contentDescription = "Logo Perfil",
                    modifier = Modifier.size(100.dp)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Jose Isaac", color = TextWhite, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.width(8.dp))
                // Insignia VIP simulada
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(PrimaryPurple.copy(alpha = 0.3f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text("VIP", color = PrimaryPurple, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }

            Text("Folio: 801-23001497 • UTL", color = TextGray, fontSize = 14.sp)

            Spacer(modifier = Modifier.height(32.dp))

            // Tarjeta de Configuración
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.5.dp, Brush.verticalGradient(listOf(PrimaryPurple.copy(alpha = 0.6f), BorderColor)), RoundedCornerShape(20.dp)),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.85f)) // Ligeramente translúcido
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Text("Configuración de App", color = PrimaryPurple, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(16.dp))

                    SettingRow(
                        title = "Notificaciones Push",
                        subtitle = "Avisos de rutina y vencimiento",
                        icon = Icons.Default.Notifications,
                        isChecked = pushEnabled,
                        onCheckedChange = { pushEnabled = it }
                    )

                    HorizontalDivider(color = BorderColor, modifier = Modifier.padding(vertical = 12.dp))

                    SettingRow(
                        title = "Health Connect",
                        subtitle = "Sincronizar pasos y ritmo cardíaco",
                        icon = Icons.Default.Security,
                        isChecked = healthConnectEnabled,
                        onCheckedChange = { healthConnectEnabled = it }
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Botón de Cerrar Sesión
            OutlinedButton(
                onClick = { /* Acción de logout */ },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF4C4C)),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFF4C4C)),
                shape = RoundedCornerShape(16.dp)
            ) {
                Text("Cerrar Sesión", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }
    }
}

@Composable
fun SettingRow(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, isChecked: Boolean, onCheckedChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = TextGray, modifier = Modifier.size(24.dp))
            Spacer(modifier = Modifier.width(16.dp))
            Column {
                Text(title, color = TextWhite, fontSize = 16.sp, fontWeight = FontWeight.Medium)
                Text(subtitle, color = TextGray, fontSize = 12.sp)
            }
        }
        Switch(
            checked = isChecked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = TextWhite,
                checkedTrackColor = PrimaryPurple,
                uncheckedThumbColor = TextGray,
                uncheckedTrackColor = DarkBackground,
                uncheckedBorderColor = BorderColor
            )
        )
    }
}