import { getAdminUser } from './admin-auth.mjs';
import { eq, desc } from 'drizzle-orm';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import { db } from '../../db/index.ts';
import { freeBots } from '../../db/schema.ts';

export const config = { path: '/api/*' };
import { createBotHandler } from './bot-handler.mjs';
export default createBotHandler({ getAdminUser, db, freeBots, eq, desc, XMLValidator, XMLParser });
