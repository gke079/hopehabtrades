const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function createBotHandler({ getAdminUser, db, freeBots, eq, desc, XMLValidator, XMLParser }) {
return async function handler(request) {
    const path = new URL(request.url).pathname;
    const needsAuth = path === '/api/bot-admin' || request.method !== 'GET';
    const user = needsAuth ? await getAdminUser(request) : null;
    const canManage = Array.isArray(user?.roles) && user.roles.includes('admin');
    if (path === '/api/bot-admin') return json({ canManage });
    const match = path.match(/^\/api\/free-bots(?:\/([a-f0-9-]{36}))?$/);
    if (!match) return json({ error: 'Not found' }, 404);
    const id = match[1];
    try {
        if (request.method === 'GET') {
            if (id) {
                const [bot] = await db.select().from(freeBots).where(eq(freeBots.id, id));
                return bot ? json(bot) : json({ error: 'Bot not found' }, 404);
            }
            return json(await db.select({ id: freeBots.id, name: freeBots.name, description: freeBots.description, updatedAt: freeBots.updatedAt }).from(freeBots).orderBy(desc(freeBots.updatedAt)));
        }
        if (!canManage) return json({ error: 'Sign in with an approved admin account to manage bots.' }, 403);
        if (request.headers.get('origin') !== new URL(request.url).origin) return json({ error: 'Invalid request origin' }, 403);
        if (request.method === 'DELETE' && id) {
            const deleted = await db.delete(freeBots).where(eq(freeBots.id, id)).returning({ id: freeBots.id });
            return deleted.length ? json({ deleted: true }) : json({ error: 'Bot not found' }, 404);
        }
        if ((request.method === 'POST' && !id) || (request.method === 'PUT' && id)) {
            if (Number(request.headers.get('content-length')) > 2200000) return json({ error: 'Upload must be under 2 MB' }, 413);
            let raw = '';
            let bytes = 0;
            const decoder = new TextDecoder();
            for await (const chunk of request.body) {
                bytes += chunk.byteLength;
                raw += decoder.decode(chunk, { stream: true });
                if (bytes > 2200000) return json({ error: 'Upload must be under 2 MB' }, 413);
            }
            raw += decoder.decode();
            let body;
            try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
            if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid bot data' }, 400);
            const { name, description = '', xml } = body;
            if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof description !== 'string' || description.length > 2000 || typeof xml !== 'string' || xml.length > 2000000) return json({ error: 'Provide a name (up to 120 characters), description (up to 2000), and bot XML under 2 MB.' }, 400);
            if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) return json({ error: 'Upload valid bot XML without document type declarations.' }, 400);
            const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
            if (!parsed.xml || !/<block\s[^>]*type=["']trade_definition["']/.test(xml)) return json({ error: 'The XML must contain a Blockly trading bot with a trade definition.' }, 400);
            const values = { name: name.trim(), description: description.trim(), xml, updatedAt: new Date() };
            const [bot] = id ? await db.update(freeBots).set(values).where(eq(freeBots.id, id)).returning() : await db.insert(freeBots).values(values).returning();
            return bot ? json(bot, id ? 200 : 201) : json({ error: 'Bot not found' }, 404);
        }
        return json({ error: 'Method not allowed' }, 405);
    } catch {
        return json({ error: 'The bot library is unavailable. Please try again.' }, 503);
    }
}
}
