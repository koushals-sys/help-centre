export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '') {
      return env.ASSETS.fetch(new Request(new URL('/client/index.html', url), request));
    }

    if (!url.pathname.startsWith('/client/') && !url.pathname.includes('.')) {
      const htmlPath = `/client${url.pathname.replace(/\/$/, '')}/index.html`;
      const htmlResponse = await env.ASSETS.fetch(new Request(new URL(htmlPath, url), request));
      if (htmlResponse.status !== 404) {
        return htmlResponse;
      }
    }

    const directResponse = await env.ASSETS.fetch(request);
    if (directResponse.status !== 404) {
      return directResponse;
    }

    return env.ASSETS.fetch(new Request(new URL('/client/404.html', url), request));
  },
};
