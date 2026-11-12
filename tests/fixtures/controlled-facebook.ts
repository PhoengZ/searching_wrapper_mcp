import type { Page } from 'playwright';
// Intercepts all browser traffic. Nothing is fetched from Facebook in this test.
export default async function initialize({ page }: { page: Page }) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'www.facebook.com') return route.abort();
    const discovery = url.pathname.startsWith('/search/pages');
    const anonymousParent = url.pathname.endsWith('/posts/2');
    const postId = anonymousParent ? '2' : '1';
    const ownParentLink = anonymousParent ? '' : `<a href="https://www.facebook.com/synthetic-page/posts/${postId}?comment_id=c1">Comment</a>`;
    const body = discovery ? '<a href="https://www.facebook.com/synthetic-page">Synthetic Page</a>' : `<article role="article"><div data-ad-preview="message">DCA คำถามสังเคราะห์</div><a href="https://www.facebook.com/synthetic-page/posts/${postId}">Post</a><time datetime="2026-11-05T05:00:00Z">5 November 2026</time><button>Comment</button><article role="article"><div data-testid="comment_message">คอมเมนต์สังเคราะห์</div>${ownParentLink}<article role="article"><div data-testid="comment_message">คำตอบสังเคราะห์</div><a href="https://www.facebook.com/synthetic-page/posts/${postId}?comment_id=c1&amp;reply_comment_id=r1">Reply</a></article></article></article>`;
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><title>Synthetic Facebook contract</title></head><body><main>${body}</main></body></html>` });
  });
}
