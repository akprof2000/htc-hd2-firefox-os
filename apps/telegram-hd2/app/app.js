/* Telegram для Firefox OS 2.5 на HTC HD2.
 * Данные берутся с сервера MPGram (api.php, mpgram-web), интерфейс свой.
 * Телефон не занимается MTProto: связь с Telegram держит сервер.
 * Только ES5: движок Gecko 44. */
(function () {
  'use strict';

  var SERVER = 'https://mp.nnproject.cc';
  var API_VERSION = 12;
  var PAGE = 30;

  var $ = function (id) { return document.getElementById(id); };

  function log(msg) {
    var line = '[Telegram] ' + msg;
    try { dump(line + '\n'); } catch (e) {}
    try { console.log(line); } catch (e) {}
  }

  window.onerror = function (msg, url, line) {
    log('ОШИБКА ' + msg + ' (' + url + ':' + line + ')');
  };

  // --------------------------------------------------------------- хранилище

  function saved(key, value) {
    try {
      if (value === undefined) { return localStorage.getItem(key); }
      if (value === null) { localStorage.removeItem(key); } else { localStorage.setItem(key, value); }
    } catch (e) { /* хранилища может не быть */ }
    return value;
  }

  var server = saved('server') || SERVER;
  var token = saved('user') || null;

  // --------------------------------------------------------------- сеть

  function url(method, params) {
    var q = 'v=' + API_VERSION + '&method=' + encodeURIComponent(method);
    for (var k in params) {
      if (params[k] !== undefined && params[k] !== null) {
        q += '&' + k + '=' + encodeURIComponent(params[k]);
      }
    }
    return server + '/api.php?' + q;
  }

  // Запрос к серверу. cb(ошибка, ответ).
  function api(method, params, cb) {
    var full = url(method, params);
    log('GET ' + method);
    var xhr = new XMLHttpRequest({ mozSystem: true });
    var done = false;
    function finish(err, data) {
      if (done) { return; }
      done = true;
      cb(err, data);
    }
    xhr.open('GET', full, true);
    xhr.timeout = 40000;
    if (token) { xhr.setRequestHeader('X-mpgram-user', token); }
    xhr.setRequestHeader('X-mpgram-unicode', '1');
    xhr.setRequestHeader('X-mpgram-app-version', 'HD2 0.1');
    xhr.setRequestHeader('X-mpgram-device', 'HTC HD2');
    xhr.setRequestHeader('X-mpgram-system', 'Firefox OS 2.5');
    xhr.onload = function () {
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch (e) {}
      if (!data) { return finish('сервер ответил непонятным'); }
      if (data.error) {
        log('ошибка сервера: ' + JSON.stringify(data.error));
        return finish(data.error.message || 'ошибка сервера', data);
      }
      finish(null, data);
    };
    xhr.onerror = function () { log('сеть: ' + method); finish('нет связи с сервером'); };
    xhr.ontimeout = function () { finish('сервер не ответил'); };
    xhr.send();
  }

  // Отправка файла — многочастным запросом (обычный GET файлы не примет).
  function apiUpload(method, params, file, cb) {
    var form = new FormData();
    for (var k in params) {
      if (params[k] !== undefined && params[k] !== null) { form.append(k, params[k]); }
    }
    if (file) { form.append('file', file, file.name || 'file'); }
    var xhr = new XMLHttpRequest({ mozSystem: true });
    log('POST ' + method);
    xhr.open('POST', server + '/api.php?v=' + API_VERSION + '&method=' + method, true);
    xhr.timeout = 180000;
    if (token) { xhr.setRequestHeader('X-mpgram-user', token); }
    xhr.setRequestHeader('X-mpgram-unicode', '1');
    xhr.onload = function () {
      var d = null;
      try { d = JSON.parse(xhr.responseText); } catch (e) {}
      if (!d) { return cb('сервер ответил непонятным'); }
      if (d.error) { return cb(d.error.message || 'ошибка сервера'); }
      cb(null, d);
    };
    xhr.onerror = function () { cb('нет связи с сервером'); };
    xhr.ontimeout = function () { cb('сервер не ответил'); };
    xhr.send(form);
  }

  // --------------------------------------------------------------- экраны

  var stack = [];

  function show(id) {
    stack = stack.filter(function (s) { return s !== id; });
    stack.push(id);
    ['login', 'chats', 'chat', 'stickers', 'settings'].forEach(function (s) { $(s).hidden = s !== id; });
  }

  function goBack() {
    stack.pop();
    show(stack.length ? stack.pop() : 'chats');
  }

  // --------------------------------------------------------------- вход

  var loginPhone = '';
  var captchaId = null;
  var codeHash = null;

  function loginError(text) {
    $('login-error').hidden = !text;
    $('login-error').textContent = text || '';
  }

  function loginStep(step) {
    ['form-phone', 'form-captcha', 'form-code', 'form-pass'].forEach(function (f) {
      $(f).hidden = f !== step;
    });
  }

  // Картинку с кодом разгадывает человек — она для того и нужна.
  function showCaptcha(id) {
    captchaId = id;
    $('captcha-img').src = url('getCaptchaImg', { captcha_id: id }) + '&r=' + Date.now();
    $('captcha').value = '';
    loginStep('form-captcha');
  }

  function sendPhone(captchaKey) {
    loginError('');
    api('phoneLogin', {
      phone: loginPhone,
      captcha_id: captchaId || undefined,
      captcha_key: captchaKey || undefined
    }, function (err, d) {
      if (err) { return loginError(err); }
      if (d.user) { token = saved('user', d.user); }
      switch (d.res) {
      case 'need_captcha':
      case 'captcha_expired':
      case 'captcha_invalid':
        if (d.res !== 'need_captcha') { loginError('Символы не совпали, попробуйте ещё раз.'); }
        return showCaptcha(d.captcha_id);
      case 'code_sent':
        codeHash = d.phone_code_hash || null;
        $('code').value = '';
        return loginStep('form-code');
      case 'phone_number_invalid':
        loginStep('form-phone');
        return loginError('Неверный номер телефона.');
      default:
        loginStep('form-phone');
        return loginError('Ответ сервера: ' + (d.message || d.res));
      }
    });
  }

  function afterLogin() {
    loginStep('form-phone');
    loginError('');
    show('chats');
    loadChats();
  }

  $('form-phone').addEventListener('submit', function (e) {
    e.preventDefault();
    loginPhone = $('phone').value.replace(/[^0-9+]/g, '');
    if (loginPhone.length < 6) { return loginError('Введите номер целиком, с кодом страны.'); }
    saved('phone', loginPhone);
    captchaId = null;
    sendPhone(null);
  });

  $('form-captcha').addEventListener('submit', function (e) {
    e.preventDefault();
    var key = $('captcha').value.trim();
    if (!key) { return; }
    sendPhone(key);
  });

  $('form-code').addEventListener('submit', function (e) {
    e.preventDefault();
    loginError('');
    api('completePhoneLogin', { code: $('code').value.trim() }, function (err, d) {
      if (err) { return loginError(err); }
      switch (d.res) {
      case 1:
      case 'no_password':
        return afterLogin();
      case 'password':
        $('pass').value = '';
        return loginStep('form-pass');
      case 'phone_code_invalid':
        return loginError('Неверный код.');
      case 'phone_code_expired':
        return loginError('Код устарел, запросите новый.');
      case 'need_signup':
        return loginError('У этого номера нет учётной записи Telegram.');
      default:
        return loginError('Ответ сервера: ' + (d.message || d.res));
      }
    });
  });

  $('resend').addEventListener('click', function () {
    api('resendCode', { phone: loginPhone, hash: codeHash }, function (err) {
      loginError(err || 'Код выслан ещё раз.');
    });
  });

  $('form-pass').addEventListener('submit', function (e) {
    e.preventDefault();
    loginError('');
    api('complete2faLogin', { password: $('pass').value }, function (err, d) {
      if (err) { return loginError(err); }
      if (d.res === 1 || d.res === 'no_password') { return afterLogin(); }
      loginError('Пароль не подошёл.');
    });
  });

  // --------------------------------------------------------------- чаты

  var names = {};   // имя по идентификатору собеседника

  function peerName(id) {
    return names[id] || id;
  }

  function fillNames(d) {
    var u = d.users || {}, c = d.chats || {}, k;
    for (k in u) {
      names[k] = ((u[k].fn || '') + ' ' + (u[k].ln || '')).trim() || u[k].name || k;
    }
    for (k in c) { names[k] = c[k].t || c[k].name || k; }
  }

  function centerMsg(list, text, isError) {
    list.innerHTML = '';
    var li = document.createElement('li');
    li.className = 'msg-center' + (isError ? ' error' : '');
    li.textContent = text;
    list.appendChild(li);
  }

  function loadChats() {
    var list = $('chat-list');
    centerMsg(list, 'Загрузка…');
    api('getDialogs', { limit: 40 }, function (err, d) {
      if (err) {
        if (/authoriz/i.test(err)) { token = saved('user', null); return show('login'); }
        return centerMsg(list, err, true);
      }
      fillNames(d);
      list.innerHTML = '';
      (d.dialogs || []).forEach(function (dlg) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#';
        a.dataset.peer = dlg.id;

        var aside = document.createElement('aside');
        aside.className = 'ava';
        var img = document.createElement('img');
        img.src = server + '/ava.php?c=' + encodeURIComponent(dlg.id) + '&p=r50&a=1' +
          (token ? '&user=' + encodeURIComponent(token) : '');
        img.onerror = function () { this.removeAttribute('src'); };
        aside.appendChild(img);
        a.appendChild(aside);

        var box = document.createElement('div');

        var top = document.createElement('p');
        top.className = 'name';
        var title = document.createElement('span');
        title.className = 'title';
        title.textContent = peerName(dlg.id);
        top.appendChild(title);
        if (dlg.unread) {
          var b = document.createElement('span');
          b.className = 'unread';
          b.textContent = dlg.unread;
          top.appendChild(b);
        }
        box.appendChild(top);

        var sub = document.createElement('p');
        sub.className = 'last';
        var m = dlg.msg;
        if (m) {
          var pre = m.out ? 'вы: ' : (m.from_id && String(m.from_id) !== String(dlg.id) ?
            peerName(m.from_id) + ': ' : '');
          sub.textContent = pre + (m.text || mediaText(m) || '');
        }
        box.appendChild(sub);
        a.appendChild(box);

        li.appendChild(a);
        list.appendChild(li);
      });
      if (!list.children.length) { centerMsg(list, 'Чатов нет'); }
      log('чатов: ' + (d.dialogs || []).length);
    });
  }

  // Картинки сервер готовит сам: уменьшает и переводит в JPEG.
  function fileUrl(m, params) {
    return server + '/file.php?c=' + encodeURIComponent(m.peer_id || curPeer) +
      '&m=' + encodeURIComponent(m.id) + '&' + params +
      (token ? '&user=' + encodeURIComponent(token) : '');
  }

  function mediaImage(m) {
    if (!m.media || !m.id || m.media.hide) { return null; }
    var t = m.media.type;
    var src = null;
    if (t === 'photo') {
      src = fileUrl(m, 'p=rprev&s=320');
    } else if (t === 'sticker') {
      src = fileUrl(m, 'p=rsprevs&s=160');
    } else if (t === 'document' && m.media.thumb && !m.media.audio && !m.media.voice) {
      src = fileUrl(m, 'p=thumbrprev&s=320');
    }
    if (!src) { return null; }
    var img = document.createElement('img');
    img.className = 'pic';
    img.src = src;
    img.alt = mediaText(m);
    img.onerror = function () {
      var note = document.createElement('div');
      note.className = 'media';
      note.textContent = mediaText(m);
      if (this.parentNode) { this.parentNode.replaceChild(note, this); }
    };
    return img;
  }

  // Файл, музыка, голосовое: ссылка открывается системой (браузер, плеер),
  // звук играет прямо в переписке.
  function mediaAttachment(m) {
    if (!m.media || !m.id || m.media.hide) { return null; }
    var md = m.media;
    if (md.type !== 'document') { return null; }

    if (md.voice || md.audio) {
      var box = document.createElement('div');
      var audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.className = 'sound';
      audio.src = md.voice ?
        server + '/voice.php?c=' + encodeURIComponent(m.peer_id || curPeer) +
          '&m=' + encodeURIComponent(m.id) + (token ? '&user=' + encodeURIComponent(token) : '') :
        fileUrl(m, 'p=');
      box.appendChild(audio);
      var cap = document.createElement('div');
      cap.className = 'media';
      cap.textContent = md.voice ? 'голосовое сообщение' :
        ((md.artist ? md.artist + ' — ' : '') + (md.title || md.name || 'аудио'));
      box.appendChild(cap);
      return box;
    }

    var a = document.createElement('a');
    a.className = 'file';
    a.href = '#';
    a.dataset.url = fileUrl(m, 'p=');
    a.textContent = (md.name || 'файл') + (md.size ? ' · ' + fmtSize(md.size) : '');
    return a;
  }

  function fmtSize(n) {
    if (n > 1048576) { return (Math.round(n / 104857.6) / 10 + '').replace('.', ',') + ' МБ'; }
    if (n > 1024) { return Math.round(n / 1024) + ' КБ'; }
    return n + ' Б';
  }

  // Открыть файл вне приложения: системой Firefox OS или браузером.
  function openOutside(url) {
    log('открываю ' + url);
    try {
      if (window.MozActivity) {
        var act = new MozActivity({ name: 'view', data: { type: 'url', url: url } });
        act.onerror = function () { window.open(url, '_blank'); };
        return;
      }
    } catch (e) { log('не вышло через систему: ' + e); }
    window.open(url, '_blank');
  }

  function mediaText(m) {
    if (!m.media) { return ''; }
    var t = m.media.type;
    if (t === 'photo') { return '[фото]'; }
    if (t === 'document') {
      if (m.media.voice) { return '[голосовое сообщение]'; }
      if (m.media.audio) { return '[аудио]'; }
      return '[файл' + (m.media.name ? ': ' + m.media.name : '') + ']';
    }
    if (t === 'sticker') { return '[стикер]'; }
    if (t === 'geo' || t === 'geolive') { return '[место на карте]'; }
    if (t === 'poll') { return '[опрос]'; }
    if (t === 'contact') { return '[контакт]'; }
    if (t === 'webpage') { return m.media.url || '[ссылка]'; }
    return '[' + t + ']';
  }

  $('chat-list').addEventListener('click', function (e) {
    var a = e.target;
    while (a && a !== this && !(a.dataset && a.dataset.peer)) { a = a.parentNode; }
    if (!a || a === this) { return; }
    e.preventDefault();
    openChat(a.dataset.peer);
  });

  $('chats-refresh').addEventListener('click', function (e) {
    e.preventDefault();
    loadChats();
  });

  // --------------------------------------------------------------- меню

  function drawer(open) {
    $('drawer').hidden = !open;
    if (open) { loadMe(); }
  }

  var meLoaded = false;
  function loadMe() {
    if (meLoaded) { return; }
    api('me', {}, function (err, u) {
      if (err || !u) { return; }
      meLoaded = true;
      $('me-name').textContent = ((u.fn || '') + ' ' + (u.ln || '')).trim() || u.name || '';
      $('me-phone').textContent = u.phone ? '+' + String(u.phone).replace(/^\+/, '') :
        (u.name ? '@' + u.name : '');
      $('me-ava').src = server + '/ava.php?c=' + encodeURIComponent(u.id) + '&p=r64&a=1' +
        (token ? '&user=' + encodeURIComponent(token) : '');
    });
  }

  $('menu-btn').addEventListener('click', function (e) {
    e.preventDefault();
    drawer(true);
  });

  $('drawer').addEventListener('click', function (e) {
    if (e.target === this) { drawer(false); }
  });

  $('go-settings').addEventListener('click', function (e) {
    e.preventDefault();
    drawer(false);
    $('server').value = server;
    show('settings');
  });

  $('settings-back').addEventListener('click', function (e) {
    e.preventDefault();
    goBack();
  });

  $('server-save').addEventListener('click', function () {
    var v = $('server').value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(v)) { return; }
    if (v === server) { return goBack(); }
    server = v;
    saved('server', v);
    token = saved('user', null);
    meLoaded = false;
    show('login');
    loginStep('form-phone');
    $('server-name').textContent = server.replace(/^https?:\/\//, '');
  });

  // Выход: сервер закрывает сессию Telegram, телефон забывает ключ.
  $('go-logout').addEventListener('click', function (e) {
    e.preventDefault();
    drawer(false);
    if (!window.confirm('Выйти из аккаунта Telegram на этом телефоне?')) { return; }
    api('logout', {}, function (err) {
      log('выход: ' + (err || 'готово'));
      token = saved('user', null);
      meLoaded = false;
      names = {};
      curPeer = null;
      $('chat-list').innerHTML = '';
      show('login');
      loginStep('form-phone');
      loginError(err ? 'Сервер ответил: ' + err + '. Ключ с телефона удалён.' : '');
    });
  });

  // --------------------------------------------------------------- переписка

  var curPeer = null;
  var oldestId = null;

  function fmtTime(sec) {
    var d = new Date(sec * 1000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var now = new Date();
    var sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    return sameDay ? p(d.getHours()) + ':' + p(d.getMinutes()) :
      p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function addMessage(m, toTop) {
    var list = $('msg-list');
    var li = document.createElement('li');
    if (m.out) { li.className = 'out'; }

    if (!m.out && m.from_id && String(m.from_id) !== String(curPeer)) {
      var who = document.createElement('div');
      who.className = 'who';
      who.textContent = peerName(m.from_id);
      li.appendChild(who);
    }
    if (m.text) {
      var t = document.createElement('div');
      t.textContent = m.text;
      li.appendChild(t);
    }
    var pic = mediaImage(m);
    if (pic) { li.appendChild(pic); }
    var att = mediaAttachment(m);
    if (att) { li.appendChild(att); }
    var mt = (pic || att) ? '' : mediaText(m);
    if (mt) {
      var md = document.createElement('div');
      md.className = 'media';
      md.textContent = mt;
      li.appendChild(md);
    }
    var when = document.createElement('div');
    when.className = 'when';
    when.textContent = fmtTime(m.date);
    li.appendChild(when);

    if (toTop) { list.insertBefore(li, list.firstChild); } else { list.appendChild(li); }
  }

  function loadHistory(peer, beforeId) {
    var params = { peer: peer, limit: PAGE, media: 1, read: 1, fields: 'messages,users,chats' };
    if (beforeId) { params.offset_id = beforeId; }
    api('getHistory', params, function (err, d) {
      if (err) { log('история ' + peer + ': ' + err); return centerMsg($('msg-list'), err, true); }
      fillNames(d);
      var msgs = d.messages || [];
      if (!beforeId) { $('msg-list').innerHTML = ''; }
      // сервер отдаёт от новых к старым — показываем снизу вверх
      msgs.forEach(function (m) {
        try {
          addMessage(m, true);
        } catch (e) {
          log('сообщение ' + m.id + ' не нарисовалось: ' + e);
        }
      });
      if (msgs.length) { oldestId = msgs[msgs.length - 1].id; }
      $('msg-more').hidden = msgs.length < PAGE;
      if (!beforeId) {
        if (!msgs.length) { centerMsg($('msg-list'), 'Сообщений нет'); }
        $('msg-scroll').scrollTop = $('msg-scroll').scrollHeight;
      }
      log('сообщений: ' + msgs.length);
    });
  }

  function openChat(peer) {
    log('открываю чат ' + peer + ' (' + peerName(peer) + ')');
    curPeer = peer;
    oldestId = null;
    $('chat-title').textContent = peerName(peer);
    $('msg-list').innerHTML = '';
    $('msg-more').hidden = true;
    centerMsg($('msg-list'), 'Загрузка…');
    show('chat');
    loadHistory(peer, null);
  }

  $('msg-list').addEventListener('click', function (e) {
    var a = e.target;
    while (a && a !== this && !(a.dataset && a.dataset.url)) { a = a.parentNode; }
    if (!a || a === this) { return; }
    e.preventDefault();
    openOutside(a.dataset.url);
  });

  $('msg-more').addEventListener('click', function (e) {
    e.preventDefault();
    if (oldestId) { loadHistory(curPeer, oldestId); }
  });

  $('chat-back').addEventListener('click', function (e) {
    e.preventDefault();
    goBack();
    loadChats();
  });

  $('form-send').addEventListener('submit', function (e) {
    e.preventDefault();
    var text = $('msg-text').value;
    if (!text.trim() || !curPeer) { return; }
    $('msg-text').value = '';
    api('sendMessage', { peer: curPeer, text: text, r: Date.now() }, function (err) {
      if (err) {
        $('msg-text').value = text;
        return centerMsg($('msg-list'), err, true);
      }
      addMessage({ text: text, out: true, date: Math.floor(Date.now() / 1000) }, false);
      $('msg-scroll').scrollTop = $('msg-scroll').scrollHeight;
    });
  });

  // --------------------------------------------------------------- вложения

  function sheet(open) { $('sheet').hidden = !open; }

  $('attach').addEventListener('click', function () { sheet(true); });
  $('sheet-cancel').addEventListener('click', function () { sheet(false); });
  $('sheet').addEventListener('click', function (e) {
    if (e.target === this) { sheet(false); }
  });

  $('pick-file').addEventListener('click', function () {
    sheet(false);
    $('file').click();
  });

  $('file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f || !curPeer) { return; }
    var note = document.createElement('li');
    note.className = 'msg-center';
    note.textContent = 'Отправка «' + (f.name || 'файла') + '»…';
    $('msg-list').appendChild(note);
    $('msg-scroll').scrollTop = $('msg-scroll').scrollHeight;
    apiUpload('sendMedia', { peer: curPeer, r: Date.now() }, f, function (err) {
      note.parentNode.removeChild(note);
      if (err) { return centerMsg($('msg-list'), err, true); }
      loadHistory(curPeer, null);
    });
  });

  // --------------------------------------------------------------- стикеры

  $('pick-sticker').addEventListener('click', function () {
    sheet(false);
    openStickers();
  });

  $('stickers-back').addEventListener('click', function (e) {
    e.preventDefault();
    stickerQueue = [];
    goBack();
  });

  function openStickers() {
    show('stickers');
    var box = $('sticker-sets');
    box.innerHTML = '';
    var wait = document.createElement('p');
    wait.className = 'msg-center';
    wait.textContent = 'Загрузка…';
    box.appendChild(wait);

    api('getStickerSets', {}, function (err, d) {
      if (err) { wait.className = 'msg-center error'; wait.textContent = err; return; }
      var sets = d.res || [];
      box.innerHTML = '';
      if (!sets.length) {
        var none = document.createElement('p');
        none.className = 'msg-center';
        none.textContent = 'Наборов стикеров нет';
        return box.appendChild(none);
      }
      sets.forEach(function (set) { addStickerSet(box, set); });
    });
  }

  function addStickerSet(box, set) {
    var title = document.createElement('h2');
    title.textContent = (set.title || set.short_name || '') + '  ▸';
    title.dataset.set = set.id;
    title.dataset.hash = set.access_hash;
    box.appendChild(title);
    var row = document.createElement('div');
    row.className = 'set';
    row.hidden = true;
    box.appendChild(row);
  }

  // Набор открывается по нажатию на название: сразу все наборы телефон не потянет.
  // Картинки грузятся по очереди — сервер готовит каждый стикер отдельно,
  // и десяток одновременных запросов телефон и сервер только тормозят.
  var stickerQueue = [];
  var stickerLoading = 0;
  var stickerFails = 0;
  var STICKER_AT_ONCE = 3;
  var STICKER_FIRST = 24;

  function stickerNext() {
    while (stickerLoading < STICKER_AT_ONCE && stickerQueue.length) {
      var img = stickerQueue.shift();
      if (!img.parentNode) { continue; }
      stickerLoading++;
      img.onload = function () {
        stickerLoading--;
        this.onload = this.onerror = null;
        stickerNext();
      };
      img.onerror = function () {
        stickerLoading--;
        this.onload = this.onerror = null;
        if (stickerFails < 3) { log('стикер не загрузился: ' + this.dataset.src); }
        stickerFails++;
        this.className = 'failed';
        stickerNext();
      };
      img.src = img.dataset.src;
    }
  }

  function stickerImg(st) {
    var anim = (st.mime || '').indexOf('tgsticker') !== -1;
    var img = document.createElement('img');
    // самый дешёвый для сервера вид: маленький предпросмотр
    img.dataset.src = server + '/file.php?sticker=' + encodeURIComponent(st.id) +
      '&access_hash=' + encodeURIComponent(st.access_hash) +
      (anim ? '&p=tgss&s=100' : '&p=rstickerp&s=100') +
      (token ? '&user=' + encodeURIComponent(token) : '');
    img.alt = 'стикер';
    img.dataset.id = st.id;
    img.dataset.hash = st.access_hash;
    return img;
  }

  function loadStickerSet(title, row) {
    row.hidden = false;
    if (row.dataset.loaded) { return; }
    row.dataset.loaded = '1';
    row.textContent = 'Загрузка…';
    api('getStickerSet', { id: title.dataset.set, access_hash: title.dataset.hash },
      function (err, d) {
        if (err) { row.textContent = err; return; }
        row.textContent = '';
        var all = d.res || [];
        function addSome(from, count) {
          all.slice(from, from + count).forEach(function (st) {
            var img = stickerImg(st);
            row.appendChild(img);
            stickerQueue.push(img);
          });
          stickerNext();
        }
        addSome(0, STICKER_FIRST);
        if (all.length > STICKER_FIRST) {
          var more = document.createElement('button');
          more.type = 'button';
          more.className = 'more-stickers';
          more.textContent = 'Показать все (' + all.length + ')';
          more.onclick = function () {
            row.removeChild(more);
            addSome(STICKER_FIRST, all.length);
          };
          row.appendChild(more);
        }
        if (!row.children.length) { row.textContent = 'Стикеров нет'; }
        log('стикеров в наборе: ' + all.length);
      });
  }

  $('sticker-sets').addEventListener('click', function (e) {
    var el = e.target;
    // нажатие на название набора — раскрыть или свернуть его
    if (el.dataset && el.dataset.set) {
      var row = el.nextSibling;
      if (row.hidden) { loadStickerSet(el, row); } else { row.hidden = true; }
      return;
    }
    var img = el;
    if (!img.dataset || !img.dataset.id || !curPeer) { return; }
    api('sendMedia', {
      peer: curPeer,
      doc_id: img.dataset.id,
      doc_access_hash: img.dataset.hash,
      r: Date.now()
    }, function (err) {
      if (err) { return; }
      goBack();
      loadHistory(curPeer, null);
    });
  });

  // --------------------------------------------------------------- запуск

  $('server-name').textContent = server.replace(/^https?:\/\//, '');
  $('phone').value = saved('phone') || '';

  if (token) {
    show('chats');
    loadChats();
  } else {
    show('login');
    loginStep('form-phone');
  }
  log('запуск, сервер ' + server + (token ? ', есть сохранённый вход' : ''));
})();
