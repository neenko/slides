import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers });

  const { token } = context.params;
  const shares = getStore({ name: 'shares', consistency: 'strong' });
  const slideshowId = await shares.get(token);
  if (!slideshowId) return new Response('Not found', { status: 404, headers });

  const slideshows = getStore({ name: 'slideshows', consistency: 'strong' });
  const slideshow = await slideshows.get(slideshowId, { type: 'json' });
  if (!slideshow) return new Response('Not found', { status: 404, headers });

  // Strip internal id and shareToken — recipient gets the content, not the edit key
  const { id: _id, shareToken: _token, ...data } = slideshow;
  return new Response(JSON.stringify(data), { headers });
};

export const config = { path: '/api/share/:token' };
