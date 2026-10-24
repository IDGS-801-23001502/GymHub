package com.example.gymhub.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gymhub.ui.theme.*

@Composable
fun ProgressScreen() {
    Box(modifier = Modifier.fillMaxSize().background(DarkBackground)) {
        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            Text("Tu Progreso", color = TextWhite, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("Resumen semanal de actividad", color = TextGray, fontSize = 14.sp)

            Spacer(modifier = Modifier.height(32.dp))

            // Tarjeta de Adherencia (Circular)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.5.dp, Brush.verticalGradient(listOf(PrimaryPurple.copy(alpha = 0.6f), BorderColor)), RoundedCornerShape(20.dp)),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.85f)) // Ligeramente translúcido
            ) {
                Row(
                    modifier = Modifier.padding(20.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("Adherencia al plan", color = PrimaryPurple, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("4 de 5 sesiones", color = TextWhite, fontSize = 14.sp)
                    }
                    Box(contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(
                            progress = { 0.8f },
                            modifier = Modifier.size(60.dp),
                            color = PrimaryPurple,
                            strokeWidth = 6.dp,
                            trackColor = DarkBackground,
                            strokeCap = StrokeCap.Round
                        )
                        Text("80%", color = TextWhite, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Tarjeta de Estadísticas (Barras Lineales)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.5.dp, Brush.verticalGradient(listOf(PrimaryPurple.copy(alpha = 0.6f), BorderColor)), RoundedCornerShape(20.dp)),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.85f)) // Ligeramente translúcido
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.TrendingUp, contentDescription = null, tint = PrimaryPurple)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Estadísticas de Health Connect", color = TextWhite, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                    Spacer(modifier = Modifier.height(24.dp))

                    StatBar("Calorías Quemadas", "2,450 kcal", 0.7f, Icons.Default.LocalFireDepartment)
                    Spacer(modifier = Modifier.height(16.dp))
                    StatBar("Frecuencia Cardíaca", "120 lpm prom.", 0.5f, Icons.Default.TrendingUp)
                }
            }
        }
    }
}

@Composable
fun StatBar(label: String, value: String, progress: Float, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = TextGray, fontSize = 14.sp)
            Text(value, color = TextWhite, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Spacer(modifier = Modifier.height(8.dp))
        LinearProgressIndicator(
            progress = { progress },
            modifier = Modifier.fillMaxWidth().height(8.dp),
            color = PrimaryPurple,
            trackColor = DarkBackground,
            strokeCap = StrokeCap.Round
        )
    }
}