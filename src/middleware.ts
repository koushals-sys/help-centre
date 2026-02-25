import type { MiddlewareHandler } from 'astro';

const STATIC_PREFIXES = [
	'/webflow',
	'/_astro',
	'/assets',
	'/fonts',
	'/videos',
	'/uploads',
	'/favicon',
	'/robots',
	'/sitemap',
];

function isStaticAssetPath(pathname: string) {
	if (STATIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
		return true;
	}
	return /\.[a-zA-Z0-9]+$/.test(pathname);
}

export const onRequest: MiddlewareHandler = async (context, next) => {
	const { pathname, search } = context.url;

	if (isStaticAssetPath(pathname)) {
		return next();
	}

	if (pathname.startsWith('/webflow')) {
		return next();
	}

	return context.rewrite(new URL(`/webflow${pathname}${search}`, context.url));
};
