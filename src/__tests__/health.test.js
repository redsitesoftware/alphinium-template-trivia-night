const request = require('supertest');
const { version } = require('../../package.json');
const { app } = require('../../server');

function buildApp() {
  return app;
}

describe('GET /api/health', () => {
  it('returns HTTP 200', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('response Content-Type includes application/json', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('response body contains status: ok', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.body.status).toBe('ok');
  });

  it('response body contains version matching package.json', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.body.version).toBe(version);
  });

  it('does not include uptime in the response', async () => {
    const res = await request(buildApp()).get('/api/health');
    expect(res.body).not.toHaveProperty('uptime');
  });
});
