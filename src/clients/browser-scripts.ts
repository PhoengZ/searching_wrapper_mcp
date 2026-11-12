// Fixed, reviewed browser programs. Tool arguments and page text cannot supply code.
export const browserScripts = {
  state: `() => {
    const text = (document.body?.innerText || '').slice(0, 6000);
    const blocked = document.querySelector('input[type="password"]') || /\\/(login|checkpoint)(\\/|\\?|$)/.test(location.pathname) ? 'login_required'
      : /captcha/i.test(text) ? 'access_denied'
      : /temporarily blocked|try again later|ถูกบล็อกชั่วคราว|จำกัดการใช้งาน/i.test(text) ? 'rate_limited'
      : /content isn.t available|access denied|ไม่สามารถดูเนื้อหานี้/i.test(text) ? 'access_denied' : null;
    return { url: location.href, title: document.title.slice(0, 300), blocked, has_articles: !!document.querySelector('[role="article"]'), no_results: /no results found|ไม่พบผลลัพธ์/i.test(text) };
  }`,
  scroll: `() => { window.scrollBy(0, Math.min(700, window.innerHeight)); return { scrolled: true }; }`,
  expand_text: `() => { let count = 0; for (const el of document.querySelectorAll('button,[role="button"]')) { if (count < 3 && /^(See more|ดูเพิ่มเติม)$/i.test(el.textContent.trim())) { el.click(); count++; } } return { expanded: count }; }`,
  expand_comments: `() => { let count = 0; for (const el of document.querySelectorAll('button,[role="button"]')) { if (count < 1 && /^(View (more|previous) comments|ดูความคิดเห็นเพิ่มเติม|ดูความคิดเห็นก่อนหน้า|ดูคำตอบเพิ่มเติม)/i.test(el.textContent.trim())) { el.click(); count++; } } return { expanded: count }; }`,
  pages: `() => {
    const result = []; const seen = new Set();
    for (const anchor of document.querySelectorAll('main a[href],[role="main"] a[href]')) {
      const name = (anchor.innerText || '').trim(); let url; try { url = new URL(anchor.href); } catch { continue; }
      if (!name || name.length > 200 || !['facebook.com','www.facebook.com','m.facebook.com'].includes(url.hostname) || /^\\/(search|login|help|groups|watch|marketplace|settings|privacy)(\\/|$)/.test(url.pathname) || url.pathname === '/') continue;
      url.hash = ''; for (const key of [...url.searchParams.keys()]) if (!['id'].includes(key)) url.searchParams.delete(key);
      if (seen.has(url.href)) continue; seen.add(url.href); result.push({ name, url: url.href, platform_id: url.searchParams.get('id') }); if (result.length >= 10) break;
    } return result;
  }`,
  posts: `() => {
    const result = [];
    for (const article of document.querySelectorAll('[role="article"]')) {
      if (article.parentElement?.closest('[role="article"]')) continue;
      const message = article.querySelector('[data-ad-preview="message"],[data-ad-comet-preview="message"],[data-testid="post_message"]');
      const link = [...article.querySelectorAll('a[href]')].find(a => /\\/posts\\/|story_fbid=|\\/permalink\\//.test(a.href));
      if (!message || !link) continue;
      const time = article.querySelector('time'); const url = new URL(link.href); const id = url.searchParams.get('story_fbid') || url.pathname.match(/(?:posts|permalink)\\/([^/?]+)/)?.[1] || null;
      result.push({ text: message.innerText.slice(0, 80000), url: link.href, platform_id: id, published_at: time?.getAttribute('datetime') || null, published_at_raw: time?.innerText || null }); if (result.length >= 100) break;
    } return result;
  }`,
  comments: `() => {
    const result = [];
    for (const article of document.querySelectorAll('[role="article"] [role="article"]')) {
      const body = article.querySelector('[data-ad-preview="message"],[data-testid="comment_message"],[dir="auto"]');
      if (!body) continue;
      const link = [...article.querySelectorAll('a[href]')].find(a => /comment_id=/.test(a.href));
      const url = link ? new URL(link.href) : null;
      result.push({ text: body.innerText.slice(0, 80000), url: link?.href || null, platform_id: url?.searchParams.get('comment_id') || null, parent_platform_id: url?.searchParams.get('reply_comment_id') || null, published_at: null, published_at_raw: null }); if (result.length >= 1000) break;
    } return result;
  }`,
} as const;
export type BrowserScript = keyof typeof browserScripts;
