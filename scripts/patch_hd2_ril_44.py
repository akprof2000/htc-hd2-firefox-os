"""Исправления RIL для HTC HD2 (HTC-RIL 2.2.1001G) в ril_worker.js Gecko 44 (Firefox OS 2.5).

В Gecko 44 формат v5 убран целиком — ответ SIM_STATUS всегда разбирается
как v6, поэтому правки про v5Legacy и imsSubscriptionAppIndex не нужны.
Остальное — как для Gecko 37 (см. patch_hd2_ril.py):

1. RIL_CONNECTED: не гасить радио — обратно его никто не включает.
2. app_type UNKNOWN (0) считать SIM, иначе записи карты не читаются.
3. Когда карта готова (один раз): перезапустить радио командой, задать
   предпочтительный тип сети и автоматический выбор оператора — как Android.
4. Отказ в регистрации: повторить тип сети и автовыбор (раз в 15 с, до 6 раз).
5. Ответы служебных запросов (hd2Internal) в оболочку не пересылать.
"""
import sys

HD2_PREFERRED_NETWORK_TYPE = 3  # GSM/WCDMA auto

root = sys.argv[1]
p = root + "/modules/ril_worker.js"
s = open(p, encoding="utf-8").read()

HD2_SEND = (
    '        Buf.newParcel(REQUEST_SET_PREFERRED_NETWORK_TYPE, {hd2Internal: true});\n'
    '        Buf.writeInt32(1);\n'
    '        Buf.writeInt32(%d);\n'
    '        Buf.sendParcel();\n'
    '        Buf.simpleRequest(REQUEST_SET_NETWORK_SELECTION_AUTOMATIC,\n'
    '                          {hd2Internal: true});\n' % HD2_PREFERRED_NETWORK_TYPE)

