import { getStore } from '@netlify/blobs';
import { randomUUID } from 'crypto';

export default async (req) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'Access-Control-Allow-Methods': 'GET,POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const store = getStore('slideshows');

  if (req.method === 'GET') {
    const { blobs } = await store.list();
    const slideshows = await Promise.all(
      blobs.map(async ({ key }) => {
        const data = await store.get(key, { type: 'json' });
        return data
          ? {
              id: key,
              title: data.title,
              createdAt: data.createdAt,
              slideCount: data.slides.length,
            }
          : null;
      })
    );
    return new Response(
      JSON.stringify(
        slideshows
          .filter(Boolean)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      ),
      { headers }
    );
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const id = randomUUID();
    const now = new Date().toISOString();
    const slideshow = {
      id,
      title: body.title || 'Untitled Slideshow',
      createdAt: now,
      updatedAt: now,
      slides: body.slides || [],
    };
    await store.set(id, JSON.stringify(slideshow));
    return new Response(JSON.stringify(slideshow), { status: 201, headers });
  }

  return new Response('Method Not Allowed', { status: 405, headers });
};

export const config = { path: '/api/slideshows' };
