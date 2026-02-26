export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const directResponse = await env.ASSETS.fetch(request);
    if (directResponse.status !== 404) {
      return directResponse;
    }

    const cleanPath = url.pathname.replace(/\/$/, '');
    if (!cleanPath.includes('.')) {
      const indexResponse = await env.ASSETS.fetch(
        new Request(new URL(`${cleanPath || ''}/index.html`, url), request)
      );
      if (indexResponse.status !== 404) {
        return indexResponse;
      }
    }

    return env.ASSETS.fetch(new Request(new URL('/404.html', url), request));
  },
};
