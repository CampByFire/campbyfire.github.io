package io.github.campbyfire.lager;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsServiceConnection;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;

public final class LagerActivity extends Activity {
    private static final Uri SITE = Uri.parse("https://campbyfire.github.io");
    private static final String CHROME = "com.android.chrome";
    private static final int PERMISSION = 1;
    private static final int CAMP = 2;

    private CustomTabsSession session;
    private boolean bound;
    private boolean validated;
    private boolean loaded;
    private boolean requested;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && !getPreferences(MODE_PRIVATE).getBoolean("asked", false)) {
            getPreferences(MODE_PRIVATE).edit().putBoolean("asked", true).apply();
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, PERMISSION);
        } else {
            openCamp();
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == PERMISSION) openCamp();
    }

    private void openCamp() {
        if (bound) return;
        bound = CustomTabsClient.bindCustomTabsService(this, CHROME, connection);
        if (!bound) unavailable();
    }

    private void unavailable() {
        new AlertDialog.Builder(this)
                .setMessage("Чтобы открыть Лагерь с таймером в шторке, установи или обнови Google Chrome.")
                .setPositiveButton("Закрыть", (dialog, button) -> finish())
                .setOnCancelListener(dialog -> finish()).show();
    }

    private final CustomTabsServiceConnection connection = new CustomTabsServiceConnection() {
        @Override
        public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
            client.warmup(0);
            session = client.newSession(callback);
            if (session == null) {
                unavailable();
                return;
            }
            session.validateRelationship(CustomTabsService.RELATION_USE_AS_ORIGIN, SITE, null);
            Intent camp = new TrustedWebActivityIntentBuilder(SITE.buildUpon().path("/").build())
                    .build(session).getIntent();
            startActivityForResult(camp, CAMP);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            session = null;
            validated = false;
            requested = false;
        }
    };

    private final CustomTabsCallback callback = new CustomTabsCallback() {
        @Override
        public void onRelationshipValidationResult(int relation, Uri origin, boolean ok, Bundle extras) {
            if (relation != CustomTabsService.RELATION_USE_AS_ORIGIN) return;
            validated = ok;
            if (ok) connectPage();
            else Toast.makeText(LagerActivity.this,
                    "Связь с сайтом не подтверждена. Для первого запуска таймера открой Лагерь с интернетом.",
                    Toast.LENGTH_LONG).show();
        }

        @Override
        public void onNavigationEvent(int event, Bundle extras) {
            if (event == NAVIGATION_STARTED) {
                loaded = false;
                requested = false;
            } else if (event == NAVIGATION_FINISHED) {
                loaded = true;
                connectPage();
            }
        }

        @Override
        public void onPostMessage(String message, Bundle extras) {
            if (validated && requested) TaskNotification.update(LagerActivity.this, message);
        }
    };

    private void connectPage() {
        if (validated && loaded && !requested && session != null) {
            requested = session.requestPostMessageChannel(SITE, SITE, new Bundle());
            if (!requested) Toast.makeText(this, "Для таймера в шторке обнови Google Chrome.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == CAMP) finish();
    }

    @Override
    protected void onDestroy() {
        if (bound) unbindService(connection);
        super.onDestroy();
    }
}
