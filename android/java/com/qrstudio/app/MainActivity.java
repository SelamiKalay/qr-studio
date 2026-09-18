package com.qrstudio.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * QR Studio — web uygulamasını saran tek aktiviteli WebView kabuğu.
 *
 * Tasarım notları:
 *  - Sayfalar assets/www içinden, sanal bir https kaynağı üzerinden servis edilir.
 *    Böylece IndexedDB, localStorage ve kamera (güvenli bağlam gerektirir) çalışır.
 *    file:// kullanılsaydı IndexedDB engellenir, geçmiş özelliği çalışmazdı.
 *  - Ağ izni yoktur; tüm istekler shouldInterceptRequest içinde karşılanır.
 *  - WebView blob: indirmelerini desteklemediği için dosyalar JS köprüsü
 *    üzerinden parça parça alınıp İndirilenler klasörüne yazılır.
 */
public class MainActivity extends Activity {

    /** Gerçekte çözümlenmeyen, AndroidX'in de kullandığı ayrılmış alan adı. */
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String ASSET_ROOT = "www";

    private static final int REQ_FILE_CHOOSER = 1001;
    private static final int REQ_CAMERA = 1002;
    private static final int REQ_STORAGE = 1003;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingPermissionRequest;
    private long lastBackPress = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        // Açılışta beyaz/siyah yanıp sönmeyi azalt
        webView.setBackgroundColor(isNightMode() ? 0xFF0B0D14 : 0xFFF5F6FA);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // localStorage
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);               // sanal https kaynağı kullanıyoruz
        s.setAllowContentAccess(false);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(false);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WebView.setWebContentsDebuggingEnabled(false);
        }

        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());
        webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

        // Android 9 ve altında İndirilenler klasörü izin ister — bir kez sor
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(ORIGIN + "/index.html");
        }
    }

    private boolean isNightMode() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    /* =============================================================
     * Varlıkların sanal https kaynağı üzerinden servis edilmesi
     * ============================================================= */
    private class AppWebViewClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority())) {
                return null; // uygulama dışı istek — ağ izni olmadığı için zaten başarısız olur
            }
            return serveAsset(uri.getPath());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (ORIGIN.equals(uri.getScheme() + "://" + uri.getAuthority())) return false;
            // Harici bağlantıları sistem tarayıcısına devret
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception ignored) { }
            return true;
        }
    }

    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        // Dizin dışına çıkışı engelle
        if (path.contains("..")) return notFound();

        String assetPath = ASSET_ROOT + path;
        try {
            InputStream in = getAssets().open(assetPath);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mimeOf(assetPath), "utf-8", 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                new HashMap<String, String>(), new ByteArrayInputStream("404".getBytes()));
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.US);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".md")) return "text/markdown";
        return "application/octet-stream";
    }

    /* =============================================================
     * Dosya seçici ve kamera izni
     * ============================================================= */
    private class AppChromeClient extends WebChromeClient {

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE_CHOOSER);
                return true;
            } catch (Exception e) {
                filePathCallback = null;
                toast("Dosya seçici açılamadı.");
                return false;
            }
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    boolean wantsCamera = false;
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                    }
                    if (!wantsCamera) { request.deny(); return; }

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                            && checkSelfPermission(Manifest.permission.CAMERA)
                                != PackageManager.PERMISSION_GRANTED) {
                        pendingPermissionRequest = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    } else {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    }
                }
            });
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            return true; // konsol gürültüsünü logcat'e taşıma
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(
                        WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_CAMERA && pendingPermissionRequest != null) {
            boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
                pendingPermissionRequest.grant(
                        new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingPermissionRequest.deny();
                toast("Kamera izni verilmedi.");
            }
            pendingPermissionRequest = null;
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, results);
    }

    /* =============================================================
     * JS köprüsü — dosya kaydetme
     * ============================================================= */
    private final Map<String, ByteArrayOutputStream> transfers = new HashMap<>();

    private class Bridge {

        @JavascriptInterface
        public void fileStart(String id) {
            synchronized (transfers) {
                transfers.put(id, new ByteArrayOutputStream());
            }
        }

        @JavascriptInterface
        public void fileChunk(String id, String base64) {
            ByteArrayOutputStream out;
            synchronized (transfers) { out = transfers.get(id); }
            if (out == null) return;
            try {
                out.write(Base64.decode(base64, Base64.DEFAULT));
            } catch (Exception e) {
                synchronized (transfers) { transfers.remove(id); }
                toast(getString(R.string.save_failed) + " " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void fileEnd(String id, String name, String mime) {
            ByteArrayOutputStream out;
            synchronized (transfers) { out = transfers.remove(id); }
            if (out == null) return;
            saveToDownloads(out.toByteArray(), safeName(name), mime);
        }

        @JavascriptInterface
        public void fileAbort(String id, String reason) {
            synchronized (transfers) { transfers.remove(id); }
            toast(getString(R.string.save_failed) + " " + reason);
        }

        /** Web tarafının native kabukta çalıştığını anlaması için. */
        @JavascriptInterface
        public String platform() {
            return "android";
        }
    }

    private static String safeName(String name) {
        if (name == null || name.trim().isEmpty()) return "qr-studio";
        return name.replaceAll("[\\\\/:*?\"<>|]", "_");
    }

    private void saveToDownloads(byte[] data, String name, String mime) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, name);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri item = getContentResolver().insert(collection, values);
                if (item == null) throw new IOException("MediaStore kaydı oluşturulamadı");

                OutputStream os = getContentResolver().openOutputStream(item);
                if (os == null) throw new IOException("Yazma akışı açılamadı");
                os.write(data);
                os.close();

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(item, values, null, null);
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Klasör oluşturulamadı");
                File file = new File(dir, name);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(data);
                fos.close();
            }
            toast(getString(R.string.saved_to) + " " + name);
        } catch (Exception e) {
            toast(getString(R.string.save_failed) + " " + e.getMessage());
        }
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show();
            }
        });
    }

    /* =============================================================
     * Geri tuşu — önce açık pencereleri kapat, sonra çift basışla çık
     * ============================================================= */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // Acik bir pencere varsa once onu kapat. Sayfanin kendi kapatma
            // dugmesini tetikliyoruz ki kamera akisi da durdurulsun.
            webView.evaluateJavascript(
                    "(function(){var m=document.querySelector('.modal:not([hidden])');" +
                    "if(!m)return false;var b=m.querySelector('[data-close]');" +
                    "if(b){b.click();}else{m.hidden=true;}return true;})()",
                    new ValueCallback<String>() {
                        @Override public void onReceiveValue(String value) {
                            if ("true".equals(value)) return;
                            long now = System.currentTimeMillis();
                            if (now - lastBackPress < 2000) {
                                finish();
                            } else {
                                lastBackPress = now;
                                toast(getString(R.string.exit_hint));
                            }
                        }
                    });
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
