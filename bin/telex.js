#!/usr/bin/env node
import { main } from '../src/cli.js';
import { reportError } from '../src/errors.js';

main(process.argv.slice(2)).catch(reportError);
