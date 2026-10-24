package com.example.gymhub.screens

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.example.gymhub.ui.theme.*

@Composable
fun MainScreen() {
    val navController = rememberNavController()
    var selectedItem by remember { mutableIntStateOf(0) }
    val items = listOf(
        "Inicio" to Icons.Default.Home,
        "Rutinas" to Icons.Default.List,
        "Progreso" to Icons.Default.TrendingUp,
        "Perfil" to Icons.Default.Person
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = DarkBackground,
                contentColor = TextWhite
            ) {
                items.forEachIndexed { index, item ->
                    NavigationBarItem(
                        icon = { Icon(item.second, contentDescription = item.first) },
                        label = { Text(item.first) },
                        selected = selectedItem == index,
                        onClick = {
                            selectedItem = index
                            navController.navigate(item.first)
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = TextWhite,
                            selectedTextColor = TextWhite,
                            indicatorColor = PrimaryPurple.copy(alpha = 0.5f),
                            unselectedIconColor = TextGray,
                            unselectedTextColor = TextGray
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "Inicio",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("Inicio") {
                DashboardScreen(onMembershipClick = { navController.navigate("Membresia") })
            }
            composable("Rutinas") {
                RoutinesScreen(onRoutineClick = { dia -> navController.navigate("RutinaDetalle/$dia") })
            }
            composable("Progreso") { ProgressScreen() }
            composable("Perfil") { ProfileScreen() }
            composable("Membresia") {
                MembershipScreen(onBack = { navController.popBackStack() })
            }
            composable(
                route = "RutinaDetalle/{dia}",
                arguments = listOf(navArgument("dia") { type = NavType.StringType })
            ) { backStackEntry ->
                val dia = backStackEntry.arguments?.getString("dia") ?: "Rutina"
                RoutineDetailScreen(dayTitle = dia, onBack = { navController.popBackStack() })
            }
        }
    }
}