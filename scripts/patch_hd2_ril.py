"""Исправления RIL для HTC HD2 (HTC-RIL 2.2.1001G) в ril_worker.js Gecko 37 (Firefox OS 2.2).

Модем при подключении шлёт UNSOLICITED_RIL_CONNECTED с версией 2. Gecko верит
ей: ставит v5Legacy = true и гасит радио. На деле же модем отдаёт ответы
в формате v6, а радио после гашения никто не включает обратно.

1. RIL_CONNECTED: не менять v5Legacy по заявленной версии и не гасить радио.
2. SIM_STATUS: поле imsSubscriptionAppIndex читать всегда (формат v6).
3. app_type: модем сообщает UNKNOWN (0) для обычной GSM SIM — считать SIM,
   иначе Gecko не читает записи карты (IMSI, SPN, MSISDN).
4. Предпочтительный тип сети: без него модем не ищет сеть (регистрация
   «denied», LAC/CID пусты). Отправляем GSM/WCDMA auto, когда карта готова —
   в этот момент радио заведомо работает. Ответ служебного запроса в оболочку
   не пересылаем (hd2Internal).
"""
import sys

HD2_PREFERRED_NETWORK_TYPE = 3  # GSM/WCDMA auto

root = sys.argv[1]
p = root + "/modules/ril_worker.js"
s = open(p, encoding="utf-8").read()

