// Version unique, lue dans package.json (affichée par --version et annoncée par le serveur MCP).
import { createRequire } from 'node:module';

export const VERSION = createRequire(import.meta.url)('../package.json').version;
