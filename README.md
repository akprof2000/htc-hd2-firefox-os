# Firefox OS 2.5 на HTC HD2

Сборка Firefox OS из исходников для **HTC HD2** (htcleo, Qualcomm QSD8250, 448 МБ ОЗУ) — телефона 2009 года, который изначально выпускался с Windows Mobile 6.5.

Система загружается с карты памяти через HaRET из Windows Mobile, NAND не затрагивается. В качестве базы (gonk) используется Android 4.0.4 — CyanogenMod 9 от tytung.

## Что работает

| | 2.5 (Gecko 44) |
|---|---|
| Рабочий стол, браузер с адресной строкой (rocketbar) | ✅ |
| SIM, регистрация в 3G, звонки, SMS | ✅ |
| Камера | ✅ |
| Карта памяти | ✅ |
| Звук, Wi-Fi | ✅ |
| Кнопки питания, «домой», громкость | ✅ |
| Свободная память после загрузки | ~60 МБ |

По дороге были собраны и проверены на телефоне 1.1.1, 1.2, 1.3, 1.4, 2.0, 2.1, 2.2 и 2.5.

## Главные находки

### Сотовая сеть: пять несовместимостей со старым HTC-RIL

Модем HTC-RIL 2.2.1001G (2010 год) и Gecko понимают друг друга плохо. В Android сеть работала всегда, в Firefox OS не работала ни в одной версии — не из-за модема, а из-за стыка. Всё найдено по сырым ответам модема:

1. Модем при подключении шлёт `UNSOLICITED_RIL_CONNECTED` **с версией 2**, но отвечает в **формате v6**. Gecko верит заявленной версии, неверно разбирает ответы и гасит радио, которое потом никто не включает.
2. Модем сообщает тип приложения карты как `UNKNOWN` — без типа Gecko не читает с SIM ни IMSI, ни оператора.
3. Без предпочтительного типа сети модем не ищет сеть.
4. **Главное:** Android при каждом запуске отправляет модему `SET_NETWORK_SELECTION_AUTOMATIC` — Gecko не делает этого никогда. Без этой команды HTC-RIL отказывает в регистрации за полторы секунды.
5. После отказа модем сам поиск не повторяет.

Исправления — в `ril_worker.js`: [`scripts/patch_hd2_ril_44.py`](scripts/patch_hd2_ril_44.py) (Gecko 44) и [`scripts/patch_hd2_ril.py`](scripts/patch_hd2_ril.py) (Gecko 37).

### Камера: сдвиг таблицы виртуальных методов

Системная `libgui.so` на телефоне — от CyanogenMod ICS для старых Qualcomm (`QCOM_HARDWARE`). В её `ISurfaceTexture` после `disconnect()` есть лишний метод `performQcomOperation`, которого нет в чистом Android 4.0. Gecko, собранный по чистым заголовкам, получает сдвинутую таблицу: модуль камеры вызывает `performQcomOperation`, а попадает в `queryLocalInterface` — падение на первом кадре превью.

Исправление — добавить объявление метода в заголовок gonk: [`patches/gonk/frameworks_base_include_gui_ISurfaceTexture.h.patch`](patches/gonk/frameworks_base_include_gui_ISurfaceTexture.h.patch).

### Gecko 44 на Android 4.0: ICU и RTTI

В Gecko 44 включён `Intl`, которому нужна ICU, а ей — RTTI. Системная STL Android 4.0 урезана: `std::type_info` в ней только объявлен.

- [`patches/gonk/ndk_sources_cxx-stl_system_include_typeinfo.patch`](patches/gonk/ndk_sources_cxx-stl_system_include_typeinfo.patch) — полное объявление `std::type_info` по Itanium ABI;
- `libsupc++.a` из NDK r8e (`gnu-libstdc++/4.7`) кладётся к библиотекам gonk, `-lsupc++` дописывается в `OS_LIBS` — [`patches/gecko44/objdir_config_autoconf.mk.patch`](patches/gecko44/objdir_config_autoconf.mk.patch). Через `export LIBS` нельзя: переменная попадает в сборку ICU для самого ПК.
- [`patches/gecko44/intl_icu_source_common_unicode_uobject.h.patch`](patches/gecko44/intl_icu_source_common_unicode_uobject.h.patch) — подключение `<typeinfo>`.

### Прочее

| Правка | Зачем |
|---|---|
| [`keylayout-htcleo-keypad.patch`](patches/keylayout-htcleo-keypad.patch) | Кнопка питания HD2 шлёт код `ENDCALL` (107), а Firefox OS ждёт `POWER` |
| [`gonk/bionic_libc_include_malloc.h.patch`](patches/gonk/bionic_libc_include_malloc.h.patch) | `posix_memalign` есть в libc телефона, но не объявлен в заголовках Android 4.0 (с Gecko 30) |
| [`gecko44/configure.patch`](patches/gecko44/configure.patch), [`js_src_configure.patch`](patches/gecko44/js_src_configure.patch) | В сгенерированном `configure` съедена скобка `[[:space:]]`; нынешний GNU sed отвергает — не определяется версия ICU |
| [`gecko44/dom_wifi_WifiHotspotUtils.h.patch`](patches/gecko44/dom_wifi_WifiHotspotUtils.h.patch) | Нет `<stdint.h>`/`<stddef.h>` (с Gecko 32) |
| `vold` (вне репозитория) | Карта памяти: один байт по смещению `0x7192` — `cmp r3, #3` → `cmp r3, #7` (проверка номера раздела) |

## Сборка

Окружение: WSL (Ubuntu), Python 2.7, autoconf 2.13, Android NDK r8e (компилятор **GCC 4.7** — с Gecko 37 нужен 4.6+), база gonk из заголовков AOSP 4.0.4 и библиотек с телефона.

```
scripts/mozconfig      — настройки сборки Gecko 44
scripts/configure.sh   — настройка
scripts/build.sh       — сборка
```

Грабли, на которые приходится наступать:

- **Только в один поток.** При параллельной сборке вложенный `make` подмешивает предупреждение `jobserver unavailable` в список библиотек NSS. С Gecko 32 `MOZ_MAKE_FLAGS=-j1` игнорируется — нужен `MOZ_PARALLEL_BUILD=1`.
- **`--enable-release` обязателен**, иначе подставляется системный gold (`unsupported ELF machine number 40`).
- **Gaia 1.2–2.2:** в `Makefile` проверка последнего символа строки через `${LINE\#${LINE%?}}` ломается в новом GNU make, и оболочка молча собирается пустой. Заменить на `grep -q "[*]$"`. В 2.5 переписано.
- **Gaia 2.2+** качает вспомогательный движок с отключённого сервера Mozilla. Брать XULRunner с `archive.mozilla.org/pub/xulrunner/releases/` (последний — 41) и собирать с `USE_LOCAL_XULRUNNER_SDK=1`.
- **С 1.3** отключать предзапуск процессов Nuwa: `pref('dom.ipc.processPrelaunch.enabled', false)` — иначе после загрузки остаётся ~15 МБ.

## Инструменты

- [`tools/fb2png.py`](tools/fb2png.py) — снимок экрана из `/dev/graphics/fb0`. `screencap` в Firefox OS на HD2 выдаёт чёрный кадр: он читает слои SurfaceFlinger, а Gecko рисует мимо них.
- [`tools/fixown.sh`](tools/fixown.sh) — владелец `system` для каталогов приложений после установки.

## Лицензии

Правки к Gecko распространяются на условиях MPL-2.0, к AOSP — Apache-2.0, как и исходные проекты. Двоичные файлы телефона и HTC в репозиторий не входят.
