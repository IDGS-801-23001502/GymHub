package com.example.gymhub.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.gymhub.ui.theme.*
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.Brush

@Composable fun RoutinesScreen(onRoutineClick: (String) -> Unit){
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
    ) {
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    text = "Tu Plan de Entrenamiento",
                    color = TextWhite,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }

            item { RoutineCard("Día 1: Push", "Chest Press Machine, Shoulder Press Machine, Triceps Extension", "6 Ejercicios"){ onRoutineClick("Día 1: Push") } }
            item { RoutineCard("Día 2: Pull", "Lat Pulldown, Seated Row Machine, Machine Biceps Curl", "5 Ejercicios"){ onRoutineClick("Día 1: Pull") } }
            item { RoutineCard("Día 3: Legs", "Leg Press, Leg Extension Machine, Seated Leg Curl", "6 Ejercicios"){ onRoutineClick("Día 1: Legs") } }
            item { RoutineCard("Día 4: Upper", "Pec Deck Fly, Assisted Pull-up, Lateral Raise Machine", "7 Ejercicios") { onRoutineClick("Día 1: Upper") }}
            item { RoutineCard("Día 5: Legs", "Hack Squat Machine, Calf Raise, Hip Abductor", "5 Ejercicios"){ onRoutineClick("Día 1: Legs") } }
        }
    }
}

@Composable
fun RoutineCard(title: String, machines: String, count: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .border(1.dp, BorderColor, RoundedCornerShape(20.dp)),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceDark)
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = title, color = PrimaryPurple, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text(text = count, color = TextGray, fontSize = 12.sp)
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = machines, color = TextWhite, fontSize = 14.sp, lineHeight = 20.sp)
        }
    }
}