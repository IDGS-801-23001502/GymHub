package com.example.gymhub

import com.example.gymhub.data.local.CifradorAesGcm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Test
import javax.crypto.KeyGenerator

/** En el teléfono la llave vive en el Keystore; aquí se usa una llave de software. */
class CifradorTest {
    private val llave = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
    private val cifrador = CifradorAesGcm { llave }

    @Test
    fun cifraYDescifra() {
        val c = cifrador.cifrar("token-secreto", "access_token")
        assertNotEquals("token-secreto", c)
        assertEquals("token-secreto", cifrador.descifrar(c, "access_token"))
    }

    @Test
    fun cadaCifradoUsaUnIvDistinto() {
        assertNotEquals(cifrador.cifrar("x", "k"), cifrador.cifrar("x", "k"))
    }

    @Test
    fun noDescifraConOtraClaveDeDatoNiAlterado() {
        val c = cifrador.cifrar("valor", "refresh_token")
        assertNull(cifrador.descifrar(c, "access_token"))
        val alterado = c.dropLast(2) + if (c.endsWith("AA")) "BB" else "AA"
        assertNull(cifrador.descifrar(alterado, "refresh_token"))
    }

    @Test
    fun otraLlaveNoDescifra() {
        val otra = CifradorAesGcm { KeyGenerator.getInstance("AES").apply { init(256) }.generateKey() }
        assertNull(otra.descifrar(cifrador.cifrar("valor", "k"), "k"))
    }
}