fixes = [
    # 1. RIL_CONNECTED
    ('  // Reset radio in the case that b2g restart (or crash).\n'
     '  this.setRadioEnabled({enabled: false});\n',
     '  // HD2: do not reset the radio here. Nothing turns it back on afterwards\n'
     '  // because this modem reports radio state changes unreliably.\n'),
    # 2. app_type
    ('      this.aid = app.aid;\n'
     '      this.appType = app.app_type;\n',
     '      this.aid = app.aid;\n'
     '      // HD2: HTC-RIL 2.2 reports app_type UNKNOWN (0) for a plain GSM SIM.\n'
     '      if (app.app_type === CARD_APPTYPE_UNKNOWN) {\n'
     '        app.app_type = CARD_APPTYPE_SIM;\n'
     '      }\n'
     '      this.appType = app.app_type;\n'),
    # 3. когда карта готова
    ('      ICCRecordHelper.fetchICCRecords();\n'
     '    }\n'
     '\n'
     '    this.cardState = newCardState;\n',
     '      ICCRecordHelper.fetchICCRecords();\n'
     '\n'
     '      // HD2: HTC-RIL 2.2 registers only after the radio is switched on by\n'
     '      // command, the preferred network type is set and automatic operator\n'
     '      // selection is requested (as Android does). Once: switching the radio\n'
     '      // off resets the card, and it becomes ready again right here.\n'
     '      // On a cold boot the modem may not be ready yet — the watchdog\n'
     '      // repeats the cycle while there is no registration.\n'
     '      if (!this._hd2RadioCycled) {\n'
     '        this._hd2RadioCycled = true;\n'
     '        if (DEBUG) this.context.debug("HD2: card ready, cycling radio");\n'
     '        this._hd2CycleRadio();\n'
     '        this._hd2ScheduleWatch();\n'
     '      }\n'
     '    }\n'
     '\n'
     '    this.cardState = newCardState;\n'),
    # 4. повтор при отказе в регистрации
    ('  _processVoiceRegistrationState: function(state) {\n'
     '    let rs = this.voiceRegistrationState;\n'
     '    let stateChanged = this._processCREG(rs, state);\n',
     '  // HD2: switch the radio off and on by command, then set the preferred\n'
     '  // network type and automatic operator selection — what Android does.\n'
     '  _hd2CycleRadio: function() {\n'
     '    let Buf = this.context.Buf;\n'
     '    Buf.newParcel(REQUEST_RADIO_POWER, {enabled: false});\n'
     '    Buf.writeInt32(1);\n'
     '    Buf.writeInt32(0);\n'
     '    Buf.sendParcel();\n'
     '    Buf.newParcel(REQUEST_RADIO_POWER, {enabled: true});\n'
     '    Buf.writeInt32(1);\n'
     '    Buf.writeInt32(1);\n'
     '    Buf.sendParcel();\n'
     + HD2_SEND.replace('        ', '    ') +
     '  },\n'
     '\n'
     '  // HD2: on a cold boot the first cycle may come before the modem is ready,\n'
     '  // and it then stays unregistered. Every 45 s, while not registered,\n'
     '  // repeat the full cycle (at most 5 times). A radio turned off on purpose\n'
     '  // (airplane mode) is left alone.\n'
     '  _hd2WatchCount: 0,\n'
     '  _hd2WatchTimer: null,\n'
     '  _hd2ScheduleWatch: function() {\n'
     '    if (this._hd2WatchTimer) {\n'
     '      return;\n'
     '    }\n'
     '    this._hd2WatchTimer = setTimeout(() => {\n'
     '      this._hd2WatchTimer = null;\n'
     '      if (this.voiceRegistrationState.connected) {\n'
     '        this._hd2WatchCount = 0;\n'
     '        return;\n'
     '      }\n'
     '      if (this.radioState != GECKO_RADIOSTATE_ENABLED ||\n'
     '          this._hd2WatchCount >= 5) {\n'
     '        return;\n'
     '      }\n'
     '      this._hd2WatchCount++;\n'
     '      if (DEBUG) this.context.debug("HD2: not registered, radio cycle " + this._hd2WatchCount);\n'
     '      this._hd2CycleRadio();\n'
     '      this._hd2ScheduleWatch();\n'
     '    }, 45000);\n'
     '  },\n'
     '\n'
     '  // HD2: after a registration denial HTC-RIL 2.2 does not search again by\n'
     '  // itself. Rate-limited: once per 15 s, at most 6 times in a row.\n'
     '  _hd2RetryCount: 0,\n'
     '  _hd2LastRetry: 0,\n'
     '  _hd2RetryRegistration: function() {\n'
     '    let now = Date.now();\n'
     '    if (this._hd2RetryCount >= 6 || now - this._hd2LastRetry < 15000) {\n'
     '      return;\n'
     '    }\n'
     '    this._hd2RetryCount++;\n'
     '    this._hd2LastRetry = now;\n'
     '    if (DEBUG) this.context.debug("HD2: registration denied, retry " + this._hd2RetryCount);\n'
     '    let Buf = this.context.Buf;\n'
     + HD2_SEND.replace('        ', '    ') +
     '  },\n'
     '\n'
     '  _processVoiceRegistrationState: function(state) {\n'
     '    let rs = this.voiceRegistrationState;\n'
     '    let stateChanged = this._processCREG(rs, state);\n'
     '    if (rs.regState === NETWORK_CREG_STATE_DENIED) {\n'
     '      this._hd2RetryRegistration();\n'
     '    } else if (rs.connected) {\n'
     '      this._hd2RetryCount = 0;\n'
     '    }\n'),
    # 5a. ответ типа сети
    ('RilObject.prototype[REQUEST_SET_PREFERRED_NETWORK_TYPE] = function REQUEST_SET_PREFERRED_NETWORK_TYPE(length, options) {\n'
     '  this.sendChromeMessage(options);\n',
     'RilObject.prototype[REQUEST_SET_PREFERRED_NETWORK_TYPE] = function REQUEST_SET_PREFERRED_NETWORK_TYPE(length, options) {\n'
     '  if (options.hd2Internal) {\n'
     '    return;\n'
     '  }\n'
     '  this.sendChromeMessage(options);\n'),
    # 5b. ответ автовыбора
    ('    this._updateNetworkSelectionMode(GECKO_NETWORK_SELECTION_AUTOMATIC);\n'
     '  }\n'
     '  this.sendChromeMessage(options);\n',
     '    this._updateNetworkSelectionMode(GECKO_NETWORK_SELECTION_AUTOMATIC);\n'
     '  }\n'
     '  if (options.hd2Internal) {\n'
     '    if (DEBUG) this.context.debug("HD2: automatic network selection, error " +\n'
     '                                  options.errorMsg);\n'
     '    return;\n'
     '  }\n'
     '  this.sendChromeMessage(options);\n'),
]
for old, new in fixes:
    n = s.count(old)
    if n != 1:
        sys.exit("ril_worker.js: образец встречается %d раз (нужен 1):\n%s" % (n, old))
    s = s.replace(old, new, 1)

open(p, "w", encoding="utf-8").write(s)
print("исправления RIL для HD2 (Gecko 44) внесены: %d" % len(fixes))
