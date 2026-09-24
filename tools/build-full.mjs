#!/usr/bin/env node
// Compatibility entry point. The main builder now always uses the full runtime.
import { buildCLI } from './build.mjs';
buildCLI();
