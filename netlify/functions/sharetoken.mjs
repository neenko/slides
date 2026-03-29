import { getStore } from '@netlify/blobs';
import { randomUUID } from 'crypto';

export default async (req, context) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers });

  const { id } = context.params;
  const slideshows = getStore({ name: 'slideshows', consistency: 'strong' });
  const slideshow = await slideshows.get(id, { type: 'json' });
  if (!slideshow) return new Response('Not found', { status: 404, headers });

  // Reuse existing token if already generated
  let token = slideshow.shareToken;
  if (!token) {
    token = randomUUID().replace(/-/g, '');
    slideshow.shareToken = token;
    await slideshows.set(id, JSON.stringify(slideshow));

    const shares = getStore('shares');
    await shares.set(token, id);
  }

  return new Response(JSON.stringify({ token }), { headers });
};

export const config = { path: '/api/slideshows/:id/share' };
