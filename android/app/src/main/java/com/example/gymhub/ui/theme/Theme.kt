package com.example.gymhub.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

// La app usa siempre el esquema oscuro de la marca
private val Esquema = darkColorScheme(
    primary = PrimaryPurple,
    onPrimary = TextWhite,
    secondary = PurpleGradientEnd,
    tertiary = Purple80,
    background = DarkBackground,
    onBackground = TextWhite,
    surface = SurfaceDark,
    onSurface = TextWhite,
    surfaceVariant = SurfaceDark,
    onSurfaceVariant = TextGray,
    outline = BorderColor,
    error = ErrorRed,
)

@Composable
fun GymhubTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Esquema, typography = Typography, content = content)
}
