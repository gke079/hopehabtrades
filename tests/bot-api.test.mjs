import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import { createBotHandler } from '../netlify/server/bot-handler.mjs';

const owner = { id: 'admin-user', roles: ['admin'] };
const botId = 'b88d2bd3-7201-4a67-aa56-9270887c9732';
const xml = '<xml><block type="trade_definition" /></xml>';
function setup(user) {
    let writes = 0;
    const rows = [{ id: botId, name: 'Imported bot' }];
    const result = { from: () => result, where: () => result, orderBy: async () => rows, returning: async () => rows, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
    const db = { select: () => result, insert: () => { writes++; return { values: () => result }; }, update: () => { writes++; return { set: () => result }; }, delete: () => { writes++; return result; } };
    return { handler: createBotHandler({ getAdminUser: async () => user, db, freeBots: {}, eq: () => {}, desc: () => {}, XMLValidator, XMLParser }), writes: () => writes };
}
function request(method, path = '', body = { name: 'Imported bot', xml }, origin = 'https://example.com') {
    return new Request(`https://example.com/api/free-bots${path}`, { method, headers: { origin, 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
}
test('public readers can list bots and fetch XML', async () => {
    const { handler, writes } = setup();
    assert.equal((await handler(request('GET'))).status, 200);
    assert.equal((await handler(request('GET', `/${botId}`))).status, 200);
    assert.equal(writes(), 0);
});
test('anonymous and non-admin users cannot mutate the library', async () => {
    for (const user of [undefined, { id: 'reader', roles: ['member'] }, { id: 'reader', userMetadata: { roles: ['admin'] } }]) {
        const { handler, writes } = setup(user);
        for (const [method, path] of [['POST', ''], ['PUT', `/${botId}`], ['DELETE', `/${botId}`]]) assert.equal((await handler(request(method, path))).status, 403);
        assert.equal(writes(), 0);
    }
});
test('verified admin can publish, update and delete', async () => {
    const { handler, writes } = setup(owner);
    assert.equal((await handler(request('POST'))).status, 201);
    assert.equal((await handler(request('PUT', `/${botId}`))).status, 200);
    assert.equal((await handler(request('DELETE', `/${botId}`))).status, 200);
    assert.equal(writes(), 3);
});
test('cross-origin requests and invalid XML cannot write', async () => {
    const { handler, writes } = setup(owner);
    assert.equal((await handler(request('POST', '', { name: 'Bot', xml }, 'https://untrusted.example'))).status, 403);
    for (const badXml of ['<xml>', '<html/>', '<!DOCTYPE xml><xml><block type="trade_definition"/></xml>']) assert.equal((await handler(request('POST', '', { name: 'Bot', xml: badXml }))).status, 400);
    assert.equal(writes(), 0);
});

test('admin access uses verified Identity app metadata and rejects expired or forged sessions', async () => {
    const { getAdminUser } = await import('../netlify/server/admin-auth.mjs');
    const authenticated = new Request('https://example.com/api/bot-admin', { headers: { cookie: 'nf_jwt=test-session' } });
    assert.equal(await getAdminUser(new Request('https://example.com/api/bot-admin'), () => { throw new Error('must not fetch'); }), null);
    assert.equal(await getAdminUser(authenticated, async () => new Response('', { status: 401 })), null);
    const ordinary = await getAdminUser(authenticated, async () => Response.json({ id: 'reader', user_metadata: { roles: ['admin'] } }));
    assert.deepEqual(ordinary.roles, []);
    const admin = await getAdminUser(authenticated, async (url, options) => {
        assert.equal(url, 'https://hopehabtrades.netlify.app/.netlify/identity/user');
        assert.equal(options.redirect, 'error');
        return Response.json({ id: 'approved-admin', app_metadata: { roles: ['admin'] } });
    });
    assert.deepEqual(admin.roles, ['admin']);
});
