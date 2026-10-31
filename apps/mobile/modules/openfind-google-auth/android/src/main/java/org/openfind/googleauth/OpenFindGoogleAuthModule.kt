package org.openfind.googleauth

import android.util.Base64
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Native transport/provider bridge; only the backend can verify an OpenFind session. */
class OpenFindGoogleAuthModule : Module() {
  private val active = AtomicBoolean(false)
  private val transport = AuthHttpsTransport()

  override fun definition() = ModuleDefinition {
    Name("OpenFindGoogleAuth")

    // Generate a fresh 32-byte secret per attempt. The server stores only the
    // domain-separated SHA-256 commitment, never the raw verifier.
    Function("createAttemptProof") {
      val bytes = ByteArray(32)
      SecureRandom().nextBytes(bytes)
      val verifier = Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
      val digest = MessageDigest.getInstance("SHA-256")
      digest.update("openfind:mobile-auth:verifier:v1\u0000".toByteArray(Charsets.UTF_8))
      val commitment = digest.digest(verifier.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }
      mapOf("verifier" to verifier, "verifierHash" to commitment)
    }

    // The nonce must come from a fresh server-issued attempt. Never log the
    // returned token or use it as an OpenFind session without server validation.
    AsyncFunction("requestGoogleToken") Coroutine { webClientId: String, nonce: String ->
      if (!active.compareAndSet(false, true)) {
        return@Coroutine mapOf("status" to "busy")
      }
      try {
        val activity = appContext.currentActivity
          ?: return@Coroutine mapOf("status" to "unavailable")
        if (webClientId.length !in 1..512 || webClientId != webClientId.trim() ||
          !webClientId.endsWith(".apps.googleusercontent.com") ||
          !Regex("^[A-Za-z0-9_-]{43}$").matches(nonce)) {
          return@Coroutine mapOf("status" to "invalid_input")
        }
        val option = GetSignInWithGoogleOption.Builder(webClientId).setNonce(nonce).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val response = withContext(Dispatchers.Main) {
          CredentialManager.create(activity).getCredential(activity, request)
        }
        val credential = response.credential
        if (credential !is CustomCredential ||
          credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
          return@Coroutine mapOf("status" to "unavailable")
        }
        val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
        if (token.isEmpty() || token.length > 8192) {
          return@Coroutine mapOf("status" to "unavailable")
        }
        mapOf("status" to "ok", "token" to token)
      } catch (_: GetCredentialCancellationException) {
        mapOf("status" to "cancelled")
      } catch (_: kotlinx.coroutines.CancellationException) {
        throw kotlinx.coroutines.CancellationException("Operation cancelled")
      } catch (_: Exception) {
        // Do not propagate provider errors: they may include sensitive data.
        mapOf("status" to "unavailable")
      } finally {
        active.set(false)
      }
    }

    // Only fixed mobile-auth paths and HTTPS are allowed; redirects are never
    // followed. The Java layer uses Android's default certificate verification.
    AsyncFunction("apiRequest") Coroutine { base: String, operation: String, body: String?, credential: String? ->
      try {
        val result = withContext(Dispatchers.IO) {
          transport.request(base, operation, body, credential)
        }
        mapOf("status" to result.status, "body" to result.body)
      } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
      } catch (_: Exception) {
        // Do not expose URLs, response bodies, headers, or provider exceptions.
        throw IllegalStateException("Mobile authentication request failed")
      }
    }

    // Clears Credential Manager provider state only. It does not revoke an
    // OpenFind server session or erase any locally stored session.
    AsyncFunction("clearProviderState") Coroutine { ->
      try {
        val context = appContext.reactContext
          ?: return@Coroutine false
        CredentialManager.create(context).clearCredentialState(ClearCredentialStateRequest())
        true
      } catch (_: kotlinx.coroutines.CancellationException) {
        throw kotlinx.coroutines.CancellationException("Operation cancelled")
      } catch (_: Exception) {
        false
      }
    }
  }
}
