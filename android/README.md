# Оболочка для Android

Оболочка открывает `https://campbyfire.github.io/` в Trusted Web Activity стабильной версии Chrome. Для связи через порт нужен Chrome 115 или новее. Название задачи и время приходят от сайта при изменении состояния игры. Секунды в уведомлении рисует Android. Системный срок уведомления ограничивает отсчёт, пока вкладка спит.

Для сборки нужны JDK 17, Gradle 8.11.1, Android SDK Platform 35 и Build Tools 35.0.0. Задай `ANDROID_HOME` или укажи путь к SDK в `android/local.properties`. Из корня проекта запусти `gradle -p android :app:assembleRelease`.

Для подписанной сборки нужен исходный ключ `android/.signing/lager.p12` с именем записи `lager` и паролем в переменной окружения `LAGER_STORE_PASSWORD`. На компьютере первой сборки пароль хранится в `android/.signing/password.dpapi`, зашифрованном для текущего пользователя Windows. Перед сборкой его можно передать в Gradle из PowerShell:

```powershell
$sealed = (Get-Content -Raw android/.signing/password.dpapi).Trim()
$env:LAGER_STORE_PASSWORD = [Net.NetworkCredential]::new('', (ConvertTo-SecureString $sealed)).Password
```

Сохрани ключ и доступ к паролю в личной резервной копии. Для обновления APK увеличь `versionCode`, собери его тем же ключом, проверь подпись через `apksigner verify --print-certs` и положи файл в `android/release/lager.apk`. Отпечаток сертификата должен совпасть с `public/.well-known/assetlinks.json`. GitHub Pages выкладывает APK после сборки сайта, отдельно от офлайн-кэша.
