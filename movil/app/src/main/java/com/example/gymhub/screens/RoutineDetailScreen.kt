package com.example.gymhub.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gymhub.ui.theme.*

@Composable
fun RoutineDetailScreen(dayTitle: String, onBack: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().background(DarkBackground)) {
        Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            IconButton(onClick = onBack, modifier = Modifier.offset(x = (-12).dp)) {
                Icon(Icons.Default.ArrowBack, contentDescription = "Regresar", tint = TextWhite)
            }
            Text(dayTitle, color = TextWhite, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Text("Registra tus series y peso", color = TextGray, fontSize = 14.sp)

            Spacer(modifier = Modifier.height(24.dp))

            LazyColumn(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                item { ExerciseCard("Chest Press Machine", "4 Series x 10-12 Reps") }
                item { ExerciseCard("Shoulder Press Machine", "3 Series x 12 Reps") }
                item { ExerciseCard("Triceps Extension", "3 Series x 15 Reps") }

                item {
                    Button(
                        onClick = onBack,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 16.dp)
                            .height(54.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryPurple),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Text("Finalizar Entrenamiento", color = TextWhite, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }
        }
    }
}

@Composable
fun ExerciseCard(name: String, details: String) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(1.5.dp, Brush.verticalGradient(listOf(PrimaryPurple.copy(alpha = 0.6f), BorderColor)), RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceDark.copy(alpha = 0.85f)) // Ligeramente translúcido
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(name, color = PrimaryPurple, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text(details, color = TextGray, fontSize = 12.sp)
            Spacer(modifier = Modifier.height(16.dp))

            // Simulador de series
            SetRow("Serie 1", "12 reps", "45 kg")
            SetRow("Serie 2", "10 reps", "50 kg")
            SetRow("Serie 3", "8 reps", "55 kg")
        }
    }
}

@Composable
fun SetRow(setNum: String, reps: String, weight: String) {
    var isChecked by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(setNum, color = TextWhite, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(weight, color = TextGray, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Text(reps, color = TextGray, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Checkbox(
            checked = isChecked,
            onCheckedChange = { isChecked = it },
            colors = CheckboxDefaults.colors(
                checkedColor = PrimaryPurple,
                uncheckedColor = BorderColor,
                checkmarkColor = TextWhite
            )
        )
    }
}