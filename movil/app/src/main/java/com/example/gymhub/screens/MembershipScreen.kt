package com.example.gymhub.screens

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gymhub.ui.theme.*

@Composable
fun MembershipScreen(onBack: () -> Unit) {
    // Animación infinita para hacer pulsar el borde del QR
    val infiniteTransition = rememberInfiniteTransition(label = "qr_pulse")
    val alphaAnim by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha_pulse"
    )

    Box(
        modifier = Modifier.fillMaxSize().background(DarkBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.offset(x = (-12).dp)) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Regresar", tint = TextWhite)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text("Credencial Digital", color = TextWhite, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("Escanea este código en recepción", color = TextGray, fontSize = 14.sp)

            Spacer(modifier = Modifier.height(40.dp))

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.5.dp, Brush.verticalGradient(listOf(PrimaryPurple.copy(alpha = 0.6f), BorderColor)), RoundedCornerShape(20.dp)),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.85f))
            ) {
                Box(
                    modifier = Modifier.fillMaxSize().background(
                        brush = Brush.verticalGradient(
                            colors = listOf(SurfaceDark, PurpleGradientEnd.copy(alpha = 0.2f))
                        )
                    )
                ) {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(80.dp)
                                .clip(CircleShape)
                                .background(DarkBackground)
                                .border(2.dp, PrimaryPurple, CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Person, contentDescription = null, tint = TextWhite, modifier = Modifier.size(40.dp))
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("Jose Isaac", color = TextWhite, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text("Folio: 801-23001497", color = TextGray, fontSize = 14.sp)

                        Spacer(modifier = Modifier.weight(1f))

                        // Contenedor del QR con el borde parpadeando (pulso morado)
                        Box(
                            modifier = Modifier
                                .size(180.dp)
                                .clip(RoundedCornerShape(16.dp))
                                .background(TextWhite)
                                .border(3.dp, PrimaryPurple.copy(alpha = alphaAnim), RoundedCornerShape(16.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.QrCode2, contentDescription = "QR", tint = DarkBackground, modifier = Modifier.size(150.dp))
                        }

                        Spacer(modifier = Modifier.weight(1f))

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(Color(0xFF4CAF50).copy(alpha = 0.2f))
                                .padding(horizontal = 16.dp, vertical = 8.dp)
                        ) {
                            Text("ACTIVA", color = Color(0xFF4CAF50), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}