#!/usr/bin/env node
import { createLspServer } from '../lib/lsp-server.mjs';

const server = createLspServer();
server.start();
