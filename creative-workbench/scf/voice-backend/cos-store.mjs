import { createHash, createHmac } from 'node:crypto';

const encode = (value) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
export function cosAuthorization({
  method,
  pathname,
  host,
  headers = {},
  query = {},
  secretId,
  secretKey,
  now = Math.floor(Date.now() / 1000),
}) {
  const keyTime = `${now - 60};${now + 600}`;
  const signKey = createHmac('sha1', secretKey).update(keyTime).digest('hex');
  const canonical = (values) => {
    const normalized = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k.toLowerCase(), String(v)]),
    );
    const names = Object.keys(normalized).sort();
    return {
      names: names.join(';'),
      text: names.map((k) => `${encode(k)}=${encode(normalized[k])}`).join('&'),
    };
  };
  const signedHeaders = canonical({ host, ...headers });
  const signedQuery = canonical(query);
  const http = `${method.toLowerCase()}\n${pathname}\n${signedQuery.text}\n${signedHeaders.text}\n`;
  const toSign = `sha1\n${keyTime}\n${createHash('sha1').update(http).digest('hex')}\n`;
  const signature = createHmac('sha1', signKey).update(toSign).digest('hex');
  return (
    `q-sign-algorithm=sha1&q-ak=${secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
    `&q-header-list=${signedHeaders.names}&q-url-param-list=${signedQuery.names}&q-signature=${signature}`
  );
}

export async function readCosText(response, signal, maxBytes = 16384) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('cos-response-too-large');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** @param {{bucket: string, region: string, secretId: string, secretKey: string, token?: string, fetchImpl?: typeof fetch}} options */
export function createCosClient({
  bucket,
  region,
  secretId,
  secretKey,
  token,
  fetchImpl = fetch,
}) {
  if (
    !/^[a-z0-9][a-z0-9-]*-\d+$/.test(bucket || '') ||
    !/^[a-z]+-[a-z]+(?:-\d+)?$/.test(region || '') ||
    !secretId ||
    !secretKey
  )
    throw new Error('cos-config-invalid');
  const host = `${bucket}.cos.${region}.myqcloud.com`;
  /**
   * @param {string} method
   * @param {string} pathname
   * @param {{query?: Record<string, string>, headers?: Record<string, string>, body?: string, signal?: AbortSignal}} [options]
   */
  return async function request(
    method,
    pathname,
    { query = {}, headers = {}, body, signal = AbortSignal.timeout(8000) } = {},
  ) {
    signal.throwIfAborted();
    const signed = {
      ...headers,
      ...(token ? { 'x-cos-security-token': token } : {}),
    };
    const params = new URLSearchParams(query).toString();
    return fetchImpl(
      `https://${host}${pathname}${params ? '?' + params : ''}`,
      {
        method,
        headers: {
          Host: host,
          ...signed,
          Authorization: cosAuthorization({
            method,
            pathname,
            host,
            headers: signed,
            query,
            secretId,
            secretKey,
          }),
        },
        ...(body !== undefined ? { body } : {}),
        signal,
        redirect: 'error',
        cache: 'no-store',
      },
    );
  };
}

const cleanXml = (xml) => xml.replace(/^\s*<\?xml[^?]*\?>\s*/, '').trim();
// Small, deliberately restricted config parser: no DTD/entities/comments, unknown
// attributes or mixed content. Compares structure independent of child ordering.
export function configXml(xml) {
  const source = cleanXml(xml);
  const stack = [];
  let root;
  let consumed = 0;
  for (const token of source.match(/<[^>]*>|[^<]+/g) || []) {
    consumed += token.length;
    if (!token.startsWith('<')) {
      if (!token.trim()) continue;
      if (!stack.length || /[&<>]/.test(token))
        throw new Error('cos-config-xml-invalid');
      // Leaf values (notably Prefix) are exact COS keys, not display text.
      stack.at(-1).text += token;
      continue;
    }
    const close = /^<\/([A-Za-z][A-Za-z0-9]*)>$/.exec(token);
    if (close) {
      if (stack.pop()?.tag !== close[1])
        throw new Error('cos-config-xml-invalid');
      continue;
    }
    const open =
      /^<([A-Za-z][A-Za-z0-9]*)(?:\s+xmlns=(['"])[^'"<>]*\2)?\s*(\/?)>$/.exec(
        token,
      );
    if (!open || stack.length > 10 || (open[2] && stack.length))
      throw new Error('cos-config-xml-invalid');
    const node = { tag: open[1], text: '', children: [] };
    if (stack.length) stack.at(-1).children.push(node);
    else if (root) throw new Error('cos-config-xml-invalid');
    else root = node;
    if (!open[3]) stack.push(node);
  }
  if (consumed !== source.length || stack.length || !root)
    throw new Error('cos-config-xml-invalid');
  const normalize = (node) => {
    if (node.text && node.children.length)
      throw new Error('cos-config-xml-invalid');
    return [
      node.tag,
      node.text,
      node.children
        .map(normalize)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    ];
  };
  return JSON.stringify(normalize(root));
}
export async function assertUnversioned(
  request,
  signal = AbortSignal.timeout(8000),
) {
  const response = await request('GET', '/', {
    query: { versioning: '' },
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('cos-versioning-unavailable');
  }
  const xml = configXml(await readCosText(response, signal));
  if (xml !== configXml('<VersioningConfiguration/>'))
    throw new Error('cos-must-be-never-versioned');
}

export const QUOTA_LIFECYCLE =
  '<LifecycleConfiguration><Rule><ID>voice-usage-expiration</ID><Filter><Prefix>voice-usage/</Prefix></Filter><Status>Enabled</Status><Expiration><Days>2</Days></Expiration></Rule></LifecycleConfiguration>';
export async function assertSafeLifecycle(
  request,
  signal = AbortSignal.timeout(8000),
) {
  const response = await request('GET', '/', {
    query: { lifecycle: '' },
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('cos-lifecycle-unavailable');
  }
  // Intentionally accepts only our dedicated bucket template; unknown rules fail closed.
  const xml = configXml(await readCosText(response, signal));
  if (xml !== configXml(QUOTA_LIFECYCLE))
    throw new Error('cos-lifecycle-unexpected');
}

export function createCosSlotStore(options) {
  const request = createCosClient(options);
  return {
    async check(signal = AbortSignal.timeout(8000)) {
      await assertUnversioned(request, signal);
      await assertSafeLifecycle(request, signal);
    },
    async claim(key, signal = AbortSignal.timeout(8000)) {
      if (
        !/^voice-usage\/(?:minute\/\d+\/[a-f0-9]{64}|day\/\d+\/[a-f0-9]{64}|global\/\d+)\/[1-9]\d{0,3}$/.test(
          key,
        )
      )
        throw new Error('cos-slot-invalid');
      const response = await request('PUT', '/' + key, {
        headers: {
          'x-cos-forbid-overwrite': 'true',
          'content-type': 'application/octet-stream',
        },
        body: '1',
        signal,
      });
      if (response.status === 200) {
        await response.body?.cancel();
        if (response.headers.has('x-cos-version-id'))
          throw new Error('cos-versioning-changed');
        return true;
      }
      if (response.status === 409) {
        const xml = await readCosText(response, signal);
        if (/<Code>FileAlreadyExists<\/Code>/.test(xml)) return false;
      } else await response.body?.cancel();
      throw new Error('cos-reservation-failed');
    },
  };
}
