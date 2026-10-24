package com.example.gymhub

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.gymhub.screens.LoginScreen
import com.example.gymhub.screens.MainScreen
import com.example.gymhub.screens.SplashScreen
import com.example.gymhub.ui.theme.GymhubTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            GymhubTheme {
                val navController = rememberNavController()

                NavHost(
                    navController = navController,
                    startDestination = "splash",
                    // Transiciones suaves globales (Slide & Fade)
                    enterTransition = { slideInHorizontally(initialOffsetX = { 1000 }, animationSpec = tween(400)) + fadeIn(animationSpec = tween(400)) },
                    exitTransition = { slideOutHorizontally(targetOffsetX = { -1000 }, animationSpec = tween(400)) + fadeOut(animationSpec = tween(400)) },
                    popEnterTransition = { slideInHorizontally(initialOffsetX = { -1000 }, animationSpec = tween(400)) + fadeIn(animationSpec = tween(400)) },
                    popExitTransition = { slideOutHorizontally(targetOffsetX = { 1000 }, animationSpec = tween(400)) + fadeOut(animationSpec = tween(400)) }
                ) {
                    // 1. Pantalla de Splash con animación de entrada
                    composable("splash") {
                        SplashScreen(
                            onTimeout = {
                                navController.navigate("login") {
                                    popUpTo("splash") { inclusive = true }
                                }
                            }
                        )
                    }

                    // 2. Pantalla de Login
                    composable("login") {
                        LoginScreen(
                            onLoginSuccess = {
                                navController.navigate("home") {
                                    popUpTo("login") { inclusive = true }
                                }
                            }
                        )
                    }

                    // 3. Pantalla Principal (Dashboard, Rutinas, Progreso, Perfil)
                    composable("home") {
                        MainScreen()
                    }
                }
            }
        }
    }
}