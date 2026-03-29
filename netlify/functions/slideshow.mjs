import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET,PUT,DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const { id } = context.params;
  const store = getStore('slideshows');

  if (req.method === 'GET') {
    const data = await store.get(id, { type: 'json' });
    if (!data) return new Response('Not found', { status: 404, headers });
    return new Response(JSON.stringify(data), { headers });
  }

  if (req.method === 'PUT') {
    const existing = await store.get(id, { type: 'json' });
    if (!existing) return new Response('Not found', { status: 404, headers });
    const body = await req.json();
    const updated = {
      ...existing,
      title: body.title ?? existing.title,
      slides: body.slides ?? existing.slides,
      id,
      updatedAt: new Date().toISOString(),
    };
    await store.set(id, JSON.stringify(updated));
    return new Response(JSON.stringify(updated), { headers });
  }

  if (req.method === 'DELETE') {
    await store.delete(id);
    return new Response(null, { status: 204 });
  }

  return new Response('Method Not Allowed', { status: 405, headers });
};

export const config = { path: '/api/slideshows/:id' };
