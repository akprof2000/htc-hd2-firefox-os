/* YouTube для Firefox OS 2.5 на HTC HD2.
 * Список серверов — как в notPipe (http://144.31.189.129/notPipe.json).
 * Список и поиск: Invidious, запасной — Piped.
 * Видео: yt2009 -> Piped -> Invidious, при ошибке берётся следующий источник.
 * Только ES5: движок Gecko 44. */
(function () {
  'use strict';

  var LIST_URL = 'http://144.31.189.129/notPipe.json';

  // запасной список на случай, если notPipe.json недоступен
  var FALLBACK = {
    invidious: ['http://95.182.97.252:3000', 'http://157.254.18.46:14120',
                'http://47.145.207.195:3000'],
    yt2009: ['http://yt.retrocity.org'],
    piped: ['http://82.24.19.217:8084,http://82.24.19.217:8085',
            'http://pa.dfjko.cc:8080,http://pp.dfjko.cc:8080']
  };

  var servers = FALLBACK;
  var goodInvidious = null;   // последний ответивший сервер Invidious

  var $ = function (id) { return document.getElementById(id); };

  function log(msg) {
    var line = '[YouTube] ' + msg;
    try { dump(line + '\n'); } catch (e) {}
    try { console.log(line); } catch (e) {}
  }

  window.onerror = function (msg, url, line) {
    log('ОШИБКА ' + msg + ' (' + url + ':' + line + ')');
  };

  // ---------------------------------------------------------------- сеть

  function get(url, timeout, cb) {
    var xhr = new XMLHttpRequest({ mozSystem: true });
    var done = false;
    function finish(err, data) {
      if (done) { return; }
      done = true;
      cb(err, data);
    }
    log('GET ' + url);
    xhr.open('GET', url, true);
    xhr.timeout = timeout;
    xhr.onload = function () {
      log(xhr.status + ' ' + url + ' ' + xhr.responseText.length + ' байт');
      if (xhr.status !== 200) { return finish('HTTP ' + xhr.status); }
      try {
        finish(null, JSON.parse(xhr.responseText));
      } catch (e) {
        finish('не JSON');
      }
    };
    xhr.onerror = function () { log('сеть: ' + url); finish('сеть'); };
    xhr.ontimeout = function () { log('таймаут: ' + url); finish('таймаут'); };
    xhr.send();
  }

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // Piped в списке записан как "api,proxy" — нужен адрес API.
  function pipedApi(entry) { return entry.split(',')[0]; }

  function loadServers(cb) {
    try {
      var cached = localStorage.getItem('servers');
      if (cached) { servers = JSON.parse(cached); }
    } catch (e) { /* нет хранилища — останется запасной список */ }
    get(LIST_URL, 15000, function (err, data) {
      if (!err && data && data.invidious) {
        servers = data;
        try { localStorage.setItem('servers', JSON.stringify(data)); } catch (e) {}
      }
      cb();
    });
  }

  // Перебирает серверы по очереди, пока один не даст непустой ответ.
  function tryEach(list, makeUrl, accept, cb) {
    var i = 0;
    (function next() {
      if (i >= list.length) { return cb('ни один сервер не ответил'); }
      var base = list[i++];
      get(makeUrl(base), 15000, function (err, data) {
        var items = err ? null : accept(data);
        if (items && items.length) { return cb(null, items, base); }
        next();
      });
    })();
  }

  // ---------------------------------------------------------------- списки

  function fromInvidious(base) {
    return function (data) {
      if (!data || !data.map) { return null; }
      return data.filter(function (v) {
        return v.videoId && (!v.type || v.type === 'video' || v.type === 'shortVideo');
      }).map(function (v) {
        return {
          id: v.videoId,
          title: v.title,
          author: v.author,
          authorId: v.authorId,
          length: v.lengthSeconds,
          thumb: base + '/vi/' + v.videoId + '/mqdefault.jpg'
        };
      });
    };
  }

  function fromPiped(data) {
    var arr = data && (data.items || data);
    if (!arr || !arr.map) { return null; }
    return arr.filter(function (v) {
      return v.url && v.url.indexOf('/watch?v=') === 0;
    }).map(function (v) {
      return {
        id: v.url.split('v=')[1],
        title: v.title,
        author: v.uploaderName,
        authorId: (v.uploaderUrl || '').split('/channel/')[1],
        length: v.duration,
        thumb: v.thumbnail
      };
    });
  }

  function invidiousOrder() {
    var list = shuffled(servers.invidious || []);
    if (goodInvidious) {
      list = [goodInvidious].concat(list.filter(function (s) { return s !== goodInvidious; }));
    }
    return list;
  }

  function loadList(kind, query) {
    showMsg('Загрузка…');
    var ivPath = kind === 'search' ?
      '/api/v1/search?type=video&q=' + encodeURIComponent(query) :
      kind === 'trending' ? '/api/v1/trending?region=RU' : '/api/v1/popular';
    var pipedPath = kind === 'search' ?
      '/search?filter=videos&q=' + encodeURIComponent(query) : '/trending?region=RU';

    var ivList = invidiousOrder();
    var i = 0;
    (function nextIv() {
      if (i >= ivList.length) { return viaPiped(); }
      var base = ivList[i++];
      get(base + ivPath, 15000, function (err, data) {
        var items = err ? null : fromInvidious(base)(data);
        if (items && items.length) {
          goodInvidious = base;
          return render(items);
        }
        nextIv();
      });
    })();

    function viaPiped() {
      tryEach(shuffled((servers.piped || []).map(pipedApi)),
        function (base) { return base + pipedPath; },
        fromPiped,
        function (err, items) {
          if (err) { return showMsg('Не удалось загрузить: ' + err, true); }
          render(items);
        });
    }
  }

  function fmtTime(s) {
    if (!s || s < 0) { return ''; }
    var m = Math.floor(s / 60), sec = s % 60;
    var h = Math.floor(m / 60);
    if (h) { m = m % 60; return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec; }
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function showMsg(text, isError) {
    $('list').innerHTML = '';
    var d = document.createElement('li');
    d.className = isError ? 'msg error' : 'msg';
    d.textContent = text;
    $('list').appendChild(d);
  }

  function render(items) {
    renderInto($('list'), items, false);
    $('scroll').scrollTop = 0;
    log('показано роликов: ' + items.length);
  }

  function renderInto(list, items, append) {
    if (!append) { list.innerHTML = ''; }
    items.forEach(function (v) {
      // разметка списка Gaia: li > a > aside + p + p
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#';
      a.dataset.id = v.id;
      a.dataset.title = v.title || '';
      a.dataset.author = v.author || '';
      a.dataset.authorId = v.authorId || '';

      var aside = document.createElement('aside');
      aside.className = 'thumb';
      var img = document.createElement('img');
      img.src = v.thumb;
      aside.appendChild(img);
      a.appendChild(aside);

      var t = document.createElement('p');
      t.textContent = v.title;
      a.appendChild(t);

      var au = document.createElement('p');
      au.textContent = (v.author || '') + (v.length ? ' · ' + fmtTime(v.length) : '');
      a.appendChild(au);

      li.appendChild(a);
      list.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- экраны

  // Стопка экранов: верхний виден, «назад» снимает его.
  var stack = ['main'];

  function show(id) {
    stack = stack.filter(function (s) { return s !== id; });
    stack.push(id);
    ['main', 'player', 'channel'].forEach(function (s) {
      $(s).hidden = s !== id;
    });
    if (id !== 'player') { $('video').pause(); }
  }

  function goBack() {
    var top = stack.pop();
    if (top === 'player') { stopPlayer(); }
    if (!stack.length) { stack = ['main']; }
    show(stack.pop());
  }

  // ---------------------------------------------------------------- комментарии

  var commentsToken = 0;
  var nextComments = null;    // функция, подгружающая следующую страницу

  // Piped отдаёт текст с HTML-сущностями — достаём только текст.
  // DOMParser не выполняет скриптов и не грузит картинки.
  function plainText(html) {
    var doc = new DOMParser().parseFromString('<body>' +
      String(html).replace(/<br\s*\/?>/gi, '\n') + '</body>', 'text/html');
    return doc.body.textContent;
  }

  function fmtCount(n) {
    if (!n) { return ''; }
    if (n >= 1000000) { return String(Math.round(n / 100000) / 10).replace('.', ',') + ' млн'; }
    if (n >= 1000) { return String(Math.round(n / 100) / 10).replace('.', ',') + ' тыс.'; }
    return String(n);
  }

  function commentMsg(text, isError) {
    var li = document.createElement('li');
    li.className = isError ? 'msg error' : 'msg';
    li.textContent = text;
    $('comments').appendChild(li);
  }

  function renderComments(items) {
    var ul = $('comments');
    items.forEach(function (c) {
      var li = document.createElement('li');
      var who = document.createElement('p');
      who.className = 'who';
      who.textContent = (c.author || '') +
        (c.when ? ' · ' + c.when : '') +
        (c.likes ? ' · ❤ ' + fmtCount(c.likes) : '');
      var text = document.createElement('p');
      text.className = 'text';
      text.textContent = c.text;
      li.appendChild(who);
      li.appendChild(text);
      ul.appendChild(li);
    });
  }

  function loadComments(id) {
    var token = ++commentsToken;
    $('comments').innerHTML = '';
    $('more').hidden = true;
    nextComments = null;
    commentMsg('Загрузка комментариев…');

    function done(items, more) {
      if (token !== commentsToken) { return; }
      $('comments').innerHTML = '';
      if (!items.length) { commentMsg('Комментариев нет'); }
      renderComments(items);
      nextComments = more;
      $('more').hidden = !more;
    }

    // Invidious: comments[].author/content/likeCount/publishedText, continuation
    function viaInvidious(list, i, cont) {
      if (i >= list.length) { return viaPiped(shuffled((servers.piped || []).map(pipedApi)), 0); }
      var base = list[i];
      get(base + '/api/v1/comments/' + id + (cont ? '?continuation=' + encodeURIComponent(cont) : ''),
        20000, function (err, data) {
          if (token !== commentsToken) { return; }
          if (err || !data || !data.comments) { return viaInvidious(list, i + 1, cont); }
          var items = data.comments.map(function (c) {
            return { author: c.author, text: c.content, likes: c.likeCount, when: c.publishedText };
          });
          done(items, data.continuation ? function () {
            appendPage(function (cb) {
              get(base + '/api/v1/comments/' + id + '?continuation=' +
                  encodeURIComponent(data.continuation), 20000, function (e2, d2) {
                cb(e2 || !d2 || !d2.comments ? null : {
                  items: d2.comments.map(function (c) {
                    return { author: c.author, text: c.content, likes: c.likeCount, when: c.publishedText };
                  }),
                  cont: d2.continuation
                });
              });
            }, 'invidious', base);
          } : null);
        });
    }

    // Piped: comments[].author/commentText/likeCount/commentedTime, nextpage
    function viaPiped(list, i) {
      if (i >= list.length) {
        if (token !== commentsToken) { return; }
        $('comments').innerHTML = '';
        return commentMsg('Комментарии не загрузились', true);
      }
      var base = list[i];
      get(base + '/comments/' + id, 20000, function (err, data) {
        if (token !== commentsToken) { return; }
        if (err || !data || !data.comments) { return viaPiped(list, i + 1); }
        done(data.comments.map(pipedComment), data.nextpage ? function () {
          pipedMore(base, data.nextpage);
        } : null);
      });
    }

    function pipedComment(c) {
      return { author: c.author, text: plainText(c.commentText || ''),
               likes: c.likeCount, when: c.commentedTime };
    }

    function pipedMore(base, page) {
      appendPage(function (cb) {
        get(base + '/nextpage/comments/' + id + '?nextpage=' + encodeURIComponent(page),
          20000, function (err, d) {
            cb(err || !d || !d.comments ? null : { items: d.comments.map(pipedComment), next: d.nextpage });
          });
      }, 'piped', base);
    }

    // Подгружает следующую страницу и настраивает кнопку «Ещё».
    function appendPage(fetch, kind, base) {
      $('more').hidden = true;
      fetch(function (page) {
        if (token !== commentsToken) { return; }
        if (!page) { $('more').hidden = false; return; }   // сбой — можно нажать ещё раз
        renderComments(page.items);
        if (kind === 'invidious' && page.cont) {
          nextComments = function () {
            appendPage(function (cb) {
              get(base + '/api/v1/comments/' + id + '?continuation=' +
                  encodeURIComponent(page.cont), 20000, function (e, d) {
                cb(e || !d || !d.comments ? null : {
                  items: d.comments.map(function (c) {
                    return { author: c.author, text: c.content, likes: c.likeCount, when: c.publishedText };
                  }),
                  cont: d.continuation
                });
              });
            }, 'invidious', base);
          };
        } else if (kind === 'piped' && page.next) {
          nextComments = function () { pipedMore(base, page.next); };
        } else {
          nextComments = null;
        }
        $('more').hidden = !nextComments;
      });
    }

    viaInvidious(invidiousOrder(), 0, null);
  }

  // ---------------------------------------------------------------- видео

  var playToken = 0;

  function play(id, title, author, authorId) {
    var token = ++playToken;
    log('играть ' + id);
    $('p-title').textContent = title;
    $('v-title').textContent = title;
    $('v-author').textContent = author;
    $('v-author').dataset.authorId = authorId || '';
    $('v-author').dataset.name = author || '';
    $('v-status').className = 'sub';
    show('player');
    $('player').scrollTop = 0;
    loadComments(id);

    // источники в порядке очереди: функция отдаёт адрес видео через cb
    var sources = [];
    (servers.yt2009 || []).forEach(function (base) {
      sources.push({ name: 'yt2009', wait: 60000, url: function (cb) {
        cb(base + '/get_video?video_id=' + id + '/mp4');
      }});
    });
    shuffled(servers.piped || []).forEach(function (entry) {
      var base = pipedApi(entry);
      sources.push({ name: 'Piped', wait: 30000, url: function (cb) {
        get(base + '/streams/' + id, 15000, function (err, data) {
          if (err || !data || !data.videoStreams) { return cb(null); }
          var s = data.videoStreams.filter(function (v) {
            return !v.videoOnly && (v.mimeType || '').indexOf('mp4') !== -1;
          });
          cb(s.length ? s[0].url : null);
        });
      }});
    });
    invidiousOrder().forEach(function (base) {
      sources.push({ name: 'Invidious', wait: 30000, url: function (cb) {
        cb(base + '/latest_version?id=' + id + '&itag=18&local=true');
      }});
    });

    var video = $('video');
    var i = 0;
    var timer = null;

    function next() {
      if (token !== playToken) { return; }
      clearTimeout(timer);
      if (i >= sources.length) {
        $('v-status').className = 'sub error';
        $('v-status').textContent = 'Видео не удалось загрузить ни с одного сервера.';
        return;
      }
      var src = sources[i++];
      $('v-status').textContent = 'Загрузка через ' + src.name + '…' +
        (src.name === 'yt2009' ? ' (сервер может готовить видео до минуты)' : '');
      src.url(function (url) {
        if (token !== playToken) { return; }
        if (!url) { return next(); }
        log('видео ' + src.name + ': ' + url);
        video.onerror = function () {
          log('ошибка видео ' + src.name + ' код ' + (video.error && video.error.code));
          next();
        };
        video.oncanplay = function () {
          clearTimeout(timer);
          log('играет через ' + src.name);
          $('v-status').textContent = 'Источник: ' + src.name;
        };
        video.src = url;
        video.load();
        video.play();
        // не начал играть за отведённое время — следующий источник
        timer = setTimeout(function () {
          if (video.readyState < 3) { log('не дождались ' + src.name); next(); }
        }, src.wait);
      });
    }
    next();
  }

  function stopPlayer() {
    playToken++;
    commentsToken++;
    var video = $('video');
    video.onerror = null;
    video.oncanplay = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  }

  // ---------------------------------------------------------------- канал

  var channelToken = 0;
  var nextChannelPage = null;

  // Аватары Invidious лежат на серверах Google — берём через сам Invidious.
  function viaGgpht(base, url) {
    var m = /^https?:\/\/yt\d*\.(?:ggpht|googleusercontent)\.com(\/.*)$/.exec(url || '');
    return m ? base + '/ggpht' + m[1] : url;
  }

  function openChannel(authorId, name) {
    if (!authorId) { return; }
    var token = ++channelToken;
    log('канал ' + authorId);
    $('ch-title').textContent = name || '';
    $('ch-name').textContent = name || '';
    $('ch-subs').textContent = '';
    $('ch-avatar').removeAttribute('src');
    $('ch-more').hidden = true;
    nextChannelPage = null;
    $('ch-list').innerHTML = '';
    var wait = document.createElement('li');
    wait.className = 'msg';
    wait.textContent = 'Загрузка…';
    $('ch-list').appendChild(wait);
    show('channel');
    $('ch-scroll').scrollTop = 0;

    function info(title, subs, avatar) {
      if (title) { $('ch-title').textContent = title; $('ch-name').textContent = title; }
      if (subs) { $('ch-subs').textContent = fmtCount(subs) + ' подписчиков'; }
      if (avatar) { $('ch-avatar').src = avatar; }
    }

    function videos(items, more) {
      if (token !== channelToken) { return; }
      renderInto($('ch-list'), items, false);
      if (!items.length) {
        var li = document.createElement('li');
        li.className = 'msg';
        li.textContent = 'Роликов нет';
        $('ch-list').appendChild(li);
      }
      nextChannelPage = more;
      $('ch-more').hidden = !more;
    }

    function ivVideo(base) {
      return function (v) {
        return { id: v.videoId, title: v.title, author: v.author, authorId: v.authorId,
                 length: v.lengthSeconds, thumb: base + '/vi/' + v.videoId + '/mqdefault.jpg' };
      };
    }

    // Invidious: /api/v1/channels/<id> и /api/v1/channels/<id>/videos
    function viaInvidious(list, i) {
      if (i >= list.length) { return viaPiped(shuffled((servers.piped || []).map(pipedApi)), 0); }
      var base = list[i];
      get(base + '/api/v1/channels/' + authorId, 20000, function (err, ch) {
        if (token !== channelToken) { return; }
        if (err || !ch || !ch.author) { return viaInvidious(list, i + 1); }
        var thumbs = (ch.authorThumbnails || []).filter(function (t) { return t.width <= 176; });
        info(ch.author, ch.subCount,
             thumbs.length ? viaGgpht(base, thumbs[thumbs.length - 1].url) : null);
        ivPage(base, null, false);
      });
    }

    function ivPage(base, cont, append) {
      get(base + '/api/v1/channels/' + authorId + '/videos' +
          (cont ? '?continuation=' + encodeURIComponent(cont) : ''), 20000, function (err, d) {
        if (token !== channelToken) { return; }
        var arr = d && (d.videos || (d.map ? d : null));
        if (err || !arr) {
          if (append) { $('ch-more').hidden = false; return; }
          return videos([], null);
        }
        var items = arr.map(ivVideo(base));
        var more = d.continuation ? function () {
          $('ch-more').hidden = true;
          ivPage(base, d.continuation, true);
        } : null;
        if (append) {
          renderInto($('ch-list'), items, true);
          nextChannelPage = more;
          $('ch-more').hidden = !more;
        } else {
          videos(items, more);
        }
      });
    }

    // Piped: /channel/<id>, дальше /nextpage/channel/<id>?nextpage=
    function pipedItems(d) {
      return (d.relatedStreams || []).filter(function (v) {
        return v.url && v.url.indexOf('/watch?v=') === 0;
      }).map(function (v) {
        return { id: v.url.split('v=')[1], title: v.title, author: v.uploaderName || d.name,
                 authorId: authorId, length: v.duration, thumb: v.thumbnail };
      });
    }

    function viaPiped(list, i) {
      if (i >= list.length) {
        if (token !== channelToken) { return; }
        $('ch-list').innerHTML = '';
        var li = document.createElement('li');
        li.className = 'msg error';
        li.textContent = 'Канал не загрузился';
        $('ch-list').appendChild(li);
        return;
      }
      var base = list[i];
      get(base + '/channel/' + authorId, 20000, function (err, d) {
        if (token !== channelToken) { return; }
        if (err || !d || !d.name) { return viaPiped(list, i + 1); }
        info(d.name, d.subscriberCount, d.avatarUrl);
        videos(pipedItems(d), d.nextpage ? pipedMore(base, d.nextpage) : null);
      });
    }

    function pipedMore(base, page) {
      return function () {
        $('ch-more').hidden = true;
        get(base + '/nextpage/channel/' + authorId + '?nextpage=' + encodeURIComponent(page),
          20000, function (err, d) {
            if (token !== channelToken) { return; }
            if (err || !d) { $('ch-more').hidden = false; return; }
            renderInto($('ch-list'), pipedItems(d), true);
            nextChannelPage = d.nextpage ? pipedMore(base, d.nextpage) : null;
            $('ch-more').hidden = !nextChannelPage;
          });
      };
    }

    viaInvidious(invidiousOrder(), 0);
  }

  // ---------------------------------------------------------------- события

  function setTab(id) {
    ['tab-popular', 'tab-trending'].forEach(function (t) {
      $(t).className = t === id ? 'selected' : '';
    });
  }

  function onListClick(e) {
    var a = e.target;
    while (a && a !== this && !(a.dataset && a.dataset.id)) { a = a.parentNode; }
    if (!a || a === this) { return; }
    e.preventDefault();
    play(a.dataset.id, a.dataset.title, a.dataset.author, a.dataset.authorId);
  }

  $('list').addEventListener('click', onListClick);
  $('ch-list').addEventListener('click', onListClick);

  $('v-author').addEventListener('click', function (e) {
    e.preventDefault();
    openChannel(this.dataset.authorId, this.dataset.name);
  });

  $('ch-more').addEventListener('click', function (e) {
    e.preventDefault();
    if (nextChannelPage) { nextChannelPage(); }
  });

  $('ch-back').addEventListener('click', function (e) {
    e.preventDefault();
    goBack();
  });

  $('search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('q').value.trim();
    if (!q) { return; }
    $('q').blur();
    setTab(null);
    loadList('search', q);
  });

  $('tab-popular').addEventListener('click', function (e) {
    e.preventDefault();
    setTab('tab-popular');
    loadList('popular');
  });

  $('tab-trending').addEventListener('click', function (e) {
    e.preventDefault();
    setTab('tab-trending');
    loadList('trending');
  });

  $('more').addEventListener('click', function (e) {
    e.preventDefault();
    if (nextComments) { nextComments(); }
  });

  $('back').addEventListener('click', function (e) {
    e.preventDefault();
    goBack();
  });

  log('старт');
  loadServers(function () {
    log('серверов: invidious ' + (servers.invidious || []).length +
        ', piped ' + (servers.piped || []).length +
        ', yt2009 ' + (servers.yt2009 || []).length);
    loadList('popular');
  });
})();
