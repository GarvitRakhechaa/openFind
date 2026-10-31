package org.openfind.googleauth;

import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import okhttp3.Cookie;
import okhttp3.CookieJar;
import okhttp3.HttpUrl;
import okhttp3.OkHttpClient;

/** Local-only JVM integration test; Android runtime and Google are not tested. */
public class AuthHttpsTransportTest {
  private interface Throwing { void run() throws Exception; }
  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }
  private static void rejected(Throwing f) throws Exception {
    try { f.run(); throw new AssertionError("Expected rejection"); }
    catch (IOException expected) { /* expected */ }
  }

  public static void main(String[] args) throws Exception {
    char[] password = "test-only-password".toCharArray();
    KeyStore keys = KeyStore.getInstance("PKCS12");
    try (InputStream stream = Files.newInputStream(Paths.get(args[0]))) { keys.load(stream, password); }
    KeyManagerFactory kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    kmf.init(keys, password);
    TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    tmf.init(keys);
    X509TrustManager trust = null;
    for (TrustManager manager : tmf.getTrustManagers()) if (manager instanceof X509TrustManager) trust = (X509TrustManager) manager;
    check(trust != null, "Missing test trust manager");
    SSLContext serverTls = SSLContext.getInstance("TLSv1.2");
    serverTls.init(kmf.getKeyManagers(), null, null);
    SSLContext clientTls = SSLContext.getInstance("TLSv1.2");
    clientTls.init(null, new TrustManager[]{trust}, null);
    HttpsServer server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    server.setHttpsConfigurator(new HttpsConfigurator(serverTls));
    AtomicInteger calls = new AtomicInteger();
    AtomicInteger followed = new AtomicInteger();
    server.createContext("/api/mobile-auth/start", exchange -> {
      exchange.getRequestBody().readAllBytes();
      calls.incrementAndGet();
      String cookie = exchange.getRequestHeaders().getFirst("Cookie");
      String reply = cookie == null ? "no-cookie" : "unexpected-cookie";
      byte[] body = reply.getBytes(StandardCharsets.UTF_8);
      exchange.getResponseHeaders().add("Set-Cookie", "ambient=from-server; Path=/");
      exchange.sendResponseHeaders(200, body.length);
      try (java.io.OutputStream out = exchange.getResponseBody()) { out.write(body); }
    });
    server.createContext("/api/mobile-auth/exchange", exchange -> {
      exchange.getRequestBody().readAllBytes();
      exchange.getResponseHeaders().add("Connection", "close");
      exchange.getResponseHeaders().add("Location", "/leak");
      exchange.sendResponseHeaders(307, -1);
      exchange.close();
    });
    server.createContext("/leak", exchange -> { followed.incrementAndGet(); exchange.sendResponseHeaders(200, -1); exchange.close(); });
    server.createContext("/api/mobile-auth/session", exchange -> {
      String value = exchange.getRequestHeaders().getFirst("Authorization");
      String reply = "Bearer signed-session".equals(value) ? "authorized" : "wrong";
      byte[] body = reply.getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(200, body.length);
      try (java.io.OutputStream out = exchange.getResponseBody()) { out.write(body); }
    });
    server.createContext("/api/mobile-auth/sign-out", exchange -> {
      exchange.getRequestBody().readAllBytes();
      byte[] body = new byte[16385];
      Arrays.fill(body, (byte) 'a');
      exchange.sendResponseHeaders(200, body.length);
      try (java.io.OutputStream out = exchange.getResponseBody()) { out.write(body); }
    });
    server.start();
    String base = "https://localhost:" + server.getAddress().getPort();
    CookieJar ambientJar = new CookieJar() {
      @Override public void saveFromResponse(HttpUrl url, List<Cookie> cookies) { }
      @Override public List<Cookie> loadForRequest(HttpUrl url) {
        return Collections.singletonList(new Cookie.Builder().name("ambient").value("leak").domain("localhost").build());
      }
    };
    OkHttpClient testClient = new OkHttpClient.Builder()
      .sslSocketFactory(clientTls.getSocketFactory(), trust)
      .cookieJar(ambientJar).followRedirects(true).build();
    AuthHttpsTransport transport = new AuthHttpsTransport(testClient);
    try {
      // Default platform trust must reject our private test CA.
      rejected(() -> new AuthHttpsTransport().request(base, "start", "{}", null));
      rejected(() -> AuthHttpsTransport.endpoint("http://localhost", "start"));
      rejected(() -> AuthHttpsTransport.endpoint("https://user:pass@localhost", "start"));
      rejected(() -> AuthHttpsTransport.endpoint("https://localhost/path", "start"));
      rejected(() -> AuthHttpsTransport.endpoint("https://localhost?x=1", "start"));
      rejected(() -> AuthHttpsTransport.endpoint(base, "unknown"));
      rejected(() -> transport.request(base, "start", "{}", "credential"));
      rejected(() -> transport.request(base, "session", null, "bad\r\nheader"));
      rejected(() -> transport.request(base, "start", "x".repeat(12289), null));
      check(transport.request(base, "start", "{}", null).body.equals("no-cookie"), "Ambient cookie sent");
      check(transport.request(base, "start", "{}", null).body.equals("no-cookie"), "Server cookie stored");
      check(calls.get() == 2, "Unexpected calls");
      rejected(() -> transport.request(base, "exchange", "{}", null));
      check(followed.get() == 0, "Redirect followed");
      check(transport.request(base, "session", null, "signed-session").body.equals("authorized"), "Bearer not delivered");
      rejected(() -> transport.request(base, "sign-out", "{}", "signed-session"));
      System.out.println("PASS: HTTPS transport rejects insecure origins, cookies, redirects and oversized responses");
    } finally {
      server.stop(0);
      testClient.dispatcher().executorService().shutdown();
      testClient.connectionPool().evictAll();
    }
  }
}
