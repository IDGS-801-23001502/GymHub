package com.example.gymhub.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gymhub.ui.theme.*
import androidx.compose.foundation.clickable

@Composable fun DashboardScreen(onMembershipClick: () -> Unit){
        // Brillo superior morado
        Box(
            modifier = Modifier
                .size(250.dp)
                .offset(x = (-50).dp, y = (-50).dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(PrimaryPurple.copy(alpha = 0.3f), Color.Transparent)
                    )
                )
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text("Welcome Back,", color = TextGray, fontSize = 14.sp)
                    Text("Jose Isaac", color = TextWhite, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                }
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(SurfaceDark)
                        .border(1.5.dp, PrimaryPurple, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Person, contentDescription = "Perfil", tint = TextWhite)
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onMembershipClick() }
                    .border(1.5.dp, Brush.verticalGradient(listOf(PrimaryPurple.copy(alpha = 0.6f), BorderColor)), RoundedCornerShape(20.dp)),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.85f)) // Ligeramente translúcido
            ){
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(PrimaryPurple.copy(alpha = 0.2f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Favorite, contentDescription = "Status", tint = PrimaryPurple, modifier = Modifier.size(20.dp))
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("Estado de Membresía", color = TextWhite, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Activa", color = TextWhite, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                    Text("Vence en 15 días", color = TextGray, fontSize = 12.sp)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                MetricCard(Modifier.weight(1f), "Sesiones", "12", "este mes", Icons.Default.Home)
                MetricCard(Modifier.weight(1f), "Racha", "4", "días seguidos", Icons.Default.LocalFireDepartment)
            }
        }
    }


@Composable
fun MetricCard(modifier: Modifier = Modifier, title: String, value: String, unit: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Card(
        modifier = modifier.border(1.dp, BorderColor, RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceDark)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Icon(icon, contentDescription = title, tint = PrimaryPurple, modifier = Modifier.size(24.dp))
            Spacer(modifier = Modifier.height(12.dp))
            Text(title, color = TextGray, fontSize = 12.sp)
            Spacer(modifier = Modifier.height(4.dp))
            Text(value, color = TextWhite, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(unit, color = TextGray, fontSize = 10.sp)
        }
    }
}