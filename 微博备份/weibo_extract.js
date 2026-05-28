/*
 * 微博备份提取工具 v3.0 - DOM 图片提取 + API 文本
 * =================================================
 * 
 * 原理：
 * - 文本：通过 API 获取（含长文本自动展开）
 * - 图片：从页面 DOM 中的 <article> 卡片中提取 <img> 标签
 * 
 * 用法：
 * 1. Chrome 登录微博
 * 2. 打开 https://weibo.com/u/1041241542
 * 3. F12 → Console → 粘贴全部代码 → Enter
 * 4. 脚本自动滚动抓取，完成后下载 JSON
 * 
 * 可修改参数：
 *   MAX_PAGES - 最多多少页（默认50）
 *   SCROLL_DELAY - 滚动间隔毫秒（默认3000）
 */

(async function () {
  var MAX_PAGES = 50;
  var SCROLL_DELAY = 3000;

  console.log('%c微博备份 v3.0 — 文本API + DOM图片', 'font-size:18px; font-weight:bold; color:#ff8200;');

  /* ---------- 工具 ---------- */
  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return m ? m[2] : '';
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  var xsrfToken = getCookie('XSRF-TOKEN');
  var pathM = window.location.pathname.match(/\/u\/(\d+)/);
  if (!pathM) { console.error('请在用户主页执行'); return; }
  var uid = pathM[1];
  console.log('UID:', uid);

  /* ---------- API 获取文本 ---------- */
  async function fetchAPI(page) {
    try {
      var r = await fetch('/ajax/statuses/mymblog?uid=' + uid + '&page=' + page + '&feature=0', {
        credentials: 'include',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-XSRF-TOKEN': xsrfToken,
          'Referer': location.href
        }
      });
      if (!r.ok) return null;
      var d = await r.json();
      return d.ok === 1 ? d : null;
    } catch (e) { return null; }
  }

  async function fetchLongText(id) {
    try {
      var r = await fetch('/ajax/statuses/longtext?id=' + id, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrfToken }
      });
      if (!r.ok) return null;
      var d = await r.json();
      return (d.ok === 1 && d.data && d.data.longTextContent)
        ? d.data.longTextContent.replace(/<[^>]*>/g, '').trim() : null;
    } catch (e) { return null; }
  }

  function isLong(item) {
    if (item.isLongText === true) return true;
    var t = (item.text_raw || item.text || '');
    if (t.indexOf('...') >= 0 || t.indexOf('…') >= 0) return true;
    if (item.text && item.text.indexOf('展开全文') >= 0) return true;
    return false;
  }

  /* ---------- DOM 提取图片 ---------- */
  function extractDOMImages() {
    var results = [];
    var articles = document.querySelectorAll('article');
    console.log('  找到 ' + articles.length + ' 个 <article> 卡片');

    for (var a = 0; a < articles.length; a++) {
      var art = articles[a];
      
      // 提取该卡片中的配图（过滤头像、图标）
      var imgs = art.querySelectorAll('img[src*="sinaimg"], img[src*="tvax"]');
      var imgUrls = [];
      var seen = {};

      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var src = img.src || '';
        var w = img.width || 0;
        var h = img.height || 0;

        // 过滤小图（头像、图标等小于 80px 的过滤掉）
        if (w < 80 && h < 80) continue;
        // 过滤已知的图标
        if (src.indexOf('vip') >= 0 || src.indexOf('icon') >= 0 || src.indexOf('avatar') >= 0 || src.indexOf('logo') >= 0) continue;
        // 过滤 profile 头像
        if (src.indexOf('/50/') >= 0 || src.indexOf('/180/') >= 0) continue;

        // 转为大图 URL
        var big = src.replace('/thumb/', '/large/').replace('/mw690/', '/large/').replace('/mw1024/', '/large/').replace('/wap180/', '/large/').replace('/orj360/', '/large/');

        if (big && !seen[big]) {
          seen[big] = true;
          imgUrls.push(big);
        }
      }

      if (imgUrls.length > 0) {
        results.push({ articleIndex: a, images: imgUrls });
      }
    }

    return results;
  }

  /* ---------- 解析一条微博 ---------- */
  async function parsePost(item, domImages) {
    var text = (item.text_raw || item.text || '').replace(/<[^>]*>/g, '').trim();

    // 展开长文本
    if (isLong(item) && item.id) {
      var full = await fetchLongText(item.id);
      if (full && full.length > text.length) text = full;
    }

    // retweeted 图片处理
    var retweeted = null;
    if (item.retweeted_status) {
      var rt = item.retweeted_status;
      var rtText = (rt.text_raw || rt.text || '').replace(/<[^>]*>/g, '').trim();
      // 从 DOM 中提取转发图片（如果没找到，从 API 字段尝试）
      var rtPics = [];
      if (rt.pics) {
        for (var k = 0; k < rt.pics.length; k++) {
          var p = rt.pics[k];
          var u = null;
          if (p.large && p.large.url) u = p.large.url;
          else if (p.original) u = p.original;
          else if (p.url) u = p.url.replace('/thumb/', '/large/');
          else if (p.pid) u = 'https://wx4.sinaimg.cn/large/' + p.pid + '.jpg';
          if (u) rtPics.push(u);
        }
      }
      retweeted = { user: rt.user ? rt.user.screen_name : '', text: rtText, images: rtPics };
    }

    return {
      id: item.id || item.mid || '',
      text: text,
      images: [],          // 后续由 DOM 补充
      time: item.created_at || '',
      retweeted: retweeted,
      reposts_count: item.reposts_count || 0,
      comments_count: item.comments_count || 0,
      attitudes_count: item.attitudes_count || 0
    };
  }

  /* ---------- 分配 DOM 图片到微博 ---------- */
  function assignImages(posts, domGroups) {
    // 每个 domGroups[i] 对应第 i 个 <article> 的图片
    // 按顺序分配给 posts
    var assigned = 0;
    for (var i = 0; i < posts.length && i < domGroups.length; i++) {
      if (domGroups[i] && domGroups[i].images.length > 0) {
        posts[i].images = domGroups[i].images;
        assigned++;
      }
    }
    console.log('  分配图片: ' + assigned + ' 条微博');
  }

  /* ---------- 主流程 ---------- */
  console.log('\n开始抓取（API 文本 + DOM 图片）...\n');

  var allPosts = [];
  var loadCount = 0;

  for (var page = 1; page <= MAX_PAGES; page++) {
    console.log('[' + page + '/' + MAX_PAGES + '] 抓取...');

    // 获取 API 数据
    var data = await fetchAPI(page);
    if (!data || !data.data) { console.log('  API 无数据，停止'); break; }
    var list = data.data.list || data.data;
    if (!Array.isArray(list) || list.length === 0) { console.log('  无更多内容'); break; }

    // 解析文本
    var pagePosts = [];
    for (var i = 0; i < list.length; i++) {
      var post = await parsePost(list[i]);
      if (post.id) pagePosts.push(post);
    }

    // 从 DOM 获取图片
    var domImgs = extractDOMImages();
    assignImages(pagePosts, domImgs);

    allPosts = allPosts.concat(pagePosts);
    console.log('  本页 ' + pagePosts.length + ' 条, 累计 ' + allPosts.length + ' 条');

    // 滚动
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(SCROLL_DELAY);
    loadCount++;
  }

  // ----- 结束前的 DOM 图片补充扫描 -----
  console.log('\n最终 DOM 扫描...');
  window.scrollTo(0, 0);
  await sleep(1000);
  var finalDom = extractDOMImages();

  // 尝试按 article 顺序给每篇微博补充图片（如果之前没有）
  var imgAssigned = 0;
  for (var fi = 0; fi < allPosts.length && fi < finalDom.length; fi++) {
    if (allPosts[fi].images.length === 0 && finalDom[fi] && finalDom[fi].images.length > 0) {
      allPosts[fi].images = finalDom[fi].images;
      imgAssigned++;
    }
  }
  if (imgAssigned > 0) console.log('  补充 ' + imgAssigned + ' 条微博的图片');

  // ----- 统计 -----
  var withImgs = 0, totalImgs = 0;
  for (var ci = 0; ci < allPosts.length; ci++) {
    if (allPosts[ci].images.length > 0) { withImgs++; totalImgs += allPosts[ci].images.length; }
  }

  console.log('\n=========================================');
  console.log('抓取完成!');
  console.log('微博总数: ' + allPosts.length);
  console.log('含图片微博: ' + withImgs + ' 条');
  console.log('图片总数: ' + totalImgs + ' 张');
  console.log('=========================================');

  // 预览前 3 条
  for (var pi = 0; pi < Math.min(3, allPosts.length); pi++) {
    var p2 = allPosts[pi];
    var prev = p2.text.slice(0, 80) + (p2.text.length > 80 ? '...' : '');
    console.log('\n[' + (pi + 1) + '] ' + prev);
    console.log('    图片: ' + p2.images.length + '张  | ' + p2.time);
    if (p2.images.length > 0) {
      for (var ii = 0; ii < p2.images.length; ii++) {
        console.log('    img' + (ii + 1) + ': ' + p2.images[ii].slice(0, 80));
      }
    }
  }

  // 下载 JSON
  var result = { uid: uid, crawl_time: new Date().toISOString(), total_posts: allPosts.length, posts: allPosts };
  var jsonStr = JSON.stringify(result, null, 2);
  var blob = new Blob([jsonStr], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'weibo_' + uid + '_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('\n✅ JSON 已下载');

  return allPosts;
})();
