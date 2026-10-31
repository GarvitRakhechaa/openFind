package org.openfind.googleauth;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import okhttp3.CookieJar;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/** Candidate mobile HTTPS transport. Server origin must come from trusted app configuration. */
public final class AuthHttpsTransport {
  private static final int MAX_BODY = 12288;
  private static final int MAX_RESPONSE = 16384;
  private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");

  public static final class Result {
    public final int status;
    public final String body;
    Result(int status, String body) { this.status = status; this.body = body; }
  }

  private final OkHttpClient client;

  public AuthHttpsTransport() { this(new OkHttpClient()); }

  // Package-private injection is for local transport tests only. Production
  // uses the platform's normal certificate and hostname verification.
  AuthHttpsTransport(OkHttpClient base) {
    this.client = base.newBuilder()
      .cookieJar(CookieJar.NO_COOKIES)
      .followRedirects(false)
      .followSslRedirects(false)
      .retryOnConnectionFailure(false)
      .cache(null)
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(15, TimeUnit.SECONDS)
      .writeTimeout(15, TimeUnit.SECONDS)
      .callTimeout(30, TimeUnit.SECONDS)
      .build();
  }

  static URI endpoint(String base, String operation) throws IOException {
    if (base == null || base.length() > 2048) throw new IOException("Invalid server configuration");
    try {
      URI uri = new URI(base);
      String path = uri.getRawPath();
      if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
          uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null ||
          (path != null && !path.isEmpty() && !path.equals("/")) ||
          uri.getPort() > 65535 || uri.getPort() == 0) {
        throw new IOException("Invalid server configuration");
      }
      String endpoint;
      switch (operation) {
        case "start": endpoint = "/api/mobile-auth/start"; break;
        case "exchange": endpoint = "/api/mobile-auth/exchange"; break;
        case "session": endpoint = "/api/mobile-auth/session"; break;
        case "sign-out": endpoint = "/api/mobile-auth/sign-out"; break;
        default: throw new IOException("Invalid operation");
      }
      return uri.resolve(endpoint);
    } catch (java.net.URISyntaxException | IllegalArgumentException e) {
      throw new IOException("Invalid server configuration");
    }
  }

  private static void validateCredential(String credential) throws IOException {
    if (credential == null || credential.isEmpty() || credential.length() > 2048)
      throw new IOException("Invalid credential");
    for (int i = 0; i < credential.length(); i++) {
      char c = credential.charAt(i);
      if (c < 33 || c > 126) throw new IOException("Invalid credential");
    }
  }

  private static String readResponse(ResponseBody body) throws IOException {
    if (body == null) return "";
    if (body.contentLength() > MAX_RESPONSE) throw new IOException("Response too large");
    try (InputStream input = body.byteStream(); ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
      byte[] chunk = new byte[4096];
      int count;
      while ((count = input.read(chunk)) != -1) {
        if (buffer.size() + count > MAX_RESPONSE) throw new IOException("Response too large");
        buffer.write(chunk, 0, count);
      }
      try {
        return StandardCharsets.UTF_8.newDecoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .decode(ByteBuffer.wrap(buffer.toByteArray())).toString();
      } catch (CharacterCodingException e) {
        throw new IOException("Invalid response encoding");
      }
    }
  }

  /** body is JSON for POST; credential is absent for start/exchange. */
  public Result request(String base, String operation, String body, String credential) throws IOException {
    URI uri = endpoint(base, operation);
    boolean sessionOperation = "session".equals(operation) || "sign-out".equals(operation);
    if (sessionOperation) validateCredential(credential);
    else if (credential != null) throw new IOException("Unexpected credential");
    boolean get = "session".equals(operation);
    byte[] data = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
    if ((get && data.length != 0) || (!get && (data.length == 0 || data.length > MAX_BODY)))
      throw new IOException("Invalid request body");
    Request.Builder request = new Request.Builder().url(uri.toString())
      .header("Accept", "application/json")
      .header("Cache-Control", "no-store");
    if (sessionOperation) request.header("Authorization", "Bearer " + credential);
    if (get) request.get();
    else request.post(RequestBody.create(data, JSON));
    try (Response response = client.newCall(request.build()).execute()) {
      int status = response.code();
      if (status >= 300 && status < 400) throw new IOException("Redirect rejected");
      return new Result(status, readResponse(response.body()));
    }
  }
}
