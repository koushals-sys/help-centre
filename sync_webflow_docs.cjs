const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api.webflow.com/v2';
const DOCS_DIR = path.resolve(__dirname, 'src/content/docs');
const MANIFEST_PATH = path.join(DOCS_DIR, '.webflow-sync-manifest.json');

const env = {
  WEBFLOW_API_TOKEN: process.env.WEBFLOW_API_TOKEN,
  WEBFLOW_ARTICLES_COLLECTION_ID: process.env.WEBFLOW_ARTICLES_COLLECTION_ID,
};

loadDotEnvFiles();

function loadDotEnvFiles() {
  for (const file of ['.env', '.env.local']) {
    const fullPath = path.resolve(__dirname, file);
    if (!fs.existsSync(fullPath)) continue;

    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  env.WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
  env.WEBFLOW_ARTICLES_COLLECTION_ID = process.env.WEBFLOW_ARTICLES_COLLECTION_ID;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function findMarkdownFiles(dir) {
  const output = [];
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...findMarkdownFiles(full));
      continue;
    }
    if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
      output.push(full);
    }
  }
  return output;
}

function buildExistingSlugIndex() {
  const files = findMarkdownFiles(DOCS_DIR);
  const index = new Map();

  for (const filePath of files) {
    const relPath = toRelative(filePath);
    if (relPath === toRelative(MANIFEST_PATH)) {
      continue;
    }
    const slug = toSlug(path.basename(filePath).replace(/\.mdx?$/i, ''));
    if (!slug) continue;
    if (!index.has(slug)) {
      index.set(slug, filePath);
    }
  }

  return index;
}

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s/-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^-|-$/g, '');
}

function escapeFrontmatter(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getField(item, keys) {
  for (const key of keys) {
    if (item?.fieldData && item.fieldData[key] != null) return item.fieldData[key];
    if (item && item[key] != null) return item[key];
  }
  return undefined;
}

function isPublished(item) {
  const archived = getField(item, ['_archived', 'isArchived', 'archived']);
  const draft = getField(item, ['_draft', 'isDraft', 'draft']);
  return !archived && !draft;
}

function deriveSegments(item) {
  const explicitPath = toSlug(getField(item, ['path', 'category-path', 'folder']) || '');
  const explicitSubpath = toSlug(getField(item, ['subpath', 'sub-path']) || '');
  const sourceFile = getField(item, ['sourcefile', 'source-file', 'source']);

  if (explicitPath) {
    return {
      pathSegment: explicitPath.split('/')[0] || '',
      subpathSegment: explicitSubpath,
    };
  }

  if (typeof sourceFile === 'string' && sourceFile.includes('/')) {
    const segments = sourceFile.split('/').map(toSlug).filter(Boolean);
    return {
      pathSegment: segments[0] || '',
      subpathSegment: segments[1] || '',
    };
  }

  return {
    pathSegment: '',
    subpathSegment: '',
  };
}

function normalizeBody(item) {
  const body = getField(item, ['body', 'content', 'post-body', 'rich-text']);
  if (!body) return '';
  return String(body).trim();
}

async function fetchJson(url, options = {}) {
  const token = env.WEBFLOW_API_TOKEN;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'accept-version': '2.0.0',
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Webflow API error ${response.status}: ${text}`);
  }

  return response.json();
}

async function fetchAllItems(collectionId) {
  const allItems = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = `${API_BASE}/collections/${collectionId}/items?limit=${limit}&offset=${offset}`;
    const data = await fetchJson(url);
    const items = data?.items || data?.collectionItems || [];
    allItems.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }

  return allItems;
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

function writeManifest(files) {
  const payload = {
    generatedAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function toRelative(filePath) {
  return path.relative(__dirname, filePath).split(path.sep).join('/');
}

function buildMarkdown(item, title, description, slug, videoUrl, body) {
  const lines = [
    '---',
    `title: "${escapeFrontmatter(title)}"`,
    `description: "${escapeFrontmatter(description || '')}"`,
    'source: "webflow"',
    `webflowItemId: "${escapeFrontmatter(item.id || '')}"`,
    `slug: "${escapeFrontmatter(slug)}"`,
  ];

  if (videoUrl) {
    lines.push(`video: "${escapeFrontmatter(videoUrl)}"`);
  }

  lines.push('---', '');
  lines.push(body || '');

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  if (!env.WEBFLOW_API_TOKEN || !env.WEBFLOW_ARTICLES_COLLECTION_ID) {
    console.log('Skipping Webflow sync: missing WEBFLOW_API_TOKEN or WEBFLOW_ARTICLES_COLLECTION_ID');
    process.exit(0);
  }

  ensureDir(DOCS_DIR);

  const currentFiles = new Set();
  const existingSlugIndex = buildExistingSlugIndex();

  const items = await fetchAllItems(env.WEBFLOW_ARTICLES_COLLECTION_ID);
  let createdOrUpdated = 0;
  let skipped = 0;

  for (const item of items) {
    if (!isPublished(item)) {
      skipped++;
      continue;
    }

    const slug = toSlug(getField(item, ['slug']) || getField(item, ['name', 'title']));
    if (!slug) {
      skipped++;
      continue;
    }

    const title = getField(item, ['name', 'title']) || slug;
    const description = getField(item, ['summary', 'description']) || '';
    const videoUrl = getField(item, ['video-link', 'video-url', 'videourl', 'video', 'videoUrl']) || '';
    const body = normalizeBody(item);
    const { pathSegment, subpathSegment } = deriveSegments(item);

    const existingFilePath = existingSlugIndex.get(slug);
    let outputDir = path.join(DOCS_DIR, pathSegment || '', subpathSegment || '');
    if ((!pathSegment || !subpathSegment) && existingFilePath) {
      outputDir = path.dirname(existingFilePath);
    }

    ensureDir(outputDir);

    const filePath = existingFilePath || path.join(outputDir, `${slug}.md`);
    const relPath = toRelative(filePath);
    const nextContent = buildMarkdown(item, title, description, slug, videoUrl, body);

    let shouldWrite = true;
    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, 'utf8');
      shouldWrite = existing !== nextContent;
    }

    if (shouldWrite) {
      fs.writeFileSync(filePath, nextContent, 'utf8');
      createdOrUpdated++;
    }

    currentFiles.add(relPath);
  }

  writeManifest([...currentFiles].sort());

  console.log(
    `Webflow sync complete. Total items: ${items.length}, written: ${createdOrUpdated}, skipped: ${skipped}`
  );
}

main().catch((error) => {
  console.error('Webflow sync failed:', error.message || error);
  process.exit(1);
});