const { AndroidConfig, withAndroidStyles } = require('expo/config-plugins');

/**
 * Tapa el destello BLANCO entre el splash y la primera pantalla, en Android.
 *
 * ## El síntoma
 *
 * En Android, entre el splash azul y la Home aparecía una pantalla en blanco.
 * En iOS no pasa. Encontrado el 2026-09-02 probando el build.
 *
 * ## Por qué
 *
 * `expo-splash-screen` genera este tema:
 *
 *     <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
 *       <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
 *       <item name="postSplashScreenTheme">@style/AppTheme</item>
 *     </style>
 *
 * El sistema muestra el splash y, **apenas se crea la Activity**, cambia al
 * `postSplashScreenTheme` — o sea a `AppTheme`, que no declara
 * `android:windowBackground` y hereda el de `Theme.AppCompat.DayNight`: blanco.
 * A partir de ahí la ventana es blanca hasta que React pinta su primer frame.
 *
 * `SplashScreen.preventAutoHideAsync()` no puede ayudar: es JavaScript, y el
 * hueco es justamente el rato en que el JavaScript todavía no corre.
 *
 * iOS no lo tiene porque retiene el launch screen hasta el `hideAsync()`, que sí
 * es nuestro.
 *
 * ## Qué hace esto, y qué NO hace
 *
 * Pinta la ventana del mismo azul del splash, así que el hueco deja de verse: se
 * lee como que el splash sigue ahí. **No lo acorta.** Lo que dura es cargar y
 * ejecutar el bundle, y eso se acorta solo al compilar en modo producción — en
 * desarrollo el bundle va sin minificar y con Metro de por medio.
 *
 * ## Por qué es un plugin y no una edición de `android/`
 *
 * `android/` está en `.gitignore`: cualquier `prebuild` se lleva puesto lo que
 * se edite a mano. Esto se vuelve a aplicar solo.
 *
 * Va **después** de `expo-splash-screen` en `app.json`, que es quien crea
 * `@color/splashscreen_background` en `colors.xml`. Se referencia por nombre y
 * no por hex para que el color siga viviendo en un solo lugar: cambiar el
 * `backgroundColor` del splash cambia también este.
 */
module.exports = function withAndroidWindowBackground(config) {
  return withAndroidStyles(config, (cfg) => {
    cfg.modResults = AndroidConfig.Styles.assignStylesValue(cfg.modResults, {
      add: true,
      name: 'android:windowBackground',
      value: '@color/splashscreen_background',
      parent: AndroidConfig.Styles.getAppThemeGroup(),
    });
    return cfg;
  });
};