fixes = [
    # 1. RIL_CONNECTED
    ('  this.version = this.context.Buf.readInt32List()[0];\n'
     '  this.v5Legacy = (this.version < 5);\n',
     '  this.version = this.context.Buf.readInt32List()[0];\n'
     '  // HD2: HTC-RIL 2.2 claims version 2 but answers in the v6 layout.\n'
     '  // Keep v5Legacy from ro.moz.ril.v5_legacy instead of the claimed version.\n'),
    ('  // Reset radio in the case that b2g restart (or crash).\n'
     '  this.setRadioEnabled({enabled: false});\n',
     '  // HD2: do not reset the radio here. Nothing turns it back on afterwards\n'
     '  // because this modem reports radio state changes unreliably.\n'),
    # 2. SIM_STATUS
    ('  iccStatus.cdmaSubscriptionAppIndex = Buf.readInt32();\n'
     '  if (!this.v5Legacy) {\n'
     '    iccStatus.imsSubscriptionAppIndex = Buf.readInt32();\n'
     '  }\n',
     '  iccStatus.cdmaSubscriptionAppIndex = Buf.readInt32();\n'
     '  // HD2: HTC-RIL 2.2 sends the v6 layout, always read the ims index.\n'
     '  iccStatus.imsSubscriptionAppIndex = Buf.readInt32();\n'),
    # 3. app_type
    ('      this.aid = app.aid;\n'
     '      this.appType = app.app_type;\n',
     '      this.aid = app.aid;\n'
     '      // HD2: HTC-RIL 2.2 reports app_type UNKNOWN (0) for a plain GSM SIM.\n'
     '      if (app.app_type === CARD_APPTYPE_UNKNOWN) {\n'
     '        app.app_type = CARD_APPTYPE_SIM;\n'
     '      }\n'
     '      this.appType = app.app_type;\n'),
    # 4a. тип сети, когда карта готова
    ('      ICCRecordHelper.fetchICCRecords();\n',
     '      ICCRecordHelper.fetchICCRecords();\n'
     '\n'
     '      // HD2: HTC-RIL 2.2 starts a full network registration only after the\n'
     '      // radio is switched on by command (as Android does) and it knows the\n'
     '      // preferred network type. Once the card is ready, cycle the radio and\n'
     '      // send the type. Only once: switching the radio off resets the card,\n'
     '      // and it becomes ready again right here.\n'
     '      if (!this._hd2RadioCycled) {\n'
     '        this._hd2RadioCycled = true;\n'
     '        if (DEBUG) this.context.debug("HD2: card ready, cycling radio");\n'
     '        let Buf = this.context.Buf;\n'
     '        Buf.newParcel(REQUEST_RADIO_POWER, {enabled: false});\n'
     '        Buf.writeInt32(1);\n'
     '        Buf.writeInt32(0);\n'
     '        Buf.sendParcel();\n'
     '        Buf.newParcel(REQUEST_RADIO_POWER, {enabled: true});\n'
     '        Buf.writeInt32(1);\n'
     '        Buf.writeInt32(1);\n'
     '        Buf.sendParcel();\n'
     '        Buf.newParcel(REQUEST_SET_PREFERRED_NETWORK_TYPE, {hd2Internal: true});\n'
     '        Buf.writeInt32(1);\n'
     '        Buf.writeInt32(%d);\n'
     '        Buf.sendParcel();\n'
     '        // Android restores the saved operator selection once SIM records\n'
     '        // are loaded, falling back to automatic. Gecko never does it on its\n'
     '        // own, and HTC-RIL denies registration without it.\n'
     '        Buf.simpleRequest(REQUEST_SET_NETWORK_SELECTION_AUTOMATIC,\n'
     '                          {hd2Internal: true});\n'
     '      }\n' % HD2_PREFERRED_NETWORK_TYPE),
    # 4b. ответ служебного запроса не пересылаем
    ('RilObject.prototype[REQUEST_SET_PREFERRED_NETWORK_TYPE] = function REQUEST_SET_PREFERRED_NETWORK_TYPE(length, options) {\n',
     'RilObject.prototype[REQUEST_SET_PREFERRED_NETWORK_TYPE] = function REQUEST_SET_PREFERRED_NETWORK_TYPE(length, options) {\n'
     '  if (options.hd2Internal) {\n'
     '    return;\n'
     '  }\n'),
    # 5. после отказа в регистрации модем сам не ищет сеть снова — толкаем его
    ('  _processVoiceRegistrationState: function(state) {\n'
     '    let rs = this.voiceRegistrationState;\n'
     '    let stateChanged = this._processCREG(rs, state);\n',
     '  // HD2: after a registration denial HTC-RIL 2.2 does not search again by\n'
     '  // itself. Re-sending the preferred network type restarts the search.\n'
     '  // Rate-limited: once per 15 s, at most 6 times in a row.\n'
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
     '    Buf.newParcel(REQUEST_SET_PREFERRED_NETWORK_TYPE, {hd2Internal: true});\n'
     '    Buf.writeInt32(1);\n'
     '    Buf.writeInt32(%d);\n'
     '    Buf.sendParcel();\n'
     '    Buf.simpleRequest(REQUEST_SET_NETWORK_SELECTION_AUTOMATIC,\n'
     '                      {hd2Internal: true});\n'
     '  },\n'
     '\n'
     '  _processVoiceRegistrationState: function(state) {\n'
     '    let rs = this.voiceRegistrationState;\n'
     '    let stateChanged = this._processCREG(rs, state);\n'
     '    if (rs.regState === NETWORK_CREG_STATE_DENIED) {\n'
     '      this._hd2RetryRegistration();\n'
     '    } else if (rs.connected) {\n'
     '      this._hd2RetryCount = 0;\n'
     '    }\n' % HD2_PREFERRED_NETWORK_TYPE),
    # 6. ответ служебного автовыбора оператора: режим обновить, в оболочку не слать
    ('    this._updateNetworkSelectionMode(GECKO_NETWORK_SELECTION_AUTOMATIC);\n'
     '  }\n'
     '\n'
     '  this.sendChromeMessage(options);\n'
     '};\n'
     'RilObject.prototype[REQUEST_SET_NETWORK_SELECTION_MANUAL]',
     '    this._updateNetworkSelectionMode(GECKO_NETWORK_SELECTION_AUTOMATIC);\n'
     '  }\n'
     '\n'
     '  if (options.hd2Internal) {\n'
     '    if (DEBUG) this.context.debug("HD2: automatic network selection, error " +\n'
     '                                  options.rilRequestError);\n'
     '    return;\n'
     '  }\n'
     '  this.sendChromeMessage(options);\n'
     '};\n'
     'RilObject.prototype[REQUEST_SET_NETWORK_SELECTION_MANUAL]'),
]
for old, new in fixes:
    n = s.count(old)
    if n != 1:
        sys.exit("ril_worker.js: образец встречается %d раз (нужен 1):\n%s" % (n, old))
    s = s.replace(old, new, 1)

open(p, "w", encoding="utf-8").write(s)
print("исправления RIL для HD2 внесены: %d" % len(fixes))
